"""Tests for the Claude Code brain, permissions, fallback, barge-in and filler.

Uses a fake `claude` executable (a small Python script); no real Claude call.
Run from the jarvis-voice folder:  python -m unittest discover tests
"""
import json
import os
import stat
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np  # noqa: E402

import jarvis_brain as jb  # noqa: E402
import jarvis_claude as jc  # noqa: E402
from jarvis_voice import FRAME, BargeIn  # noqa: E402

FAKE = r'''#!%s
import json, os, sys
log = os.path.join(os.path.dirname(os.path.abspath(__file__)), "calls.jsonl")
prompt = sys.stdin.read()
with open(log, "a") as f:
    f.write(json.dumps({"argv": sys.argv[1:], "stdin": prompt,
                        "cwd": os.getcwd()}) + "\n")
mode = os.environ.get("FAKE_MODE", "ok")
if mode == "nologin":
    print(json.dumps({"type": "result", "is_error": True,
                      "result": "Not logged in - Please run /login"}))
    sys.exit(1)
if mode == "fail":
    sys.exit(2)
sid = "sess-1" if "--resume" not in sys.argv else sys.argv[sys.argv.index("--resume") + 1]
print(json.dumps({"type": "result", "is_error": False, "session_id": sid,
                  "result": "Evening nic. All good."}))
''' % sys.executable

TOOLS = ["Bash", "WebSearch",
         "mcp__claude_ai_Gmail__search_threads", "mcp__claude_ai_Gmail__get_thread",
         "mcp__claude_ai_Gmail__create_draft", "mcp__claude_ai_Gmail__send_email",
         "mcp__claude_ai_Gmail__delete_message",
         "mcp__claude_ai_Google_Calendar__list_events",
         "mcp__claude_ai_Google_Calendar__create_event",
         "mcp__claude_ai_Slack__slack_search_public",
         "mcp__claude_ai_Slack__slack_send_message",
         "mcp__claude_ai_Buffer__get_posts", "mcp__claude_ai_Buffer__create_post",
         "mcp__claude_ai_Zapier__gmail_find_email",
         "mcp__claude_ai_Stripe__purchase", "mcp__claude_ai_Acme__update_account"]


def fake_claude():
    d = tempfile.mkdtemp()
    path = os.path.join(d, "claude")
    with open(path, "w") as f:
        f.write(FAKE)
    os.chmod(path, os.stat(path).st_mode | stat.S_IEXEC)
    return path, os.path.join(d, "calls.jsonl")


def calls(log):
    with open(log) as f:
        return [json.loads(x) for x in f]


class Permissions(unittest.TestCase):
    def test_connector_tools_sorted(self):
        allow, block = jc.split_tools(TOOLS)
        self.assertEqual(allow, sorted([
            "mcp__claude_ai_Gmail__search_threads", "mcp__claude_ai_Gmail__get_thread",
            "mcp__claude_ai_Gmail__create_draft",
            "mcp__claude_ai_Google_Calendar__list_events",
            "mcp__claude_ai_Slack__slack_search_public",
            "mcp__claude_ai_Buffer__get_posts"]))
        for bad in ("send_email", "delete_message", "create_event",
                    "slack_send_message", "create_post", "Zapier__gmail_find_email",
                    "Stripe__purchase", "update_account"):
            self.assertTrue(any(b.endswith(bad) for b in block), bad)

    def test_config_extras_and_block_wins(self):
        allow, block = jc.permission_lists(
            {"allowed_tools": ["mcp__claude_ai_Notion__search", "Bash"],
             "blocked_tools": ["mcp__claude_ai_Gmail__get_thread"]}, TOOLS)
        self.assertIn("mcp__claude_ai_Notion__search", allow)
        self.assertNotIn("Bash", allow)                       # built-in block wins
        self.assertNotIn("mcp__claude_ai_Gmail__get_thread", allow)
        self.assertIn("mcp__claude_ai_Zapier", block)


class CommandAndSession(unittest.TestCase):
    def setUp(self):
        self.exe, self.log = fake_claude()
        self.dir = tempfile.mkdtemp()
        os.environ.pop("FAKE_MODE", None)

    def test_command_flags(self):
        b = jc.ClaudeBrain(self.dir, {"model": "haiku"}, exe=self.exe)
        b.discovered = TOOLS
        self.assertEqual(b.ask("hello", "PERSONA + STATUS"), "Evening nic. All good.")
        c = calls(self.log)[0]
        a = c["argv"]
        self.assertEqual(c["stdin"], "hello")
        self.assertEqual(os.path.realpath(c["cwd"]), os.path.realpath(self.dir))
        self.assertEqual(a[a.index("--model") + 1], "haiku")
        self.assertEqual(a[a.index("--output-format") + 1], "json")
        self.assertEqual(a[a.index("--permission-mode") + 1], "default")
        self.assertIn("-p", a)
        pf = a[a.index("--append-system-prompt-file") + 1]
        with open(pf) as f:
            self.assertEqual(f.read(), "PERSONA + STATUS")
        allowed = a[a.index("--allowedTools") + 1]
        blocked = a[a.index("--disallowedTools") + 1]
        self.assertIn("mcp__claude_ai_Gmail__create_draft", allowed)
        self.assertIn("mcp__claude_ai_Gmail__send_email", blocked)
        self.assertNotIn("send", allowed)
        self.assertIn("Bash", blocked.split(","))
        joined = " ".join(a)
        for bad in ("dangerously", "bypassPermissions", "skip-permissions",
                    "base-url", "ANTHROPIC_BASE_URL", "20128"):
            self.assertNotIn(bad, joined)
        self.assertNotIn("--resume", a)

    def test_resume_uses_session_id_then_fresh(self):
        b = jc.ClaudeBrain(self.dir, {}, exe=self.exe)
        b.ask("one", "s")
        b.ask("two", "s")
        b.new_session()
        b.ask("three", "s")
        argv = [c["argv"] for c in calls(self.log)]
        self.assertNotIn("--resume", argv[0])
        self.assertEqual(argv[1][argv[1].index("--resume") + 1], "sess-1")
        self.assertNotIn("--resume", argv[2])

    def test_not_signed_in(self):
        os.environ["FAKE_MODE"] = "nologin"
        self.addCleanup(os.environ.pop, "FAKE_MODE", None)
        b = jc.ClaudeBrain(self.dir, {}, exe=self.exe)
        with self.assertRaises(jc.ClaudeMissing):
            b.ask("hi", "s")

    def test_missing_cli(self):
        b = jc.ClaudeBrain(self.dir, {}, finder=lambda: None)
        with self.assertRaises(jc.ClaudeMissing):
            b.ask("hi", "s")

    def test_conversation_end_to_end_with_fake_cli(self):
        b = jc.ClaudeBrain(self.dir, {}, exe=self.exe)
        c = jb.Conversation(jc.BrainChain(b), type("S", (), {"load": lambda s: {}})(),
                            hour=lambda: 9)
        self.assertEqual(c.wake(), "Evening nic. All good.")
        c.hear("anything in my inbox?")
        self.assertIn("--resume", calls(self.log)[-1]["argv"])
        self.assertEqual(c.hear("Jarvis off"), "Okay, going quiet. Say Hey Jarvis when you need me.")
        self.assertFalse(c.active)


