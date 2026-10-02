"""Jarvis's brain on Claude: Claude Code in print mode, nic's own account.

Each turn runs:
    claude -p --model haiku --output-format json --permission-mode default
           --append-system-prompt-file <persona+status> [--resume <id>]
           --allowedTools <read tools> --disallowedTools <write tools>
with the turn text on stdin and cwd = %LOCALAPPDATA%\\HeyJarvis\\brain (a
folder holding only Jarvis's CLAUDE.md, so no code repo is ever loaded).

Connector tools (claude.ai Gmail, Calendar, Slack...) are named
mcp__claude_ai_<Connector>__<tool>. Their real names are read once from the
CLI's start-up message and sorted: read/search tools (and Gmail drafts) are
allowed, everything that sends, deletes, posts, buys or changes accounts is
blocked. In print mode any tool that is not allowed is refused, so an
unknown tool can never run. No proxy, base-URL override or permission
bypass is ever used.
"""

import json
import os
import re
import shutil
import subprocess
import time

CONNECTOR_PREFIX = "mcp__claude_ai_"
DEFAULT_MODEL = "haiku"
TURN_TIMEOUT = 90
MAX_TURNS = "8"

# Built-in tools Jarvis may use / must never use.
BUILTIN_ALLOWED = ["WebSearch"]
BUILTIN_BLOCKED = ["Bash", "Edit", "Write", "MultiEdit", "NotebookEdit",
                   "Task", "Agent", "KillShell"]
# Whole connectors that only do actions: blocked outright.
BLOCKED_SERVERS = ["mcp__claude_ai_Zapier"]

READ_WORDS = {"search", "get", "list", "read", "find", "fetch", "query",
              "lookup", "view", "show", "describe", "count", "check",
              "retrieve", "profile", "info", "summary", "summarize", "free",
              "busy", "availability", "threads", "thread", "messages",
              "message", "events", "event", "channels", "history"}
WRITE_WORDS = {"send", "delete", "remove", "trash", "archive", "post",
               "publish", "create", "update", "edit", "modify", "write",
               "schedule", "share", "purchase", "buy", "pay", "order",
               "invite", "add", "move", "cancel", "reply", "forward",
               "upload", "set", "mark", "approve", "execute", "run",
               "trigger", "rename", "patch", "put", "submit", "accept",
               "decline", "rsvp", "comment", "react", "transfer", "enable",
               "disable", "connect", "disconnect", "revoke", "grant",
               "account", "password", "billing", "subscribe", "unsubscribe",
               "label", "unlabel", "star", "mute", "block", "requeue",
               "boost", "promote", "checkout", "refund", "charge"}


class BrainOffline(Exception):
    """No brain answered."""


class ClaudeMissing(BrainOffline):
    """The claude CLI isn't installed or isn't signed in."""


# ------------------------------------------------------------- find CLI --

def find_claude(env=None, which=shutil.which, isfile=os.path.isfile):
    """claude.exe, then claude.cmd on PATH, then ~/.local/bin, then npm."""
    env = os.environ if env is None else env
    for name in ("claude.exe", "claude.cmd", "claude"):
        p = which(name)
        if p:
            return p
    home = env.get("USERPROFILE") or os.path.expanduser("~")
    cands = [os.path.join(home, ".local", "bin", "claude.exe")]
    if env.get("APPDATA"):
        cands.append(os.path.join(env["APPDATA"], "npm", "claude.cmd"))
    cands.append(os.path.join(home, "AppData", "Roaming", "npm", "claude.cmd"))
    for c in cands:
        if isfile(c):
            return c
    return None


# ---------------------------------------------------------- permissions --

def _tokens(tool):
    name = tool.split("__")[-1]
    name = re.sub(r"([a-z])([A-Z])", r"\1_\2", name).lower()
    return set(t for t in re.split(r"[^a-z]+", name) if t)


