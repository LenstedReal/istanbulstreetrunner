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
  /** Track name, Turkish and English. */
  title: { tr: string; en: string };
  /** Credit line under the name, Turkish and English. */
  artist: { tr: string; en: string };
  source: number;
}

/**
 * Original music written for the game by LenstedReal (2.0.1). Every track belongs to the developer; nothing is
 * licensed from a third party, so there is no attribution requirement beyond the credit shown in Settings.
 */
export const MUSIC_TRACKS: MusicTrack[] = [
  {
    id: "istiklal_kosusu",
    title: { tr: "İstiklal Koşusu", en: "Istiklal Run" },
    artist: { tr: "LenstedReal feat. Kırmızı Tramvay", en: "LenstedReal feat. Red Tram" },
    source: require("../assets/audio/music/istiklal_kosusu.mp3"),
  },
  {
    id: "galata_ruzgari",
    title: { tr: "Galata Rüzgârı", en: "Galata Breeze" },
    artist: { tr: "LenstedReal & Galata Kulesi", en: "LenstedReal & Galata Tower" },
    source: require("../assets/audio/music/galata_ruzgari.mp3"),
  },
  {
    id: "bogaz_isiklari",
    title: { tr: "Boğaz Işıkları", en: "Bosphorus Lights" },
    artist: { tr: "LenstedReal feat. Boğaz Martıları", en: "LenstedReal feat. Bosphorus Gulls" },
    source: require("../assets/audio/music/bogaz_isiklari.mp3"),
  },
  {
    id: "sirkeci_ekspres",
    title: { tr: "Sirkeci Ekspres", en: "Sirkeci Express" },
    artist: { tr: "LenstedReal x Sirkeci Garı", en: "LenstedReal x Sirkeci Station" },
    source: require("../assets/audio/music/sirkeci_ekspres.mp3"),
  },
  {
    id: "ortakoy_gecesi",
    title: { tr: "Ortaköy Gecesi", en: "Ortaköy Nights" },
    artist: { tr: "LenstedReal feat. Ortaköy Simitçisi", en: "LenstedReal feat. Ortaköy Simit Seller" },
    source: require("../assets/audio/music/ortakoy_gecesi.mp3"),
  },
];
export const DEFAULT_TRACK = MUSIC_TRACKS[0].id;

/** A saved track id, or the default when the id is unknown (the 2.0.0 tracks are gone). */
export function knownTrack(id: unknown): string {
  return typeof id === "string" && MUSIC_TRACKS.some((t) => t.id === id) ? id : DEFAULT_TRACK;
}

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
    const known = knownTrack(id);
    if (known === this.trackId && this.music) return;
    const wasPlaying = this.wantPlaying;
    this.loadTrack(known);
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
