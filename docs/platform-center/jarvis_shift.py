#!/usr/bin/env python3
"""Jarvis crew shift: write the crew's routine work into the saved city.

The Jarvis routine (a scheduled Claude run) does each crew member's job, puts
the results in an updates file, then runs:

    python3 jarvis_shift.py state.json updates.json out.json

state.json is the city document (data/owner-hub/city/state) as read with
ArtifactData; out.json is written back with ArtifactData "set" pinned to the
version that was read. updates.json looks like:

    {"crew": {"Nova": {"status": "working", "job": "...", "chat": "...",
                       "tasks": [{"title": "...", "result": "...",
                                  "summary": "...", "needsNic": false}]}}}

A task whose title matches an open task fills that task in; any other title
becomes a new task from Jarvis. The crew ticks its own work off ("View work"
in the city). A task with "needsNic": true stays open with "Your part" so nic
sees "Check work"; "new": true with no result just adds the task to the list.
Chat lines land in the crew member's chat, which the city keeps to 40.

Voice status feed for Hey Jarvis (the fork is PUBLIC, so this keeps only
harmless bits: crew status, task titles, short crew notes; emails, phone
numbers, links and money amounts are scrubbed, and Ledger (money) shows
only its status):

    python3 jarvis_shift.py --status out.json status.json
"""
import json
import random
import re
import string
import sys
import time

MAX_CHAT = 40
MAX_RESULT = 6000
MAX_BYTES = 200_000


def uid():
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))


def norm(s):
    return ' '.join(str(s).lower().split())


def apply(state, updates):
    now = int(time.time() * 1000)
    by_name = {b['name']: b for b in state['buildings']}
    for name, up in updates.get('crew', {}).items():
        b = by_name.get(name)
        if not b:
            print(f'skip: no crew member called {name}', file=sys.stderr)
            continue
        if up.get('status') in ('idle', 'working', 'stuck'):
            b['status'] = up['status']
        if 'job' in up:
            b['job'] = str(up['job'])[:120]
        if up.get('chat'):
            b.setdefault('chat', []).append({'at': now, 'role': 'agent', 'text': str(up['chat'])[:MAX_RESULT]})
            b['chat'] = b['chat'][-MAX_CHAT:]
        for t in up.get('tasks', []):
            want = norm(t['title'])
            k = next((x for x in b['tasks'] if not x.get('done') and norm(x['title']) == want), None)
            if k is None:
                k = {'id': uid(), 'title': t['title'], 'due': t.get('due', ''), 'done': False,
                     'doneAt': '', 'from': 'Jarvis', 'result': '', 'summary': '', 'nicStep': '',
                     'review': False, 'resultAt': 0}
                b['tasks'].append(k)
            if t.get('new') and not t.get('result'):
                continue
            k['result'] = str(t.get('result', ''))[:MAX_RESULT]
            k['summary'] = str(t.get('summary', ''))[:200]
            k['resultAt'] = now
            if t.get('needsNic'):
                k['nicStep'] = str(t.get('nicStep') or 'Check this and tick it off.')
                k['review'] = True
            else:
                k['nicStep'] = ''
                k['review'] = False
                k['done'] = True
                k['doneAt'] = now
    state['updatedAt'] = now
    # Keep the document under the db limit: trim the oldest chat first.
    keep = MAX_CHAT
    while len(json.dumps(state)) > MAX_BYTES and keep > 4:
        keep -= 4
        for b in state['buildings']:
            b['chat'] = b.get('chat', [])[-keep:]
    return state


_SCRUB = [
    (re.compile(r'\S+@\S+'), '[email]'),
    (re.compile(r'https?://\S+|www\.\S+'), ''),
    (re.compile(r'[£$€]\s?\d[\d,.]*(?:\s?[kKmM]\b)?|\b\d[\d,.]*\s?(?:GBP|USD|EUR|pounds?|dollars?|euros?)\b'), '[amount]'),
    (re.compile(r'\+?\d[\d ()-]{8,}\d'), '[number]'),
    (re.compile(r'[*_#`>|]+'), ''),
]


def scrub(text, limit):
    t = str(text or '')
    for rx, sub in _SCRUB:
        t = rx.sub(sub, t)
    t = ' '.join(t.split())
    return t if len(t) <= limit else t[:limit].rsplit(' ', 1)[0] + '...'


def public_status(state, now_ms=None):
    """The small public feed Hey Jarvis reads aloud (see the docstring)."""
    now_ms = now_ms or int(time.time() * 1000)
    day_ago = now_ms - 24 * 3600 * 1000
    crew, waiting, briefing = [], [], ''
    for b in state.get('buildings', []):
        name = b.get('name', '')
        money = name == 'Ledger'
        tasks = b.get('tasks', [])
        done = [scrub(t['title'], 90) for t in tasks
                if t.get('done') and isinstance(t.get('doneAt'), int) and t['doneAt'] >= day_ago]
        open_ = [t for t in tasks if not t.get('done')]
        for t in open_:
            if t.get('review'):
                waiting.append({'crew': name, 'task': scrub(t['title'], 90),
                                'step': scrub(t.get('nicStep', ''), 120)})
        notes = [c for c in b.get('chat', []) if c.get('role') == 'agent' and c.get('at', 0) >= day_ago]
        latest = '' if money or not notes else scrub(notes[-1].get('text', ''), 220)
        if name == 'Nova' and latest:
            briefing, latest = scrub(notes[-1].get('text', ''), 360), ''
        nxt = next((t for t in open_ if not t.get('review')), None)
        crew.append({'name': name, 'place': scrub(b.get('place', ''), 30),
                     'status': b.get('status', 'idle'),
                     'job': '' if money else scrub(b.get('job', ''), 80),
                     'done': [] if money else done[-3:], 'open': len(open_),
                     'next': scrub(nxt['title'], 90) if nxt and not money else '',
                     'latest': latest})
    return {'updated': time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime(now_ms / 1000)),
            'briefing': briefing, 'crew': crew, 'waiting_on_nic': waiting[:8]}


if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == '--status':
        with open(sys.argv[2]) as f:
            feed = public_status(json.load(f))
        with open(sys.argv[3], 'w') as f:
            json.dump(feed, f, ensure_ascii=False, indent=1)
        print('status ok', len(feed['crew']), 'crew,', len(feed['waiting_on_nic']), 'waiting on nic')
        sys.exit(0)
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    with open(sys.argv[1]) as f:
        state = json.load(f)
    with open(sys.argv[2]) as f:
        updates = json.load(f)
    with open(sys.argv[3], 'w') as f:
        json.dump(apply(state, updates), f, ensure_ascii=False)
    print('ok', len(json.dumps(state)), 'bytes')