def classify_tool(tool):
    """'allow' or 'block' for one connector tool name."""
    server = tool.split("__")[1] if tool.count("__") >= 2 else ""
    if any(tool == s or tool.startswith(s + "__") for s in BLOCKED_SERVERS):
        return "block"
    t = _tokens(tool)
    if server.lower() == "claude_ai_gmail" and "draft" in t | {
            w[:-1] for w in t if w.endswith("s")}:
        bad = t & {"send", "delete", "remove", "trash", "forward", "reply"}
        return "block" if bad else "allow"
    if t & WRITE_WORDS:
        return "block"
    return "allow" if t & READ_WORDS else "block"


def split_tools(tool_names):
    """Connector tools from the CLI's tool list -> (allowed, blocked)."""
    allow, block = [], []
    for name in tool_names or []:
        if not name.startswith(CONNECTOR_PREFIX):
            continue
        (allow if classify_tool(name) == "allow" else block).append(name)
    return sorted(allow), sorted(block)


def permission_lists(cfg, discovered=None):
    """(allowedTools, disallowedTools) for the CLI. Blocked always wins."""
    allow, block = split_tools(discovered)
    allow = BUILTIN_ALLOWED + allow + list(cfg.get("allowed_tools") or [])
    block = (BUILTIN_BLOCKED + BLOCKED_SERVERS + block
             + list(cfg.get("blocked_tools") or []))
    allow = [a for a in dict.fromkeys(allow) if a not in block]
    return allow, list(dict.fromkeys(block))


def build_command(exe, model, prompt_file, allowed, blocked, session_id=None):
    cmd = [exe, "-p", "--model", model or DEFAULT_MODEL,
           "--output-format", "json", "--permission-mode", "default",
           "--max-turns", MAX_TURNS,
           "--append-system-prompt-file", prompt_file]
    if session_id:
        cmd += ["--resume", session_id]
    if allowed:
        cmd += ["--allowedTools", ",".join(allowed)]
    if blocked:
        cmd += ["--disallowedTools", ",".join(blocked)]
    return cmd


NOT_SIGNED_IN = ("not logged in", "please run /login", "/login", "invalid api key",
                 "authentication", "unauthorized", "oauth", "credit balance")


def parse_result(stdout, stderr="", code=0):
    """CLI JSON -> (reply, session_id). Raises the right BrainOffline."""
    data = None
    for line in reversed((stdout or "").strip().splitlines()):
        try:
            data = json.loads(line)
            break
        except ValueError:
            continue
    blob = ((stderr or "") + " " + json.dumps(data or "")).lower()
    if data is None or data.get("is_error") or code:
        if any(w in blob for w in NOT_SIGNED_IN):
            raise ClaudeMissing("Claude Code is not signed in")
        raise BrainOffline("claude failed (exit %s)" % code)
    reply = data.get("result") or ""
    if not reply.strip():
        raise BrainOffline("claude gave an empty answer")
    return reply, data.get("session_id")


# ---------------------------------------------------------------- brain --

