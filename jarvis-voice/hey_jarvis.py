"""Hey Jarvis v3 - say "Hey Jarvis" and talk to Jarvis.

Runs quietly in the background (tray icon near the clock). "Hey Jarvis"
opens the Jarvis page and starts a spoken conversation: Jarvis greets nic
with the company rundown, then it is a normal back-and-forth with no wake
word needed. "Jarvis off", "turn off", "that's all" or "goodbye" ends it.
nic can talk over Jarvis to cut him off.

Listening for the wake word and turning speech into text both happen on
this laptop; audio is never saved or uploaded. Only the text of what nic
says goes to Claude, through Claude Code signed in with nic's own account
(OmniRoute on this laptop is only an optional fallback).
"""

import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import json
import webbrowser

JARVIS_URL = "https://claude.ai/artifact/P3CTySxt9483kk4qJvNTQM"
THRESHOLD = 0.5          # how sure the model must be (0..1)
COOLDOWN_SECONDS = 5.0   # ignore the mic for this long after a detection
MIN_REOPEN_SECONDS = 10.0  # never open two windows closer together than this
SAMPLE_RATE = 16000
FRAME = 1280             # 80 ms of audio, what openWakeWord expects
LOCK_PORT = 47613        # used only to stop two copies running at once

APP_DIR = os.path.join(
    os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "HeyJarvis")
LOG_PATH = os.path.join(APP_DIR, "hey_jarvis.log")
CONFIG_PATH = os.path.join(APP_DIR, "config.json")
SILENCE_TIMEOUT = 45.0   # nic quiet this long -> conversation ends
BRAIN_DIR = os.path.join(APP_DIR, "brain")
DEFAULT_CONFIG = {
    "model": "haiku",
    "allowed_tools": [],
    "blocked_tools": [],
    "omniroute_fallback": True,
    "omniroute_url": "http://localhost:20128",
    "omniroute_key": "",
    "models": ["oc/deepseek-v4-flash-free", "oc/mimo-v2.5-free", "oc/hy3-free"],
    "voice": "en-GB-RyanNeural",
    "voice_rate": "-6%",
    "voice_pitch": "-4Hz",
    "whisper_model": "base.en",
    "open_page_on_wake": True,
    "barge_in": True,
    "barge_in_level": 1800,
    "end_silence": 0.6,
    "filler_after_seconds": 2.5,
}


def setup_logging():
    """pythonw has no console; send text output to a small log file."""
    try:
        os.makedirs(APP_DIR, exist_ok=True)
        if os.path.exists(LOG_PATH) and os.path.getsize(LOG_PATH) > 200_000:
            os.replace(LOG_PATH, LOG_PATH + ".old")
        f = open(LOG_PATH, "a", encoding="utf-8", buffering=1)
        if sys.stdout is None or not sys.stdout.isatty():
            sys.stdout = f
        if sys.stderr is None or not sys.stderr.isatty():
            sys.stderr = f
    except OSError:
        pass


def log(msg):
    try:
        print(time.strftime("%Y-%m-%d %H:%M:%S"), msg, flush=True)
    except Exception:
        pass


def load_config():
    """config.json next to the program. Written once with defaults; edits kept."""
    cfg = dict(DEFAULT_CONFIG)
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            cfg.update(json.load(f))
    except FileNotFoundError:
        try:
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(DEFAULT_CONFIG, f, indent=2)
        except OSError:
            pass
    except (OSError, ValueError) as e:
        log("config.json unreadable (%s); using defaults" % e)
    cfg["omniroute_key"] = os.environ.get("OMNIROUTE_KEY") or cfg.get("omniroute_key", "")
    return cfg


def find_edge():
    candidates = [shutil.which("msedge")]
    for var in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"):
        base = os.environ.get(var)
        if base:
            candidates.append(os.path.join(
                base, "Microsoft", "Edge", "Application", "msedge.exe"))
    for c in candidates:
        if c and os.path.isfile(c):
            return c
    return None


def open_jarvis(url=JARVIS_URL):
    """Open the page as an Edge app window, else in the default browser."""
    edge = find_edge()
    if edge:
        try:
            subprocess.Popen([edge, "--app=" + url], close_fds=True)
            log("Opened Jarvis in Edge app window")
            return "edge"
        except OSError as e:
            log("Edge failed (%s), using default browser" % e)
    webbrowser.open(url)
    log("Opened Jarvis in default browser")
    return "browser"


