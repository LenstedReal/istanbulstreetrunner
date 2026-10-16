"""Synthesizes the game's sound effects and an Istanbul-flavoured music loop.

Everything is generated procedurally (no licensed samples): a plucked oud-like
melody in the Hijaz makam over a darbuka-style rhythm. Output: 22.05 kHz mono WAV.
Run: python3 scripts/gen_audio.py
"""
import math
import wave
from pathlib import Path

import numpy as np

SR = 22050
OUT = Path(__file__).resolve().parent.parent / "frontend" / "assets" / "audio"
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7)


def write(name: str, data: np.ndarray, gain: float = 0.9):
    data = np.clip(data / (np.max(np.abs(data)) + 1e-9) * gain, -1, 1)
    pcm = (data * 32767).astype("<i2")
    with wave.open(str(OUT / name), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(name, f"{len(data) / SR:.2f}s")


def env(n: int, a: float, d: float, s: float = 0.0, r: float = 0.0, sustain_level: float = 0.6):
    t = np.arange(n) / SR
    total = n / SR
    e = np.ones(n) * sustain_level
    e[t < a] = t[t < a] / max(a, 1e-6)
    dm = (t >= a) & (t < a + d)
    e[dm] = 1 - (1 - sustain_level) * (t[dm] - a) / max(d, 1e-6)
    rm = t > total - r
    if r > 0:
        e[rm] *= np.clip((total - t[rm]) / r, 0, 1)
    return e


def pluck(freq: float, dur: float, bright: float = 0.5) -> np.ndarray:
    """Karplus-Strong string, slightly detuned pair for an oud-like chorus."""
    n = int(dur * SR)
    out = np.zeros(n)
    for det in (1.0, 1.003):
        period = int(SR / (freq * det))
        buf = rng.uniform(-1, 1, period)
        y = np.zeros(n)
        for i in range(n):
            y[i] = buf[i % period]
            nxt = buf[(i + 1) % period]
            buf[i % period] = (buf[i % period] + nxt) * 0.5 * (0.994 + bright * 0.005)
        out += y
    return out * np.exp(-np.arange(n) / SR * 2.2)


def tone(freq: float, dur: float, harmonics=(1.0, 0.4, 0.15)) -> np.ndarray:
    t = np.arange(int(dur * SR)) / SR
    y = sum(a * np.sin(2 * math.pi * freq * (k + 1) * t) for k, a in enumerate(harmonics))
    return y


def dum(dur=0.25) -> np.ndarray:
    t = np.arange(int(dur * SR)) / SR
    f = 150 * np.exp(-t * 18) + 55
    return np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-t * 14)


def tek(dur=0.12) -> np.ndarray:
    n = int(dur * SR)
    noise = rng.uniform(-1, 1, n)
    # crude high-pass: difference filter
    hp = np.diff(noise, prepend=0)
    t = np.arange(n) / SR
    return (hp * 0.7 + np.sin(2 * math.pi * 900 * t) * 0.3) * np.exp(-t * 40)


def add(buf: np.ndarray, start: float, snd: np.ndarray, gain=1.0):
    i = int(start * SR)
    j = min(len(buf), i + len(snd))
    if j > i:
        buf[i:j] += snd[: j - i] * gain


# ----------------------------------------------------------------------------- SFX
# Jump: quick upward sweep with a soft body.
n = int(0.22 * SR)
t = np.arange(n) / SR
f = 320 + 520 * (t / t[-1]) ** 0.7
jump = np.sin(2 * math.pi * np.cumsum(f) / SR) * env(n, 0.005, 0.1, 0.5, 0.08)
jump += 0.3 * np.sin(2 * math.pi * np.cumsum(f * 2) / SR) * env(n, 0.005, 0.08, 0.3, 0.08)
write("jump.wav", jump, 0.7)

# Coin: bright two-note ding.
coin = np.zeros(int(0.32 * SR))
add(coin, 0.0, tone(1318.5, 0.3, (1.0, 0.5, 0.2)) * np.exp(-np.arange(int(0.3 * SR)) / SR * 14))
add(coin, 0.07, tone(1760.0, 0.25, (1.0, 0.45, 0.15)) * np.exp(-np.arange(int(0.25 * SR)) / SR * 12))
write("coin.wav", coin, 0.6)

# Crash: low thump + filtered noise + metallic rattle.
n = int(0.6 * SR)
t = np.arange(n) / SR
noise = rng.uniform(-1, 1, n)
lp = np.convolve(noise, np.ones(12) / 12, mode="same")
crash = lp * np.exp(-t * 7) * 0.9
crash += np.sin(2 * math.pi * (90 * np.exp(-t * 6) + 40) * t) * np.exp(-t * 9) * 1.2
crash += tone(2100, 0.6, (0.3, 0.2)) * np.exp(-t * 16) * 0.25
write("crash.wav", crash, 0.95)

