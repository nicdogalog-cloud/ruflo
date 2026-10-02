"""Jarvis's ears and mouth.

Ears: an energy-based end-of-speech detector (Endpointer) cuts nic's turn out
of the mic stream, then faster-whisper turns it into text on this laptop's
CPU. Mouth: edge-tts (Microsoft's natural "Ryan" British voice, needs the
internet) played with Windows' built-in player, or the offline Windows voice
(SAPI) if that fails.
"""

import asyncio
import os
import subprocess
import sys
import tempfile
import time

import numpy as np

SAMPLE_RATE = 16000
FRAME = 1280                 # 80 ms
FRAME_SECONDS = FRAME / SAMPLE_RATE
VOICE = "en-GB-RyanNeural"
HINT = ("Jarvis, Crease Cam, Nova, Forge, Pixel, Atlas, Sol, Ledger, Cog, "
        "Wicket, Buzz, nets, Instagram.")


def log(msg):
    try:
        print(time.strftime("%Y-%m-%d %H:%M:%S"), msg, flush=True)
    except Exception:
        pass


def rms(frame):
    f = np.asarray(frame, dtype=np.float32)
    return float(np.sqrt(np.mean(f * f))) if f.size else 0.0


class Endpointer:
    """Feeds 80 ms int16 frames; returns the whole utterance when nic stops.

    Learns the room's background level, starts when the sound is clearly
    above it for a moment, ends after ~0.9 s of quiet. Keeps a little audio
    from just before the start so first words are not clipped.
    """

    def __init__(self, start_frames=3, end_silence=0.9, max_seconds=25.0,
                 pre_roll=4, min_start=450.0, min_keep=280.0):
        self.start_frames = start_frames
        self.end_frames = int(round(end_silence / FRAME_SECONDS))
        self.max_frames = int(max_seconds / FRAME_SECONDS)
        self.pre_roll = pre_roll
        self.min_start = min_start
        self.min_keep = min_keep
        self.noise = 150.0
        self.reset()

    def reset(self):
        self.recent = []
        self.frames = []
        self.loud_run = 0
        self.quiet_run = 0
        self.voiced = 0
        self.speaking = False

    def feed(self, frame):
        level = rms(frame)
        start_at = max(self.min_start, self.noise * 3.0)
        keep_at = max(self.min_keep, self.noise * 2.0)
        if not self.speaking:
            # slowly track the background level while nobody talks
            self.noise = 0.95 * self.noise + 0.05 * min(level, 3000.0)
            self.recent = (self.recent + [frame])[-(self.pre_roll + self.start_frames):]
            self.loud_run = self.loud_run + 1 if level >= start_at else 0
            if self.loud_run >= self.start_frames:
                self.speaking = True
                self.frames = list(self.recent)
                self.voiced = self.loud_run
                self.quiet_run = 0
            return None
        self.frames.append(frame)
        if level >= keep_at:
            self.quiet_run = 0
            self.voiced += 1
        else:
            self.quiet_run += 1
        if self.quiet_run >= self.end_frames or len(self.frames) >= self.max_frames:
            audio = np.concatenate(self.frames)
            voiced = self.voiced
            self.reset()
            if voiced < 5:          # under ~0.4 s of real sound: a cough, a click
                return None
            return audio
        return None


class Ears:
    def __init__(self, model_name="base.en", download_root=None):
        from faster_whisper import WhisperModel
        opts = dict(device="cpu", compute_type="int8", download_root=download_root)
        try:   # downloaded by the installer: no need to touch the internet
            self.model = WhisperModel(model_name, local_files_only=True, **opts)
        except Exception:
            self.model = WhisperModel(model_name, **opts)

    def transcribe(self, audio_int16):
        audio = audio_int16.astype(np.float32) / 32768.0
        segments, _ = self.model.transcribe(
            audio, language="en", beam_size=1, vad_filter=False,
            condition_on_previous_text=False, initial_prompt=HINT)
        words = [s.text for s in segments
                 if s.no_speech_prob < 0.6 and s.avg_logprob > -1.0]
        return " ".join(" ".join(words).split())


# ------------------------------------------------------------------ mouth --

def _mci(cmd):
    import ctypes
    buf = ctypes.create_unicode_buffer(256)
    err = ctypes.windll.winmm.mciSendStringW(cmd, buf, 255, 0)
    return err, buf.value


def play_mp3(path):
    """Windows' built-in MCI player: plays an mp3 and waits until done."""
    if sys.platform != "win32":
        log("(would play %s)" % path)
        return True
    _mci("close jarvis_say")
    err, _ = _mci('open "%s" type mpegvideo alias jarvis_say' % path)
    if err:
        return False
    try:
        err, _ = _mci("play jarvis_say wait")
        return not err
    finally:
        _mci("close jarvis_say")


def say_sapi(text):
    """Offline fallback: the voice built into Windows."""
    if sys.platform != "win32":
        log("(would say) " + text)
        return
    ps = ("Add-Type -AssemblyName System.Speech;"
          "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer;"
          "try{$s.SelectVoiceByHints('Male',"
          "[System.Speech.Synthesis.VoiceAge]::Adult,0,"
          "[Globalization.CultureInfo]'en-GB')}catch{};"
          "$s.Rate=1;$s.Speak([Console]::In.ReadToEnd())")
    subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                   input=text.encode("utf-8"), timeout=120,
                   creationflags=0x08000000)  # no console window


class Mouth:
    def __init__(self, voice=VOICE, work_dir=None):
        self.voice = voice
        self.work_dir = work_dir or tempfile.gettempdir()
        self.n = 0

    def _edge(self, text, path):
        import edge_tts

        async def go():
            await edge_tts.Communicate(text, self.voice, rate="+4%").save(path)
        asyncio.run(asyncio.wait_for(go(), timeout=12))

    def say(self, text):
        if not text:
            return
        self.n = (self.n + 1) % 2
        path = os.path.join(self.work_dir, "jarvis_say_%d.mp3" % self.n)
        try:
            self._edge(text, path)
            if play_mp3(path):
                return
            log("Could not play the voice file; using the Windows voice")
        except Exception as e:
            log("Online voice failed (%s); using the Windows voice" % type(e).__name__)
        try:
            say_sapi(text)
        except Exception as e:
            log("Windows voice failed too: %s" % e)
