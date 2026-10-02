"""Tests for Jarvis's conversation logic (no mic, speaker or network needed).

Run from the jarvis-voice folder:  python -m unittest discover tests
"""
import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np  # noqa: E402

import jarvis_brain as jb  # noqa: E402

FEED = {
    "updated": "2026-10-02 19:37",
    "briefing": "Good shift: domain shortlist ready, pilot list drafted.",
    "crew": [
        {"name": "Nova", "place": "HQ", "status": "working", "job": "Briefing",
         "done": ["Write the morning briefing"], "next": "Set a launch date"},
        {"name": "Sol", "place": "Sales", "status": "idle",
         "done": ["List 5 clubs for a pilot"], "next": "Send pilot offer"},
        {"name": "Cog", "place": "Depot", "status": "stuck", "done": []},
    ],
    "waiting_on_nic": [{"crew": "Wicket", "task": "Buy the Crease Cam domain",
                        "step": "Pick one of the 3 names"}],
}
POSTS = """| Date | Slot | File | Idea | Channels | Link |
|---|---|---|---|---|---|
| 2026-10-02 | morning 1 | a.mp4 | Explainer: "What Crease Cam does" | Instagram | https://www.instagram.com/reel/x/ |
| 2026-10-02 | morning 2 (scheduled 08:30) | b.mp4 | List: "3 things your coach sees" | Instagram | Buffer post 1 (scheduled) |
| 2026-10-01 | evening 1 | c.mp4 | Old: "Yesterday" | Instagram | https://www.instagram.com/reel/y/ |
"""


class FakeBrain:
    def __init__(self, offline=False):
        self.offline = offline
        self.calls = []
        self.sessions = 0

    def new_session(self):
        self.sessions += 1

    def reply(self, text, system, history):
        self.calls.append([{"role": "system", "content": system}]
                          + list(history) + [{"role": "user", "content": text}])
        if self.offline == "missing":
            raise jb.ClaudeMissing("no claude")
        if self.offline:
            raise jb.BrainOffline("down")
        return "reply %d" % len(self.calls)


class FakeStatus:
    def __init__(self, data):
        self.data = data

    def load(self):
        return self.data


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


def make(offline=False, data=None):
    clock = Clock()
    data = {"feed": FEED, "posts": jb.parse_posts(POSTS, "2026-10-02")} if data is None else data
    brain = FakeBrain(offline)
    return jb.Conversation(brain, FakeStatus(data), clock=clock, hour=lambda: 19), brain, clock


class StateMachine(unittest.TestCase):
    def test_wake_talk_stop_idle_wake(self):
        c, brain, clock = make()
        self.assertEqual(c.state, jb.IDLE)
        self.assertIsNone(c.hear("hello?"))             # idle: ignores speech
        greeting = c.wake()
        self.assertTrue(c.active)
        self.assertEqual(greeting, "reply 1")
        system = brain.calls[0][0]["content"]
        self.assertIn("Wicket", system)                  # status reached the model
        self.assertIn("Buy the Crease Cam domain", system)
        self.assertIn("evening", brain.calls[0][-1]["content"])
        self.assertEqual(c.hear("How's Sol getting on?"), "reply 2")
        self.assertTrue(c.active)                        # no wake word needed
        bye = c.hear("Hey Jarvis, stop conversation.")
        self.assertFalse(c.active)
        self.assertIn("going quiet", bye)
        self.assertEqual(len(brain.calls), 2)            # goodbye costs no model call
        self.assertIsNone(c.hear("anything"))
        clock.t += 60
        c.wake()                                         # back within 30 min: resumes
        self.assertTrue(c.active)
        self.assertIn("pick the conversation back up", brain.calls[-1][-1]["content"])
        self.assertIn("How's Sol getting on?", json.dumps(brain.calls[-1]))

    def test_fresh_session_after_long_gap(self):
        c, brain, clock = make()
        c.wake()
        c.hear("first question")
        c.hear("goodbye")
        clock.t += jb.RESUME_WINDOW + 1
        c.wake()
        self.assertNotIn("first question", json.dumps(brain.calls[-1]))

    def test_other_stop_phrases(self):
        for phrase in ("Stop.", "That's all, thanks Jarvis.", "Goodbye!",
                       "OK that's all for now", "Bye Jarvis", "Jarvis off.",
                       "Stop conversation", "Go to sleep", "Hey Jarvis, turn off",
                       "Turn off.", "Just turn off", "End conversation."):
            c, _, _ = make()
            c.wake()
            c.hear(phrase)
            self.assertFalse(c.active, phrase)

    def test_not_stop(self):
        for phrase in ("We can't stop now", "Stop the TikTok ads for a week",
                       "That's all I needed on Sol, what about Forge?",
                       "Turn off the Buffer schedule for Sunday"):
            c, _, _ = make()
            c.wake()
            c.hear(phrase)
            self.assertTrue(c.active, phrase)

    def test_bare_wake_word_mid_chat(self):
        c, brain, _ = make()
        c.wake()
        self.assertEqual(c.hear("Hey Jarvis."), "Yes, nic?")
        self.assertEqual(len(brain.calls), 1)

    def test_memory_keeps_last_ten_turns(self):
        c, brain, _ = make()
        c.wake()
        for i in range(15):
            c.hear("question %d" % i)
        sent = brain.calls[-1]
        self.assertEqual(sent[0]["role"], "system")
        self.assertLessEqual(len(sent) - 2, 2 * jb.MAX_TURNS)
        self.assertNotIn("question 3", json.dumps(sent))
        self.assertIn("question 13", json.dumps(sent))

    def test_silence_ends(self):
        c, _, _ = make()
        c.wake()
        self.assertIn("Hey Jarvis", c.silence())
        self.assertFalse(c.active)
        self.assertIsNone(c.silence())

    def test_brain_offline_still_reads_status(self):
        c, _, _ = make(offline=True)
        g = c.wake()
        self.assertTrue(c.active)
        self.assertIn("can't reach my brain", g)
        self.assertIn("Buzz has one video out today", g)
        self.assertIn("Buy the Crease Cam domain", g)
        self.assertIn("Cog is stuck", g)
        self.assertIn("Still can't think", c.hear("what now?"))
        self.assertIn("Still can't think", c.hear("and now?"))
        c.hear("goodbye")
        self.assertFalse(c.active)

    def test_claude_missing_says_so(self):
        c, _, _ = make(offline="missing")
        g = c.wake()
        self.assertTrue(g.startswith("I need Claude Code signed in on this laptop."))
        self.assertIn("Buzz has one video out today", g)
        self.assertEqual(c.hear("hello there"), jb.NEED_CLAUDE)

    def test_resume_session_handling(self):
        c, brain, clock = make()
        c.wake()
        self.assertEqual(brain.sessions, 1)            # fresh session
        c.hear("goodbye")
        clock.t += 29 * 60
        c.wake()
        self.assertEqual(brain.sessions, 1)            # within 30 min: resumed
        c.hear("goodbye")
        clock.t += 31 * 60
        c.wake()
        self.assertEqual(brain.sessions, 2)            # later: fresh again

    def test_persona_is_human(self):
        for w in ("contractions", "follow-up", "Remember what nic said",
                  "Never use lists", "drafts only"):
            self.assertIn(w, jb.SYSTEM_PROMPT)

    def test_no_status_at_all(self):
        c, _, _ = make(offline=True, data={})
        self.assertIn("couldn't reach", c.wake())