class FindAndFallback(unittest.TestCase):
    def test_find_order(self):
        on_path = {"claude.cmd": r"C:\npm\claude.cmd", "claude.exe": r"C:\bin\claude.exe"}
        self.assertEqual(jc.find_claude({}, which=on_path.get, isfile=lambda p: False),
                         r"C:\bin\claude.exe")
        self.assertEqual(jc.find_claude({}, which={"claude.cmd": "X.cmd"}.get,
                                        isfile=lambda p: False), "X.cmd")
        env = {"USERPROFILE": "/u", "APPDATA": "/u/AppData/Roaming"}
        local = os.path.join("/u", ".local", "bin", "claude.exe")
        npm = os.path.join("/u/AppData/Roaming", "npm", "claude.cmd")
        self.assertEqual(jc.find_claude(env, which=lambda n: None,
                                        isfile=lambda p: p in (local, npm)), local)
        self.assertEqual(jc.find_claude(env, which=lambda n: None,
                                        isfile=lambda p: p == npm), npm)
        self.assertIsNone(jc.find_claude(env, which=lambda n: None, isfile=lambda p: False))

    def test_chain_order(self):
        class C:
            def __init__(self, err=None):
                self.err, self.n = err, 0

            def ask(self, t, s):
                self.n += 1
                if self.err:
                    raise self.err
                return "claude"

            def new_session(self):
                pass

        class O:
            def __init__(self, ok=True):
                self.ok, self.n = ok, 0

            def chat(self, m):
                self.n += 1
                if not self.ok:
                    raise jb.BrainOffline("down")
                return "omni"
        o = O()
        self.assertEqual(jc.BrainChain(C(), o).reply("t", "s", []), "claude")
        self.assertEqual(o.n, 0)                              # Claude first
        self.assertEqual(jc.BrainChain(C(jc.ClaudeMissing("x")), o).reply("t", "s", []), "omni")
        with self.assertRaises(jc.ClaudeMissing):            # fallback switched off
            jc.BrainChain(C(jc.ClaudeMissing("x")), None).reply("t", "s", [])
        with self.assertRaises(jc.ClaudeMissing):            # both down -> Claude's error
            jc.BrainChain(C(jc.ClaudeMissing("x")), O(False)).reply("t", "s", [])

    def test_brain_dir_claude_md(self):
        d = os.path.join(tempfile.mkdtemp(), "brain")
        p = jc.write_brain_dir(d, jb.SYSTEM_PROMPT)
        with open(p) as f:
            md = f.read()
        for w in ("drafts only", "never", "send", "isn't reachable", "contractions"):
            self.assertIn(w, md)


class BargeInAndFiller(unittest.TestCase):
    def frame(self, level):
        return np.full(FRAME, level, dtype=np.int16)

    def test_barge_in_needs_loud_speech_over_echo(self):
        b = BargeIn(min_level=1800, frames_needed=4)
        for _ in range(20):                       # Jarvis's own voice in the mic
            self.assertFalse(b.feed(self.frame(1200)))
        for _ in range(3):
            self.assertFalse(b.feed(self.frame(4000)))
        self.assertTrue(b.feed(self.frame(4000)))  # nic talking over him
        self.assertTrue(b.triggered)
        self.assertLessEqual(len(b.buffer), b.keep)
        b.reset()
        self.assertFalse(b.triggered)
        self.assertEqual(b.buffer, [])

    def test_short_noise_does_not_barge(self):
        b = BargeIn(frames_needed=4)
        for lv in (5000, 5000, 100, 5000, 100):
            self.assertFalse(b.feed(self.frame(lv)))

    def test_filler_only_when_slow(self):
        said = []
        self.assertEqual(jb.ask_with_filler(lambda: "fast", said.append, 0.5), "fast")
        self.assertEqual(said, [])

        def slow():
            time.sleep(0.3)
            return "slow"
        self.assertEqual(jb.ask_with_filler(slow, said.append, 0.05), "slow")
        self.assertEqual(said, ["One moment."])


if __name__ == "__main__":
    unittest.main()
