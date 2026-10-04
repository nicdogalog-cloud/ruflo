"""Jarvis's brain: the conversation, the company status and the chat model.

No audio in here, so it can be tested anywhere. Only the Python standard
library is used.

- Conversation: idle -> (wake) -> talking -> (stop phrase / long silence) -> idle
- Status: a small public feed the crew shift publishes, plus Buzz's post log
- Brain: Claude Code on this laptop under nic's own Claude account (see
  jarvis_claude.py); nic's OmniRoute gateway is only an optional fallback
"""

import json
import os
import re
import time
import urllib.error
import urllib.request

from jarvis_claude import BrainOffline, ClaudeMissing  # noqa: F401

STATUS_URL = ("https://raw.githubusercontent.com/nicdogalog-cloud/ruflo/"
              "jarvis-status/status.json")
POSTS_URL = ("https://raw.githubusercontent.com/nicdogalog-cloud/ruflo/"
             "crease-cam-files/social/posted-log.md")
OMNIROUTE_URL = "http://localhost:20128"
# Fallback only: free OpenCode models inside OmniRoute, tried in order.
FREE_MODELS = ["oc/deepseek-v4-flash-free", "oc/mimo-v2.5-free", "oc/hy3-free"]
BLOCKED_MODEL_WORDS = ("claude", "anthropic", "opus", "sonnet", "haiku")

MAX_TURNS = 10                 # remembered back-and-forths
RESUME_WINDOW = 30 * 60        # "Hey Jarvis" within 30 min picks the chat back up
MAX_REPLY_CHARS = 420

CREW = ("Nova runs HQ and writes the briefings. Forge decides the product and "
        "features. Pixel does design and content. Atlas does research and "
        "competitors. Sol does sales and club pilots. Ledger keeps the budget. "
        "Cog sorts kit and suppliers. Wicket looks after the Crease Cam "
        "website and app. Buzz runs marketing: Instagram @creasecam07, "
        "several short videos a day.")

SYSTEM_PROMPT = (
    "You are Jarvis, nic's business partner and right-hand man, talking with "
    "him out loud through the laptop. Your manner is a calm, polished "
    "English butler-style assistant: unfailingly polite, composed and "
    "precise, with a dry, understated wit. Speak in measured, well-formed "
    "sentences with a touch of formality (\"Certainly.\", \"Right away.\", "
    "\"I'm afraid...\", \"Shall I...?\", \"If I may...\") but never stiff, "
    "robotic or long-winded; light contractions are fine. Call him nic. "
    "Your own words always; never quote "
    "films. "
    "The business is Crease Cam, an app that helps cricketers film their "
    "net sessions from the right spot with guide cards, then watch it back "
    "in slow motion; it is getting ready to launch. The crew are AI agents "
    "who work a shift every two hours: " + CREW + " "
    "How to talk: it's a spoken conversation, so answer in one to three "
    "short sentences, the way a trusted aide would across the desk. Never use "
    "lists, bullet points, markdown, emoji, headings or links, and never "
    "read out more than two or three items; pick what matters and offer the "
    "rest. Remember what nic said earlier in this conversation and build on "
    "it. When it helps, finish with one natural follow-up question, never "
    "more than one. React briefly and graciously (\"Very good.\", \"Noted.\", "
    "\"An excellent point.\") rather than repeating his question back. "
    "Only state company facts that are in the status notes or that you have "
    "just read from his email, calendar or other tools; if you don't know, "
    "say so plainly and don't make up numbers. You can check his email, "
    "calendar and other connected apps when he asks. Email is drafts only: "
    "you never send, delete, post, publish, buy or change anything; if he "
    "wants something sent, write a draft and tell him it's in his Drafts.")

STOP_PHRASES = {
    "stop", "stop conversation", "stop the conversation", "stop talking",
    "end conversation", "end the conversation", "that's all", "thats all",
    "that is all", "that's it", "thats it", "goodbye", "good bye", "bye",
    "bye bye", "see you", "see you later", "go to sleep", "sleep",
    "that'll be all", "thatll be all", "that will be all",
    "off", "turn off", "just turn off", "switch off", "jarvis off",
}
_FILLER = {"hey", "hi", "ok", "okay", "jarvis", "please", "thanks", "then",
           "alright", "right", "cheers", "so", "well", "oh", "um", "uh",
           "and", "mate", "now", "yeah", "yes", "great", "lovely", "perfect"}


def log(msg):
    try:
        print(time.strftime("%Y-%m-%d %H:%M:%S"), msg, flush=True)
    except Exception:
        pass


