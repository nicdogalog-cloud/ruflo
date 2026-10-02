"""Hey Jarvis - say "Hey Jarvis" and the Jarvis page pops up.

Runs quietly in the background (tray icon near the clock).
Everything happens on this computer: audio is checked in memory by the
openWakeWord "hey_jarvis" model and thrown away. Nothing is recorded,
saved or sent anywhere.
"""

import os
import shutil
import socket
import subprocess
import sys
import threading
import time
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


def listen_forever(trigger, stop_event):
    while not stop_event.is_set():
        try:
            import sounddevice as sd
            with sd.InputStream(samplerate=SAMPLE_RATE, channels=1,
                                dtype="int16", blocksize=FRAME) as stream:
                log("Listening for 'Hey Jarvis'...")
                while not stop_event.is_set():
                    data, _ = stream.read(FRAME)
                    trigger.feed(data[:, 0].copy())
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
                        "Hey Jarvis - listening", menu)
    icon.run()
    return True


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
    log("Starting Hey Jarvis")
    model = load_model()
    trigger = WakeTrigger(make_score_fn(model), open_jarvis, model.reset)
    stop_event = threading.Event()
    worker = threading.Thread(target=listen_forever,
                              args=(trigger, stop_event), daemon=True)
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