class WakeTrigger:
    """Turns a stream of model scores into at most one 'open' per cooldown.

    score_fn(frame) -> float, opener() opens the page, reset_fn() clears
    the model's internal buffers, clock() returns seconds.
    """

    def __init__(self, score_fn, opener, reset_fn=None, clock=time.monotonic,
                 threshold=THRESHOLD, cooldown=COOLDOWN_SECONDS,
                 min_reopen=MIN_REOPEN_SECONDS):
        self.score_fn = score_fn
        self.opener = opener
        self.reset_fn = reset_fn
        self.clock = clock
        self.threshold = threshold
        self.cooldown = cooldown
        self.min_reopen = min_reopen
        self.ignore_until = -1e18
        self.last_open = -1e18
        self.paused = False

    def feed(self, frame):
        """Process one 80 ms frame. Returns True if the page was opened."""
        if self.paused:
            return False
        now = self.clock()
        if now < self.ignore_until:
            return False
        score = self.score_fn(frame)
        if score < self.threshold:
            return False
        log("Heard 'Hey Jarvis' (score %.2f)" % score)
        self.ignore_until = now + self.cooldown
        if self.reset_fn:
            self.reset_fn()
        if now - self.last_open < self.min_reopen:
            log("Window opened moments ago; not opening another")
            return False
        self.last_open = now
        self.opener()
        return True


def load_model():
    import openwakeword
    from openwakeword.model import Model
    try:
        return Model(wakeword_models=["hey_jarvis"], inference_framework="onnx")
    except Exception as e:  # models missing: fetch them once, then retry
        log("Model not ready (%s); downloading models" % e)
        openwakeword.utils.download_models(model_names=["hey_jarvis"])
        return Model(wakeword_models=["hey_jarvis"], inference_framework="onnx")


def make_score_fn(model):
    key = next(iter(model.models))

    def score(frame):
        return float(model.predict(frame).get(key, 0.0))
    return score


def flush(stream):
    """Drop audio that piled up while Jarvis was talking or thinking."""
    try:
        n = stream.read_available
        if n > 0:
            stream.read(n)
    except Exception:
        pass


def run_conversation(stream, convo, ears, mouth, trigger, stop_event, cfg=None):
    """One conversation: greet, then listen/answer until a stop phrase.

    While Jarvis speaks the mic keeps listening; if nic talks over him the
    voice stops and nic's words become the next turn (barge-in).
    """
    from jarvis_voice import BargeIn, Endpointer, FRAME_SECONDS
    from jarvis_brain import ask_with_filler, is_noise
    cfg = cfg or {}
    barger = BargeIn(min_level=float(cfg.get("barge_in_level", 1800)))
    ender = Endpointer(end_silence=float(cfg.get("end_silence", 0.6)))

    def interrupt():
        data, _ = stream.read(FRAME)
        return barger.feed(data[:, 0].copy())

    def speak(text):
        barger.reset()
        use = interrupt if cfg.get("barge_in", True) else None
        if mouth.say(text, use):
            log("nic talked over Jarvis; listening")
            return list(barger.buffer)
        return None

    def think(fn):
        return ask_with_filler(fn, lambda t: mouth.say(t),
                               float(cfg.get("filler_after_seconds", 2.5)))

    heard = speak(think(convo.wake))
    while convo.active and not stop_event.is_set():
        if trigger.paused:
            convo.end()
            break
        ender.reset()
        audio = None
        if heard:   # barge-in: start from the words already caught
            for f in heard:
                audio = ender.feed(f[:, 0].copy() if f.ndim > 1 else f)
        else:
            flush(stream)
        heard = None
        quiet = 0.0
        while audio is None and not stop_event.is_set() and not trigger.paused:
            data, _ = stream.read(FRAME)
            audio = ender.feed(data[:, 0].copy())
            quiet = 0.0 if ender.speaking else quiet + FRAME_SECONDS
            if quiet >= SILENCE_TIMEOUT:
                break
        if audio is None:
            if quiet >= SILENCE_TIMEOUT:
                log("Quiet for a while; ending the conversation")
                mouth.say(convo.silence())
            continue
        try:
            text = ears.transcribe(audio)
        except Exception as e:
            log("Speech-to-text failed: %s" % e)
            continue
        if is_noise(text):
            continue
        log("Heard %d words" % len(text.split()))
        heard = speak(think(lambda: convo.hear(text)))
    log("Conversation over; listening for 'Hey Jarvis' only")


def listen_forever(trigger, stop_event, wake_event=None, talk=None):
    """Own the mic. Idle: wake word only. After a wake: a conversation."""
    while not stop_event.is_set():
        try:
            import sounddevice as sd
            with sd.InputStream(samplerate=SAMPLE_RATE, channels=1,
                                dtype="int16", blocksize=FRAME) as stream:
                log("Listening for 'Hey Jarvis'...")
                while not stop_event.is_set():
                    data, _ = stream.read(FRAME)
                    trigger.feed(data[:, 0].copy())
                    if wake_event is not None and wake_event.is_set():
                        wake_event.clear()
                        if talk:
                            talk(stream)
                        flush(stream)
                        trigger.ignore_until = trigger.clock() + trigger.cooldown
                        if trigger.reset_fn:
                            trigger.reset_fn()
        except Exception as e:  # no mic, mic unplugged, privacy setting...
            log("Microphone problem: %s (retrying in 10 s)" % e)
            stop_event.wait(10)


