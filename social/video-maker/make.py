#!/usr/bin/env python3
"""Build one Crease Cam short from a JSON spec.

usage: python3 make.py videos/<id>.json   ->  out/<id>.mp4

Steps: original beat (seeded, hits on every cut) -> Kokoro narrator line per
scene -> ffmpeg mix (beat ducks under the voice) -> Remotion render.
Needs: kokoro-onnx soundfile numpy, ffmpeg, node deps, and the Kokoro model
files in $KOKORO_DIR (default ../tts).
"""
import json, os, subprocess, sys, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
KOKORO = os.environ.get("KOKORO_DIR", os.path.join(HERE, "..", "tts"))
SR = 44100

spec_path = sys.argv[1]
spec = json.load(open(spec_path))
vid = spec["id"]
scenes = spec["scenes"]
starts, t = [], 0.0
for s in scenes:
    starts.append(t)
    t += round(s["dur"] * 30) / 30
total = t
print(f"{vid}: {len(scenes)} scenes, {total:.1f}s")
assert 15 <= total <= 26, "keep shorts 20-25s"

# ---------- beat ----------
seed = spec.get("seed", abs(hash(vid)) % 1000)
rng = np.random.default_rng(seed)
bpm = spec.get("bpm", int(rng.choice([96, 100, 104, 110, 118])))
beat = 60 / bpm; bar = beat * 4
n = int(SR * (total + 0.2)); out = np.zeros((n, 2))

def add(sig, start, ch=(1, 1)):
    i = int(start * SR); j = min(n, i + len(sig))
    if i >= n or j <= i: return
    out[i:j, 0] += sig[:j - i] * ch[0]; out[i:j, 1] += sig[:j - i] * ch[1]

note = lambda m: 440 * 2 ** ((m - 69) / 12)
saw = lambda f, tt: 2 * ((f * tt) % 1) - 1
PROGS = [
    ([[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], [33, 29, 36, 31]),  # Am F C G
    ([[48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60]], [36, 31, 33, 29]),  # C G Am F
    ([[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], [38, 34, 41, 36]),  # Dm Bb F C
    ([[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]], [40, 36, 43, 38]),  # Em C G D
]
chords, bass = PROGS[seed % len(PROGS)]
# drums drop out during "card" scenes for a beat-drop feel
quiet = [(st, st + s["dur"]) for st, s in zip(starts, scenes) if s["type"] == "card" and s.get("drop", True)]
in_quiet = lambda x: any(a <= x < b for a, b in quiet)

k = 0; s0 = 0.0
while s0 < total:
    c = chords[k % 4]
    for e in range(8):
        if e % 2 == 1:
            m = int(0.18 * SR); tt = np.arange(m) / SR
            st = sum(saw(note(x + 12), tt) for x in c) * np.exp(-tt * 14)
            add(0.035 * st, s0 + e * beat / 2, (0.8, 1.0))
    m = int(bar * SR); tt = np.arange(m) / SR
    add(0.18 * np.sin(2 * np.pi * note(bass[k % 4] + 12) * tt) * np.exp(-((tt % beat) * 3)), s0)
    k += 1; s0 += bar
s0 = 0.0; i = 0
kick_pat = [(0, 3, 4), (0, 4, 6), (0, 2, 3, 4)][seed % 3]
while s0 < total:
    pos = i % 8
    if not in_quiet(s0):
        if pos in kick_pat:
            tk = np.arange(int(0.3 * SR)) / SR; f = 45 + 110 * np.exp(-tk * 35)
            add(0.55 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tk * 10), s0)
        if pos in (2, 6):
            m = int(0.22 * SR); ts = np.arange(m) / SR
            add(0.2 * (rng.standard_normal(m) * 0.7 + 0.5 * np.sin(2 * np.pi * 200 * ts)) * np.exp(-ts * 16), s0)
    m = int(0.04 * SR); th = np.arange(m) / SR
    add(0.04 * np.diff(rng.standard_normal(m + 1)) * np.exp(-th * 90), s0, (0.6, 1.0))
    i += 1; s0 += beat / 2
for st in starts:  # impact on every cut
    tk = np.arange(int(0.6 * SR)) / SR; f = 35 + 80 * np.exp(-tk * 20)
    add(0.5 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tk * 5), st)
    m = int(0.35 * SR); w = rng.standard_normal(m) * np.linspace(1, 0, m) ** 2
    add(0.12 * np.convolve(w, np.ones(8) / 8, "same"), max(0, st - 0.05))