# Power-up: rising arpeggio.
pu = np.zeros(int(0.5 * SR))
for i, fr in enumerate((523.25, 659.25, 783.99, 1046.5)):
    add(pu, i * 0.09, tone(fr, 0.3, (1.0, 0.35)) * np.exp(-np.arange(int(0.3 * SR)) / SR * 9))
write("powerup.wav", pu, 0.65)

# Shield break: glassy falling tone.
n = int(0.45 * SR)
t = np.arange(n) / SR
f = 1500 * np.exp(-t * 4) + 200
sb = np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
sb += np.convolve(rng.uniform(-1, 1, n), np.ones(3) / 3, mode="same") * np.exp(-t * 18) * 0.5
write("shield.wav", sb, 0.7)

# Lane swipe: short whoosh.
n = int(0.16 * SR)
t = np.arange(n) / SR
noise = rng.uniform(-1, 1, n)
whoosh = np.convolve(noise, np.ones(6) / 6, mode="same") * np.abs(np.sin(math.pi * t / t[-1])) ** 1.5
write("swipe.wav", whoosh, 0.45)

# Roll: low scrape.
n = int(0.3 * SR)
t = np.arange(n) / SR
noise = rng.uniform(-1, 1, n)
roll = np.convolve(noise, np.ones(20) / 20, mode="same") * np.exp(-t * 9)
write("roll.wav", roll, 0.5)

# ------------------------------------------------------------------------- MUSIC
# Hijaz on D: D Eb F# G A Bb C. 112 BPM, 16 bars of 4/4 -> exact loop length.
BPM = 112
beat = 60 / BPM
bars = 16
length = bars * 4 * beat
music = np.zeros(int(length * SR) + 1)

D4 = 293.66
hijaz = [D4, D4 * 16 / 15, D4 * 5 / 4, D4 * 4 / 3, D4 * 3 / 2, D4 * 8 / 5, D4 * 16 / 9, D4 * 2]
# melody as (degree index, duration in beats); degree 7 = octave
phraseA = [(0, 1), (1, 0.5), (2, 0.5), (3, 1), (2, 0.5), (1, 0.5), (0, 1), (4, 1), (3, 0.5), (2, 0.5), (1, 1), (0, 2)]
phraseB = [(4, 1), (5, 0.5), (4, 0.5), (3, 1), (2, 0.5), (3, 0.5), (4, 1), (7, 1), (6, 0.5), (5, 0.5), (4, 1), (3, 2)]
phraseC = [(7, 0.5), (6, 0.5), (5, 0.5), (4, 0.5), (3, 1), (2, 1), (1, 0.5), (2, 0.5), (3, 0.5), (1, 0.5), (0, 2), (0, 2)]
melody = (phraseA + phraseB) * 2 + (phraseC + phraseA) * 2
pos = 0.0
for deg, dur in melody:
    if pos >= length:
        break
    fr = hijaz[deg]
    add(music, pos, pluck(fr, min(dur * beat * 1.1, 1.6), 0.6), 0.5)
    # occasional grace note (çarpma) a step below
    if dur >= 1 and deg > 0 and rng.random() < 0.35:
        add(music, pos - 0.06 if pos > 0.06 else 0, pluck(hijaz[deg - 1], 0.12, 0.6), 0.25)
    pos += dur * beat

# Bass / drone on D and A alternating per bar
for b in range(bars):
    root = D4 / 2 if b % 4 != 3 else D4 * 3 / 4
    add(music, b * 4 * beat, pluck(root, 1.8, 0.2), 0.45)
    add(music, (b * 4 + 2) * beat, pluck(root, 1.4, 0.2), 0.35)

# Darbuka: maqsum rhythm  D - T - - T D - T - (per bar, 8ths)
pattern = ["D", "", "T", "", "", "T", "D", "", "T", "", "T", "", "D", "", "T", "T"]
for b in range(bars):
    for k, hit in enumerate(pattern):
        tpos = b * 4 * beat + k * beat / 4
        if hit == "D":
            add(music, tpos, dum(), 0.9)
        elif hit == "T":
            add(music, tpos, tek(), 0.45 if k % 2 else 0.6)

# Seamless loop: equal-power crossfade of the tail into the head (150 ms).
xf = int(0.15 * SR)
head = music[:xf].copy()
tail = music[-xf:].copy()
w = np.linspace(0, 1, xf)
music[:xf] = head * np.sqrt(w) + tail * np.sqrt(1 - w)
music = music[: int(length * SR)]
write("music_loop.wav", music, 0.85)