def make_icon_image():
    from PIL import Image, ImageDraw
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((4, 4, 60, 60), fill=(20, 110, 220, 255))
    d.ellipse((22, 22, 42, 42), fill=(255, 255, 255, 255))
    return img


def run_tray(trigger, stop_event):
    """Show a tray icon. Returns False if no tray is available."""
    try:
        import pystray
    except Exception as e:
        log("No tray icon (%s); running without one" % e)
        return False

    def on_open(icon, item):
        open_jarvis()

    def on_pause(icon, item):
        trigger.paused = not trigger.paused
        log("Paused" if trigger.paused else "Resumed")

    def on_quit(icon, item):
        log("Quit from tray")
        stop_event.set()
        icon.stop()

    menu = pystray.Menu(
        pystray.MenuItem("Open Jarvis now", on_open, default=True),
        pystray.MenuItem("Pause listening", on_pause,
                         checked=lambda item: trigger.paused),
        pystray.MenuItem("Quit Hey Jarvis", on_quit),
    )
    icon = pystray.Icon("HeyJarvis", make_icon_image(),
                        "Hey Jarvis - say 'Hey Jarvis' to talk", menu)
    icon.run()
    return True


def make_brain(cfg):
    """Claude Code first (nic's own account); OmniRoute only as a fallback."""
    from jarvis_brain import OmniRoute, SYSTEM_PROMPT
    from jarvis_claude import BrainChain, ClaudeBrain, write_brain_dir
    write_brain_dir(BRAIN_DIR, SYSTEM_PROMPT)
    claude = ClaudeBrain(BRAIN_DIR, cfg)
    if claude.exe:
        log("Brain: Claude Code (%s), model %s" % (claude.exe, cfg.get("model")))
        tools = claude.discover_tools()
        log("Found %s tools" % (len(tools) if tools is not None else "no"))
    else:
        log("Claude Code not found on this laptop")
    fallback = None
    if cfg.get("omniroute_fallback", True):
        fallback = OmniRoute(cfg.get("omniroute_url", "http://localhost:20128"),
                             cfg.get("omniroute_key", ""), cfg.get("models"))
    return BrainChain(claude, fallback)


def make_talker(cfg, stop_event):
    """Load the speech model, voice and brain. None if they can't load."""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from jarvis_brain import Conversation, Status
        from jarvis_voice import Ears, Mouth
        ears = Ears(cfg.get("whisper_model", "base.en"),
                    download_root=os.path.join(APP_DIR, "models"))
        mouth = Mouth(cfg.get("voice", "en-GB-RyanNeural"), APP_DIR,
                      rate=cfg.get("voice_rate", "-6%"),
                      pitch=cfg.get("voice_pitch", "-4Hz"))
        convo = Conversation(make_brain(cfg),
                             Status(os.path.join(APP_DIR, "status_cache.json")))
    except Exception as e:
        log("Conversation parts failed to load (%s); wake word will only "
            "open the page" % e)
        return None

    def talk(stream, trigger):
        try:
            run_conversation(stream, convo, ears, mouth, trigger, stop_event, cfg)
        except Exception as e:
            convo.end()
            if "stream" in str(e).lower() or "device" in str(e).lower():
                raise
            log("Conversation error: %s" % e)
    log("Conversation ready (speech model %s)" % cfg.get("whisper_model"))
    return talk


def single_instance_lock():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", LOCK_PORT))
        s.listen(1)
        return s
    except OSError:
        s.close()
        return None


def main():
    setup_logging()
    if "--test-open" in sys.argv:
        open_jarvis()
        return 0
    lock = single_instance_lock()
    if lock is None:
        log("Already running; exiting this copy")
        return 0
    log("Starting Hey Jarvis v3")
    cfg = load_config()
    model = load_model()
    stop_event = threading.Event()
    wake_event = threading.Event()
    talk = make_talker(cfg, stop_event)

    def on_wake():
        if cfg.get("open_page_on_wake", True):
            open_jarvis()
        wake_event.set()

    trigger = WakeTrigger(make_score_fn(model), on_wake, model.reset)
    worker = threading.Thread(
        target=listen_forever,
        args=(trigger, stop_event, wake_event,
              (lambda stream: talk(stream, trigger)) if talk else None),
        daemon=True)
    worker.start()
    try:
        if not run_tray(trigger, stop_event):
            while not stop_event.is_set():
                stop_event.wait(1)
    except KeyboardInterrupt:
        pass
    stop_event.set()
    log("Stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