for a, _ in quiet:  # record scratch into each drop
    m = int(0.45 * SR); tt = np.arange(m) / SR
    f = 900 * np.abs(np.sin(2 * np.pi * 3.3 * tt)) + 200
    add(0.15 * np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.exp(-tt * 3) + 0.1 * rng.standard_normal(m) * np.exp(-tt * 6), a)
for ch in range(2): out[:, ch] = np.convolve(out[:, ch], np.ones(3) / 3, "same")
fade = np.ones(n); fo = int(1.0 * SR); fade[-fo:] = np.linspace(1, 0, fo); out *= fade[:, None]
out /= np.max(np.abs(out)) * 1.1
os.makedirs(os.path.join(HERE, "build"), exist_ok=True)
beat_wav = os.path.join(HERE, "build", f"{vid}-beat.wav")
w = wave.open(beat_wav, "wb"); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((out * 32767).astype("<i2").tobytes()); w.close()

# ---------- narrator ----------
import soundfile as sf
from kokoro_onnx import Kokoro
kk = Kokoro(os.path.join(KOKORO, "kokoro-v1.0.onnx"), os.path.join(KOKORO, "voices-v1.0.bin"))
voice = spec.get("voice", "bm_george")
vsr = 24000; vo = np.zeros(int(vsr * (total + 0.2)))
for st, s in zip(starts, scenes):
    txt = s.get("vo")
    if not txt: continue
    win = s["dur"] - 0.15; sp = spec.get("speed", 1.15)
    for _ in range(8):
        a, vsr = kk.create(txt, voice=voice, speed=sp, lang="en-gb")
        idx = np.where(np.abs(a) > 0.01)[0]; a = a[idx[0]:idx[-1] + 1]
        if len(a) / vsr <= win or sp >= 1.6: break
        sp += 0.08
    flag = "" if len(a) / vsr <= win else "  <-- TOO LONG, shorten this line"
    print(f"  {txt[:44]:44s} {len(a)/vsr:4.2f}s/{win:.2f}s x{sp:.2f}{flag}")
    j = int((st + 0.05) * vsr); vo[j:j + len(a)] += a[:len(vo) - j]
vo /= np.max(np.abs(vo)) * 1.05
vo_wav = os.path.join(HERE, "build", f"{vid}-vo.wav")
sf.write(vo_wav, vo, vsr)

# ---------- mix ----------
mix = f"mix-{vid}.wav"
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", beat_wav, "-i", vo_wav, "-filter_complex",
    "[1:a]aresample=44100,pan=stereo|c0=c0|c1=c0,volume=1.6,asplit=2[v1][v2];"
    "[0:a][v1]sidechaincompress=threshold=0.04:ratio=6:attack=20:release=300[duck];"
    "[duck]volume=0.55[bd];[bd][v2]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[o]",
    "-map", "[o]", "-ar", "44100", os.path.join(HERE, "public", mix)], check=True)

# ---------- render ----------
props = dict(spec, audio=mix)
props_path = os.path.join(HERE, "build", f"{vid}-props.json")
json.dump(props, open(props_path, "w"))
chrome = subprocess.run("ls -d /opt/pw-browsers/chromium_headless_shell-*/*/ | head -1", shell=True, capture_output=True, text=True).stdout.strip()
os.makedirs(os.path.join(HERE, "out"), exist_ok=True)
cmd = ["npx", "remotion", "render", "src/index.ts", "Spec", f"out/{vid}.mp4", f"--props={props_path}", "--log=error"]
if chrome: cmd.append(f"--browser-executable={chrome}headless_shell")
subprocess.run(cmd, cwd=HERE, check=True)
print("done:", os.path.join(HERE, "out", f"{vid}.mp4"))