class ClaudeBrain:
    """Talks to Claude Code; keeps one session per conversation."""

    def __init__(self, brain_dir, cfg=None, exe=None, run=subprocess.run,
                 finder=find_claude):
        self.cfg = cfg or {}
        self.brain_dir = brain_dir
        self.exe = exe or finder()
        self.run = run
        self.session_id = None
        self.discovered = None

    def new_session(self):
        self.session_id = None

    def _write_prompt(self, system):
        os.makedirs(self.brain_dir, exist_ok=True)
        path = os.path.join(self.brain_dir, "turn_prompt.txt")
        with open(path, "w", encoding="utf-8") as f:
            f.write(system)
        return path

    def discover_tools(self, popen=subprocess.Popen, timeout=45):
        """Read the real tool names from the CLI's init message, then stop
        it before it asks the model anything. Cached in tools.json."""
        cache = os.path.join(self.brain_dir, "tools.json")
        try:
            if time.time() - os.path.getmtime(cache) < 12 * 3600:
                with open(cache, encoding="utf-8") as f:
                    self.discovered = json.load(f)
                return self.discovered
        except (OSError, ValueError):
            pass
        if not self.exe:
            return None
        tools = None
        try:
            p = popen([self.exe, "-p", "--output-format", "stream-json",
                       "--verbose", "--model", self.cfg.get("model") or DEFAULT_MODEL,
                       "--permission-mode", "default", "--max-turns", "1",
                       "--disallowedTools", ",".join(BUILTIN_BLOCKED)],
                      cwd=self.brain_dir, stdin=subprocess.PIPE,
                      stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                      text=True, encoding="utf-8", creationflags=_NO_WINDOW)
            p.stdin.write("ok")
            p.stdin.close()
            end = time.time() + timeout
            for line in p.stdout:
                try:
                    m = json.loads(line)
                except ValueError:
                    continue
                if m.get("type") == "system" and m.get("subtype") == "init":
                    tools = m.get("tools") or []
                    break
                if time.time() > end:
                    break
            p.kill()
        except Exception:
            tools = None
        if tools is not None:
            self.discovered = tools
            try:
                with open(cache, "w", encoding="utf-8") as f:
                    json.dump(tools, f)
            except OSError:
                pass
        return tools

    def ask(self, text, system):
        if not self.exe:
            raise ClaudeMissing("claude CLI not found")
        allowed, blocked = permission_lists(self.cfg, self.discovered)
        cmd = build_command(self.exe, self.cfg.get("model"),
                            self._write_prompt(system), allowed, blocked,
                            self.session_id)
        try:
            r = self.run(cmd, input=text, capture_output=True, text=True,
                         encoding="utf-8", cwd=self.brain_dir,
                         timeout=self.cfg.get("claude_timeout", TURN_TIMEOUT),
                         creationflags=_NO_WINDOW)
        except FileNotFoundError:
            raise ClaudeMissing("claude CLI not found")
        except subprocess.TimeoutExpired:
            raise BrainOffline("claude took too long")
        reply, sid = parse_result(r.stdout, r.stderr, r.returncode)
        if sid:
            self.session_id = sid
        return reply


_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


class BrainChain:
    """Claude first; OmniRoute only if Claude fails and the fallback is on."""

    def __init__(self, claude, fallback=None):
        self.claude = claude
        self.fallback = fallback
        self.used = None

    def new_session(self):
        if self.claude:
            self.claude.new_session()

    def reply(self, text, system, history):
        err = None
        if self.claude:
            try:
                out = self.claude.ask(text, system)
                self.used = "claude"
                return out
            except BrainOffline as e:
                err = e
        if self.fallback:
            msgs = [{"role": "system", "content": system}] + list(history) + [
                {"role": "user", "content": text}]
            try:
                out = self.fallback.chat(msgs)
                self.used = "omniroute"
                return out
            except BrainOffline:
                pass
        raise err or ClaudeMissing("no Claude brain")


BRAIN_RULES = """
# Rules for Jarvis (always)

- Gmail is drafts only. You may search and read mail and create drafts. You
  never send, forward, reply-send, delete, trash or archive anything.
- Nothing goes out without nic saying so in words. Even then you only write a
  draft and tell him it is waiting in his Drafts folder for him to send.
- Never post or publish (Buffer, social media, Slack messages), never buy or
  pay for anything, never delete anything, never change accounts, settings,
  passwords or billing. If asked, say plainly you can't do that from here.
- Reading is fine: email, calendar, Slack, docs and the company status.
- If a connector or tool isn't reachable, say so in one short sentence and
  carry on. Never pretend you checked something you couldn't.
- You are not a coding assistant here. Don't read or change files or run
  commands.
"""


def write_brain_dir(brain_dir, persona):
    """The folder Claude Code runs in: just Jarvis's CLAUDE.md."""
    os.makedirs(brain_dir, exist_ok=True)
    path = os.path.join(brain_dir, "CLAUDE.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("# Jarvis\n\n" + persona.strip() + "\n" + BRAIN_RULES)
    return path
