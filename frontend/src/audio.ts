import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";

export type SfxName = "jump" | "coin" | "crash" | "powerup" | "shield" | "swipe" | "roll";

const SFX_SOURCES: Record<SfxName, number> = {
  jump: require("../assets/audio/jump.wav"),
  coin: require("../assets/audio/coin.wav"),
  crash: require("../assets/audio/crash.wav"),
  powerup: require("../assets/audio/powerup.wav"),
  shield: require("../assets/audio/shield.wav"),
  swipe: require("../assets/audio/swipe.wav"),
  roll: require("../assets/audio/roll.wav"),
};
const MUSIC_VOLUME = 0.42;
const CROSSFADE_S = 2.2; // seamless loop: next pass fades in before the current one ends

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  source: number;
}

/** NoCopyrightSounds releases (ncs.io). Credits are shown in Settings. */
export const MUSIC_TRACKS: MusicTrack[] = [
  { id: "invincible", title: "Invincible", artist: "DEAF KEV", source: require("../assets/audio/music/invincible.mp3") },
  { id: "fearless2", title: "Fearless pt. II", artist: "Lost Sky feat. Chris Linton", source: require("../assets/audio/music/fearless2.mp3") },
  { id: "skyhigh", title: "Sky High", artist: "Elektronomia", source: require("../assets/audio/music/skyhigh.mp3") },
  { id: "mortals", title: "Mortals", artist: "Warriyo feat. Laura Brehm", source: require("../assets/audio/music/mortals.mp3") },
  { id: "royalty", title: "Royalty", artist: "Egzod, Maestro Chives & Neoni", source: require("../assets/audio/music/royalty.mp3") },
];
export const DEFAULT_TRACK = MUSIC_TRACKS[0].id;

/**
 * Tiny audio manager on top of expo-audio. Coins fire fast, so they rotate
 * through a few players to allow overlapping dings. Music uses two players
 * per track and crossfades the tail into the head so the loop is seamless.
 */
class AudioManager {
  private sfx = new Map<SfxName, AudioPlayer[]>();
  private cursor = new Map<SfxName, number>();
  private music: [AudioPlayer, AudioPlayer] | null = null;
  private active = 0;
  private trackId = DEFAULT_TRACK;
  private wantPlaying = false;
  private ducked = false;
  private loopTimer: ReturnType<typeof setInterval> | null = null;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private fading = false;
  private ready = false;
  soundOn = true;
  musicOn = true;

  async init() {
    if (this.ready) return;
    this.ready = true;
    try {
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: "mixWithOthers" });
    } catch {
      /* web / unsupported */
    }
    try {
      (Object.keys(SFX_SOURCES) as SfxName[]).forEach((name) => {
        const count = name === "coin" ? 4 : name === "swipe" ? 2 : 1;
        const players: AudioPlayer[] = [];
        for (let i = 0; i < count; i++) {
          const p = createAudioPlayer(SFX_SOURCES[name]);
          p.volume = name === "coin" ? 0.55 : name === "swipe" || name === "roll" ? 0.5 : 0.85;
          players.push(p);
        }
        this.sfx.set(name, players);
        this.cursor.set(name, 0);
      });
      if (!this.music) this.loadTrack(this.trackId);
    } catch (e) {
      console.warn("[audio] init failed", e);
    }
  }

  private loadTrack(id: string) {
    const track = MUSIC_TRACKS.find((t) => t.id === id) ?? MUSIC_TRACKS[0];
    this.trackId = track.id;
    this.clearFade();
    this.music?.forEach((p) => {
      try {
        p.pause();
        p.seekTo(0);
      } catch {
        /* player may already be released */
      }
      try {
        p.remove();
      } catch {
        /* player may already be released */
      }
    });
    this.music = null;
    const a = createAudioPlayer(track.source);
    const b = createAudioPlayer(track.source);
    a.volume = this.targetVolume();
    b.volume = 0;
    this.music = [a, b];
    this.active = 0;
    this.fading = false;
    if (!this.loopTimer) this.loopTimer = setInterval(() => this.tickLoop(), 200);
  }

  private targetVolume() {
    return this.ducked ? MUSIC_VOLUME * 0.4 : MUSIC_VOLUME;
  }

  private clearFade(resetVolumes = false) {
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    this.fadeTimer = null;
    this.fading = false;
    if (resetVolumes && this.music) {
      this.music[this.active].volume = this.targetVolume();
      this.music[1 - this.active].volume = 0;
    }
  }

  /** Crossfade into the second player shortly before the first one ends. */
  private tickLoop() {
    if (!this.music || !this.wantPlaying || this.fading) return;
    const cur = this.music[this.active];
    const dur = cur.duration;
    if (!dur || dur <= 0 || !cur.playing) return;
    if (cur.currentTime < dur - CROSSFADE_S) return;
    this.fading = true;
    const next = this.music[1 - this.active];
    try {
      next.seekTo(0);
      next.volume = 0;
      next.play();
    } catch {
      /* ignore */
    }
    const steps = Math.round((CROSSFADE_S * 1000) / 60);
    let i = 0;
    this.fadeTimer = setInterval(() => {
      i++;
      const k = Math.min(1, i / steps);
      const vol = this.targetVolume();
      cur.volume = vol * (1 - k);
      next.volume = vol * k;
      if (k >= 1) {
        if (this.fadeTimer) clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        try {
          cur.pause();
          cur.seekTo(0);
        } catch {
          /* ignore */
        }
        this.active = 1 - this.active;
        this.fading = false;
      }
    }, 60);
  }

  get currentTrackId() {
    return this.trackId;
  }

  setTrack(id: string) {
    if (id === this.trackId && this.music) return;
    const wasPlaying = this.wantPlaying;
    this.loadTrack(id);
    if (wasPlaying) this.startMusic();
  }

  play(name: SfxName) {
    if (!this.soundOn) return;
    const players = this.sfx.get(name);
    if (!players?.length) return;
    const i = this.cursor.get(name) ?? 0;
    this.cursor.set(name, (i + 1) % players.length);
    const p = players[i];
    try {
      p.seekTo(0);
      p.play();
    } catch {
      /* ignore */
    }
  }

  startMusic() {
    this.wantPlaying = true;
    this.ducked = false;
    if (!this.musicOn || !this.music) return;
    const cur = this.music[this.active];
    try {
      cur.volume = this.targetVolume();
      if (!cur.playing) cur.play();
    } catch {
      /* autoplay blocked on web until first gesture */
    }
  }

  pauseMusic() {
    this.wantPlaying = false;
    this.clearFade(true);
    try {
      this.music?.forEach((p) => p.pause());
    } catch {
      /* ignore */
    }
  }

  /** Lower the music under the game over sheet. */
  duckMusic() {
    this.ducked = true;
    if (this.music) this.music[this.active].volume = this.targetVolume();
  }

  setSound(on: boolean) {
    this.soundOn = on;
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (on) {
      if (this.wantPlaying) this.startMusic();
    } else {
      this.clearFade(true);
      try {
        this.music?.forEach((p) => p.pause());
      } catch {
        /* ignore */
      }
    }
  }

  dispose() {
    this.clearFade();
    if (this.loopTimer) clearInterval(this.loopTimer);
    this.loopTimer = null;
    this.sfx.forEach((players) => players.forEach((p) => p.remove()));
    this.sfx.clear();
    this.music?.forEach((p) => p.remove());
    this.music = null;
    this.ready = false;
  }
}

export const audio = new AudioManager();