# ---------------------------------------------------------------- phrases --

def _words(text):
    t = text.lower().replace("’", "'")
    t = re.sub(r"[^a-z' ]+", " ", t)
    return [w.strip("'") for w in t.split() if w.strip("'")]


def strip_wake(text):
    """'Hey Jarvis, what's new?' -> "what's new" (lowercase words)."""
    w = _words(text)
    for lead in (["hey", "jarvis"], ["hi", "jarvis"], ["ok", "jarvis"],
                 ["okay", "jarvis"], ["jarvis"]):
        if w[:len(lead)] == lead:
            w = w[len(lead):]
            break
    return " ".join(w)


def is_stop(text):
    """True for 'Hey Jarvis, stop conversation', 'that's all, thanks', 'bye'.

    Only short utterances whose words (minus fillers like 'okay', 'jarvis',
    'thanks', 'for now') are exactly a stop phrase, so 'we can't stop now'
    or 'stop the ads on TikTok' keep the conversation going.
    """
    t = " " + " ".join(_words(text)) + " "
    t = t.replace(" thank you ", " ").replace(" for now ", " ")
    w = t.split()
    if not w or len(w) > 6:
        return False
    return " ".join(x for x in w if x not in _FILLER) in STOP_PHRASES


def is_noise(text):
    """Whisper sometimes 'hears' these in silence or a cough."""
    t = " ".join(_words(text))
    return t in ("", "you", "the", "uh", "um", "hmm", "mm", "ah", "oh",
                 "thank you for watching", "thanks for watching", "bye bye bye")


# ----------------------------------------------------------------- status --