class Helpers(unittest.TestCase):
    def test_parse_posts(self):
        p = jb.parse_posts(POSTS, "2026-10-02")
        self.assertEqual((p["today"], p["live"], p["scheduled"]), (2, 1, 1))
        self.assertEqual(p["latest"], ["What Crease Cam does"])

    def test_clean_reply(self):
        r = jb.clean_reply("<think>hmm</think>**Right**, nic:\n- one\n- two https://x.y")
        self.assertEqual(r, "Right, nic: one two")
        self.assertLessEqual(len(jb.clean_reply("Word. " * 200)), jb.MAX_REPLY_CHARS)

    def test_never_claude(self):
        o = jb.OmniRoute(models=["claude-sonnet-5", "kr/claude-opus", "oc/hy3-free"])
        self.assertEqual(o.models, ["oc/hy3-free"])

    def test_status_cache_when_offline(self):
        import tempfile
        path = os.path.join(tempfile.mkdtemp(), "cache.json")
        ok = jb.Status(path, fetch=lambda u: json.dumps(FEED) if "status" in u else POSTS)
        self.assertIn("feed", ok.load())

        def down(url):
            raise OSError("offline")
        d = jb.Status(path, fetch=down).load()
        self.assertTrue(d.get("stale"))
        self.assertIn("older saved copy", jb.status_notes(d))


class OmniRouteHttp(unittest.TestCase):
    def serve(self, handler):
        srv = HTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.shutdown)
        return "http://127.0.0.1:%d" % srv.server_port

    def test_falls_back_to_next_free_model(self):
        seen = []

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                seen.append((body["model"], self.headers.get("Authorization")))
                if body["model"] == "oc/a":
                    self.send_response(503)
                    self.end_headers()
                    return
                out = json.dumps({"choices": [{"message": {"content": "Evening, nic."}}]}).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(out)))
                self.end_headers()
                self.wfile.write(out)

        o = jb.OmniRoute(self.serve(H), key="k", models=["oc/a", "oc/b"])
        self.assertEqual(o.chat([{"role": "user", "content": "hi"}]), "Evening, nic.")
        self.assertEqual(seen, [("oc/a", "Bearer k"), ("oc/b", "Bearer k")])
        self.assertEqual(o.models[0], "oc/b")            # remembers the one that worked

    def test_not_running(self):
        o = jb.OmniRoute("http://127.0.0.1:9", models=["oc/a"], timeout=2)
        with self.assertRaises(jb.BrainOffline):
            o.chat([{"role": "user", "content": "hi"}])


class EndOfSpeech(unittest.TestCase):
    def frames(self, level, n):
        rng = np.random.default_rng(1)
        return [(rng.standard_normal(1280) * level).astype(np.int16) for _ in range(n)]

    def test_cuts_one_utterance(self):
        from jarvis_voice import Endpointer
        e = Endpointer()
        out = [e.feed(f) for f in self.frames(60, 30)]          # quiet room
        self.assertTrue(all(o is None for o in out))
        out = [e.feed(f) for f in self.frames(3000, 20)]        # 1.6 s of talk
        self.assertTrue(all(o is None for o in out))
        got = None
        for f in self.frames(60, 15):                           # 1.2 s quiet
            got = e.feed(f) if got is None else got
        self.assertIsNotNone(got)
        self.assertGreaterEqual(len(got), 20 * 1280)            # nothing clipped

    def test_ignores_a_click(self):
        from jarvis_voice import Endpointer
        e = Endpointer()
        for f in self.frames(60, 30) + self.frames(3000, 3) + self.frames(60, 20):
            self.assertIsNone(e.feed(f))


if __name__ == "__main__":
    unittest.main()
