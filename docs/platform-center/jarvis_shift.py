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
"""
import json
import random
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


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    with open(sys.argv[1]) as f:
        state = json.load(f)
    with open(sys.argv[2]) as f:
        updates = json.load(f)
    with open(sys.argv[3], 'w') as f:
        json.dump(apply(state, updates), f, ensure_ascii=False)
    print('ok', len(json.dumps(state)), 'bytes')