def _get(url, timeout=6):
    req = urllib.request.Request(url, headers={"User-Agent": "HeyJarvis/2"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(300_000).decode("utf-8", "replace")


def parse_posts(md, today):
    """Buzz's posted-log.md -> what went out today (date 'YYYY-MM-DD')."""
    rows = []
    for line in md.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 6 and cells[0] == today:
            rows.append(cells)
    live = [r for r in rows if "scheduled" not in r[-1].lower()
            and "not posted" not in r[-1].lower()]
    later = [r for r in rows if "scheduled" in r[-1].lower()]

    def idea(r):
        m = re.search(r'"([^"]{3,80})"', r[3])
        return m.group(1) if m else r[3].split(":")[0][:60]
    return {"today": len(rows), "live": len(live), "scheduled": len(later),
            "latest": [idea(r) for r in (live or rows)[-2:]]}


class Status:
    """Fetches the public status feed; keeps a cached copy for offline use."""

    def __init__(self, cache_path=None, fetch=_get, status_url=STATUS_URL,
                 posts_url=POSTS_URL):
        self.cache_path = cache_path
        self.fetch = fetch
        self.status_url = status_url
        self.posts_url = posts_url

    def load(self):
        data = {}
        try:
            data["feed"] = json.loads(self.fetch(self.status_url))
        except Exception as e:
            log("Status feed not available (%s)" % type(e).__name__)
        try:
            data["posts"] = parse_posts(self.fetch(self.posts_url),
                                        time.strftime("%Y-%m-%d"))
        except Exception as e:
            log("Post log not available (%s)" % type(e).__name__)
        if data and self.cache_path:
            try:
                with open(self.cache_path, "w", encoding="utf-8") as f:
                    json.dump(data, f)
            except OSError:
                pass
        elif self.cache_path and os.path.exists(self.cache_path):
            try:
                with open(self.cache_path, encoding="utf-8") as f:
                    data = json.load(f)
                data["stale"] = True
            except (OSError, ValueError):
                data = {}
        return data


def status_notes(data):
    """Plain facts for the model's system prompt."""
    if not data:
        return "No company status could be fetched just now."
    out = []
    feed = data.get("feed") or {}
    if feed.get("updated"):
        out.append("Crew status from the shift at %s." % feed["updated"])
    if feed.get("briefing"):
        out.append("Nova's latest briefing: " + feed["briefing"])
    for c in feed.get("crew", [])[:12]:
        bits = ["%s (%s) is %s" % (c.get("name"), c.get("place", ""),
                                   c.get("status", "idle"))]
        if c.get("job"):
            bits.append("job: " + c["job"])
        if c.get("done"):
            bits.append("just finished: " + "; ".join(c["done"][:3]))
        if c.get("next"):
            bits.append("next: " + c["next"])
        if c.get("latest"):
            bits.append("latest note: " + c["latest"])
        out.append(", ".join(bits) + ".")
    waiting = feed.get("waiting_on_nic") or []
    if waiting:
        out.append("Waiting on nic: " + "; ".join(
            "%s from %s%s" % (w.get("task"), w.get("crew"),
                              (" (" + w["step"] + ")") if w.get("step") else "")
            for w in waiting[:6]) + ".")
    else:
        out.append("Nothing is waiting on nic right now.")
    p = data.get("posts")
    if p:
        out.append("Buzz today: %d videos in the plan, %d already live on "
                   "Instagram, %d scheduled. Latest: %s." % (
                       p["today"], p["live"], p["scheduled"],
                       " and ".join(p["latest"]) or "none yet"))
    if data.get("stale"):
        out.append("(This is an older saved copy; the internet was not reachable.)")
    return " ".join(out)


def spoken_summary(data):
    """A short rundown Jarvis can read out with no model at all."""
    if not data:
        return "I couldn't reach the crew's status feed, so I've no update just now."
    feed = data.get("feed") or {}
    parts = []
    crew = feed.get("crew", [])
    busy = [c["name"] for c in crew if c.get("status") == "working"]
    stuck = [c["name"] for c in crew if c.get("status") == "stuck"]
    finished = sum(len(c.get("done") or []) for c in crew)
    if crew:
        s = "The crew have finished %s task%s lately" % (
            _num(finished), "" if finished == 1 else "s")
        if busy:
            s += ", and %s %s busy" % (_join(busy[:3]), "is" if len(busy[:3]) == 1 else "are")
        parts.append(s + ".")
    if stuck:
        parts.append("%s %s stuck." % (_join(stuck), "is" if len(stuck) == 1 else "are"))
    p = data.get("posts")
    if p and p["today"]:
        parts.append("Buzz has %s video%s out today%s." % (
            _num(p["live"]), "" if p["live"] == 1 else "s",
            ", the latest being " + p["latest"][-1] if p["latest"] else ""))
    waiting = feed.get("waiting_on_nic") or []
    if waiting:
        parts.append("%s thing%s waiting on you, starting with %s." % (
            _num(len(waiting)).capitalize(), " is" if len(waiting) == 1 else "s are",
            waiting[0].get("task", "a task")))
    elif feed:
        parts.append("Nothing's waiting on you.")
    return " ".join(parts) or "All quiet on the crew front."


def _num(n):
    words = ("no", "one", "two", "three", "four", "five", "six", "seven",
             "eight", "nine", "ten")
    return words[n] if 0 <= n < len(words) else str(n)


def _join(names):
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


# ------------------------------------------------------------------ model --

def clean_reply(text):
    text = re.sub(r"<think>.*?</think>", " ", text or "", flags=re.S | re.I)
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"[*_#`>|~]+", "", text)
    text = re.sub(r"^\s*([-•]|\d+[.)])\s+", "", text, flags=re.M)
    text = " ".join(text.split())
    if len(text) > MAX_REPLY_CHARS:
        cut = text[:MAX_REPLY_CHARS]
        end = max(cut.rfind(". "), cut.rfind("? "), cut.rfind("! "))
        text = cut[:end + 1] if end > 80 else cut.rsplit(" ", 1)[0] + "."
    return text.strip()


class OmniRoute:
    def __init__(self, url=OMNIROUTE_URL, key="", models=None, timeout=25):
        self.url = url.rstrip("/")
        self.key = key
        self.models = [m for m in (models or FREE_MODELS)
                       if not any(b in m.lower() for b in BLOCKED_MODEL_WORDS)]
        self.timeout = timeout

    def _post(self, model, messages):
        body = json.dumps({"model": model, "messages": messages,
                           "max_tokens": 220, "temperature": 0.8,
                           "stream": False}).encode()
        headers = {"Content-Type": "application/json"}
        if self.key:
            headers["Authorization"] = "Bearer " + self.key
        req = urllib.request.Request(self.url + "/v1/chat/completions",
                                     data=body, headers=headers)
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            data = json.loads(r.read().decode("utf-8", "replace"))
        return data["choices"][0]["message"].get("content") or ""

    def chat(self, messages):
        reached = False
        for i, model in enumerate(list(self.models)):
            try:
                text = clean_reply(self._post(model, messages))
            except urllib.error.HTTPError as e:
                reached = True
                log("Model %s said %s; trying the next" % (model, e.code))
                continue
            except (urllib.error.URLError, OSError) as e:
                if reached:
                    continue
                raise BrainOffline("OmniRoute not reachable (%s)" % e)
            except (ValueError, KeyError, IndexError):
                reached = True
                continue
            if text:
                if i:  # remember the one that worked
                    self.models.insert(0, self.models.pop(i))
                return text
            reached = True
        raise BrainOffline("no free model answered" if reached else "no models")


# ----------------------------------------------------------- conversation --

IDLE, TALKING = "idle", "talking"


def part_of_day(hour):
    return "morning" if hour < 12 else "afternoon" if hour < 18 else "evening"


NEED_CLAUDE = "I need Claude Code signed in on this laptop."


class Conversation:
    """The state machine. Every method returns the words Jarvis should say.

    wake()     idle -> talking (greeting + company rundown)
    hear(text) talking: a reply, or a goodbye that goes back to idle
    silence()  talking -> idle after nic has gone quiet for a while

    brain.reply(text, system, history) answers one turn; brain.new_session()
    starts a fresh Claude session. A wake within 30 minutes of the last
    words resumes the same session.
    """

    def __init__(self, brain, status, clock=time.time, hour=None):
        self.brain = brain
        self.status = status
        self.clock = clock
        self.hour = hour or (lambda: time.localtime().tm_hour)
        self.state = IDLE
        self.history = []
        self.notes = ""
        self.last_active = -1e18
        self.brain_down = False

    @property
    def active(self):
        return self.state == TALKING

    def system_text(self):
        return SYSTEM_PROMPT + "\n\nStatus notes: " + self.notes

    def _ask(self, user_text):
        reply = clean_reply(self.brain.reply(
            user_text, self.system_text(), self.history[-2 * MAX_TURNS:]))
        if not reply:
            raise BrainOffline("empty reply")
        self.brain_down = False
        self.history += [{"role": "user", "content": user_text},
                         {"role": "assistant", "content": reply}]
        self.history = self.history[-2 * MAX_TURNS:]
        return reply

    def wake(self):
        now = self.clock()
        resumed = bool(self.history) and now - self.last_active < RESUME_WINDOW
        if not resumed:
            self.history = []
            self.brain.new_session()
        self.state = TALKING
        self.last_active = now
        data = self.status.load()
        self.notes = status_notes(data)
        when = part_of_day(self.hour())
        prompt = ("(nic just said 'Hey Jarvis' again to pick the conversation "
                  "back up. Welcome him back in one short, natural sentence "
                  "that nods to what you were talking about.)" if resumed else
                  "(nic just said 'Hey Jarvis'. It's %s. Greet him like a "
                  "friend would, then tell him how the company's doing from "
                  "the status notes: the main crew news, what Buzz has "
                  "posted, and anything waiting on him. Two or three spoken "
                  "sentences, then ask what he'd like to get into.)" % when)
        try:
            return self._ask(prompt)
        except ClaudeMissing as e:
            log("Brain offline: %s" % e)
            self.brain_down = True
            return "%s %s" % (NEED_CLAUDE, spoken_summary(data))
        except BrainOffline as e:
            log("Brain offline: %s" % e)
            self.brain_down = True
            if resumed:
                return "Back again, nic. My thinking's offline just now, I'm afraid."
            return ("Good %s, nic. I can't reach my brain right now, so here "
                    "are the headlines. %s" % (when, spoken_summary(data)))

    def hear(self, text):
        if self.state != TALKING:
            return None
        self.last_active = self.clock()
        if is_stop(text):
            self.state = IDLE
            return "Okay, going quiet. Say Hey Jarvis when you need me."
        said = strip_wake(text)
        if not said:
            return "Yes, nic?"
        try:
            return self._ask(text.strip())
        except ClaudeMissing as e:
            log("Brain offline: %s" % e)
            self.brain_down = True
            return NEED_CLAUDE
        except BrainOffline as e:
            log("Brain offline: %s" % e)
            first = not self.brain_down
            self.brain_down = True
            if first:
                return "Sorry, I lost my train of thought there. Try me again?"
            return "Still can't think straight, I'm afraid. Say stop if you'd like a break."

    def silence(self):
        if self.state != TALKING:
            return None
        self.state = IDLE
        return "I'll leave you to it. Just say Hey Jarvis when you need me."

    def end(self):
        """Ended from outside (pause/quit): no words."""
        self.state = IDLE


def ask_with_filler(fn, say, delay=2.5, filler="One moment."):
    """Run fn() (the brain); if it takes longer than delay, say a filler."""
    import threading
    box = {}

    def work():
        try:
            box["out"] = fn()
        except BaseException as e:  # handed back to the caller
            box["err"] = e
    t = threading.Thread(target=work, daemon=True)
    t.start()
    t.join(delay)
    if t.is_alive():
        say(filler)
        t.join()
    if "err" in box:
        raise box["err"]
    return box.get("out")
