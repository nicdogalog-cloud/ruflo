/* Platform Center: the building panel (Now, Tasks, Links, Notes, Schedule,
 * Chat, Delegate, Ruflo) and the Meeting Hall's weekly review.
 */
(function () {
  'use strict';
  const PC = (window.PC = window.PC || {});
  const { h, icon, copy, cmd, dueInfo, fmtTime, runsOn } = PC.ui;
  const { REPEATS, RUFLO_TYPES, task: newTask, link: newLink, job: newJob } = PC.util;

  const TABS = [['now', 'Now'], ['tasks', 'Tasks'], ['links', 'Links'], ['notes', 'Notes'], ['schedule', 'Schedule'], ['chat', 'Chat'], ['delegate', 'Delegate'], ['ruflo', 'Ruflo']];
  const HALL_TABS = [['review', 'This week'], ['notes', 'Retro notes']];
  const PLUGIN_AGENTS = ['nova', 'forge', 'pixel', 'atlas', 'sol', 'ledger', 'cog', 'wicket'];

  let el = null;
  let currentId = null;
  let tab = 'now';
  const ai = { busy: false, bid: null, text: '', log: [], ctl: null, meeting: '' };

  const state = () => PC.store.get();
  const find = (s, id) => s.buildings.find((b) => b.id === id);
  const change = (fn, opts) => PC.app.change(fn, opts);
  const openTasks = (b) => b.tasks.filter((t) => !t.done).sort((a, c) => (a.due || '9999') < (c.due || '9999') ? -1 : 1);
  // a building that looks after a website/app calls its task list the update list
  const tabsFor = (b) => (b.hall ? HALL_TABS : TABS.filter(([k]) => k !== 'delegate' || b.lead).map(([k, l]) => [k, k === 'tasks' && b.site ? 'Updates' : l]));

  /* keep typing, focus and caret across re-renders */
  function preserve() {
    const saved = {};
    el.querySelectorAll('input[id], textarea[id], select[id]').forEach((n) => { saved[n.id] = n.value; });
    const a = document.activeElement;
    const focus = a && el.contains(a) && a.id ? { id: a.id, s: a.selectionStart, e: a.selectionEnd } : null;
    const log = el.querySelector('.chat-log');
    return { saved, focus, atBottom: log ? log.scrollHeight - log.scrollTop - log.clientHeight < 40 : true };
  }
  function restore(p) {
    Object.entries(p.saved).forEach(([id, v]) => { const n = document.getElementById(id); if (n && n.dataset.keep !== 'no' && n.type !== 'checkbox') n.value = v; });
    if (p.focus) {
      const n = document.getElementById(p.focus.id);
      if (n) { n.focus({ preventScroll: true }); try { if (p.focus.s != null) n.setSelectionRange(p.focus.s, p.focus.e); } catch (e) { /* not a text field */ } }
    }
    const log = el.querySelector('.chat-log');
    if (log && p.atBottom) log.scrollTop = log.scrollHeight;
  }

  function render() {
    if (!el || !currentId) return;
    const s = state();
    const b = find(s, currentId);
    if (!b) { PC.panel.close(); return; }
    if (!tabsFor(b).some(([k]) => k === tab)) tab = tabsFor(b)[0][0];
    const kept = preserve();
    el.style.setProperty('--b', b.color);
    el.replaceChildren(header(s, b), tabBar(b), h('div', { class: 'panel-body', id: 'panel-body' }, body(s, b)));
    restore(kept);
  }

  function header(s, b) {
    const statusBtn = (v, label) => h('button', {
      type: 'button', class: 'seg' + (b.status === v ? ' on ' + v : ''), 'aria-pressed': String(b.status === v),
      onclick: () => change((st) => { find(st, b.id).status = v; }),
    }, label);
    return h('header', { class: 'panel-head' },
      h('div', { class: 'panel-top' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close panel', onclick: () => PC.panel.close() }, icon('back')),
        h('div', { class: 'panel-id' },
          h('h2', { id: 'panel-title' }, h('span', { class: 'swatch' }), b.name),
          h('p', { class: 'eyebrow', text: b.hall ? b.place : `${b.place} · ruflo ${b.ruflo}` })),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => PC.app.editBuilding(b.id) }, icon('edit'), 'Edit')),
      h('p', { class: 'role', text: b.role }),
      b.hall ? null : h('div', { class: 'status-row' },
        h('div', { class: 'segs', role: 'group', 'aria-label': 'Status' }, statusBtn('idle', 'Idle'), statusBtn('working', 'Working'), statusBtn('stuck', 'Stuck')),
        h('input', {
          id: `job-${b.id}`, class: 'job-input', type: 'text', maxlength: '80', placeholder: 'Working on…', value: b.job, 'aria-label': 'What this building is working on',
          onchange: (e) => change((st) => { find(st, b.id).job = e.target.value.trim(); }),
        })));
  }

  function tabBar(b) {
    return h('div', { class: 'tabs', role: 'tablist', 'aria-label': `${b.name} sections` },
      tabsFor(b).map(([k, label]) => h('button', {
        type: 'button', role: 'tab', class: 'tab' + (tab === k ? ' on' : ''), 'aria-selected': String(tab === k),
        onclick: () => { tab = k; try { localStorage.setItem('platform-center:tab', k); } catch (e) { /* ignore */ } render(); },
      }, label)));
  }

  function body(s, b) {
    switch (tab) {
      case 'tasks': return tasksTab(b);
      case 'links': return linksTab(b);
      case 'notes': return notesTab(b);
      case 'schedule': return scheduleTab(b);
      case 'chat': return chatTab(s, b);
      case 'delegate': return delegateTab(s, b);
      case 'ruflo': return rufloTab(s, b);
      case 'review': return reviewTab(s, b);
      default: return nowTab(s, b);
    }
  }

  /* ---------- pieces ---------- */
  function taskRow(b, t, n) {
    const d = dueInfo(t.due);
    return h('li', { class: 'task' + (t.done ? ' done' : '') },
      h('input', {
        type: 'checkbox', checked: t.done, 'aria-label': `Mark “${t.title}” ${t.done ? 'not done' : 'done'}`,
        onchange: () => change((st) => { const k = find(st, b.id).tasks.find((x) => x.id === t.id); k.done = !k.done; k.doneAt = k.done ? Date.now() : ''; }),
      }),
      n ? h('span', { class: 'num', text: n }) : null,
      h('span', { class: 'task-title', text: t.title }),
      t.from ? h('span', { class: 'chip from', text: `from ${t.from}` }) : null,
      d && !t.done ? h('span', { class: `chip due ${d.cls}`, text: d.text }) : null,
      h('button', { class: 'icon-btn tiny', type: 'button', 'aria-label': `Delete “${t.title}”`, onclick: () => change((st) => { const x = find(st, b.id); x.tasks = x.tasks.filter((k) => k.id !== t.id); }) }, icon('trash')));
  }

  function addTaskForm(b, compact) {
    const title = h('input', { id: `new-task-${b.id}`, type: 'text', placeholder: 'Add a task…', maxlength: '200', 'aria-label': 'New task', required: true });
    const due = compact ? null : h('input', { id: `new-due-${b.id}`, type: 'date', 'aria-label': 'Due date' });
    return h('form', {
      class: 'add-row', onsubmit: (e) => {
        e.preventDefault();
        const v = title.value.trim();
        if (!v) return;
        const k = newTask(v, due ? due.value : '');
        title.value = ''; if (due) due.value = '';
        change((st) => { find(st, b.id).tasks.push(k); });
        PC.ui.toast(`Added to ${b.name}`);
      },
    }, title, due, h('button', { class: 'btn', type: 'submit' }, icon('plus'), 'Add'));
  }

  /* ---------- website/app slot ---------- */
  let siteEdit = null; // the building whose link form is open
  function siteSlot(b) {
    const cur = b.site;
    const editing = siteEdit === b.id || !cur.url;
    const head = h('h3', { text: cur.label });
    if (!editing) {
      return h('section', { class: 'block site-slot' }, head,
        h('a', { class: 'site-link', href: cur.url, target: '_blank', rel: 'noopener noreferrer' },
          h('span', { class: 'url', text: cur.url.replace(/^https?:\/\//, '').replace(/\/$/, '') }),
          cur.tag ? h('span', { class: 'chip tag', text: cur.tag }) : null, icon('out')),
        h('div', { class: 'row' },
          h('button', { class: 'btn ghost small', type: 'button', onclick: () => copy(cur.url) }, icon('copy'), 'Copy link'),
          h('button', { class: 'btn ghost small', type: 'button', onclick: () => { siteEdit = b.id; render(); } }, icon('edit'), 'Change link')));
    }
    const url = h('input', { id: `site-url-${b.id}`, type: 'text', inputmode: 'url', value: cur.url, placeholder: 'Paste the web address or app store link', 'aria-label': `${cur.label} link` });
    const tag = h('input', { id: `site-tag-${b.id}`, type: 'text', maxlength: '30', value: cur.tag, placeholder: 'What it is, like Test site', 'aria-label': 'What this link is' });
    const save = (raw) => {
      const u = raw ? PC.ui.safeUrl(raw) : '';
      if (raw && !u) { PC.ui.toast('That link doesn’t look right. Copy the full address from your browser.'); url.focus(); return; }
      siteEdit = null;
      change((st) => { const x = find(st, b.id); x.site = { ...x.site, url: u, tag: u ? tag.value.trim().slice(0, 30) : '' }; });
      PC.ui.toast(u ? 'Link saved' : 'Link removed');
    };
    return h('section', { class: 'block site-slot empty' }, head,
      h('p', { class: 'hint', text: cur.url ? 'Change the link or what it is. Leave the link empty to remove it.' : `No link yet. This slot is for the ${cur.label} link.` }),
      h('form', { class: 'add-row', onsubmit: (e) => { e.preventDefault(); save(url.value.trim()); } },
        url, tag, h('button', { class: 'btn', type: 'submit' }, icon('check'), 'Save link'),
        cur.url ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { siteEdit = null; render(); } }, 'Cancel') : null));
  }

  function nowTab(s, b) {
    const next = openTasks(b).slice(0, b.site ? 4 : 3);
    const jobs = b.schedule.filter((j) => runsOn(j)).sort((a, c) => (a.time < c.time ? -1 : 1));
    const crew = b.lead ? h('section', { class: 'block' },
      h('h3', { text: 'The crew' }),
      h('ul', { class: 'crew' }, s.buildings.filter((x) => x.id !== b.id && !x.hall).map((x) => h('li', {},
        h('button', { type: 'button', class: 'crew-row', onclick: () => PC.panel.open(x.id) },
          h('span', { class: `dot ${x.status}` }),
          h('strong', { text: x.name }),
          h('span', { class: 'muted', text: x.job ? `on: ${x.job}` : x.place }),
          h('span', { class: 'count', text: `${x.tasks.filter((t) => !t.done).length} open` })))))) : null;
    return [
      b.site ? siteSlot(b) : null,
      h('section', { class: 'block' },
        h('h3', { text: b.site ? 'Needs updating' : 'Next up' }),
        next.length ? h('ul', { class: 'tasks' }, next.map((t) => taskRow(b, t))) : h('p', { class: 'empty', text: b.site ? 'Nothing on the update list. Add the next change below.' : 'Nothing waiting here. Add the next step below.' }),
        addTaskForm(b, true)),
      h('section', { class: 'block' },
        h('h3', { text: 'On the schedule today' }),
        jobs.length ? h('ul', { class: 'jobs' }, jobs.map((j) => h('li', {}, h('span', { class: 'time', text: fmtTime(j.time) }), j.title)))
          : h('p', { class: 'empty', text: 'Nothing scheduled today. Add a repeating job in Schedule.' })),
      b.links.length ? h('section', { class: 'block' },
        h('h3', { text: 'Quick links' }),
        h('div', { class: 'link-grid' }, b.links.slice(0, 6).map((l) => h('a', { class: 'link-btn', href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.title, icon('out'))))) : null,
      crew,
    ];
  }

  function tasksTab(b) {
    const open = openTasks(b);
    const done = b.tasks.filter((t) => t.done).sort((a, c) => (c.doneAt || 0) - (a.doneAt || 0));
    return [
      b.site ? h('p', { class: 'hint', text: `The update list for the ${b.site.label}. Tick a change off once it is live.` }) : null,
      addTaskForm(b, false),
      open.length ? h('ol', { class: 'tasks numbered' }, open.map((t, i) => taskRow(b, t, i + 1))) : h('p', { class: 'empty', text: 'All clear. Add what this building should do next.' }),
      done.length ? h('details', { class: 'done-list' },
        h('summary', { text: `Done (${done.length})` }),
        h('ul', { class: 'tasks' }, done.map((t) => taskRow(b, t))),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => change((st) => { const x = find(st, b.id); x.tasks = x.tasks.filter((k) => !k.done); }) }, 'Clear done tasks')) : null,
    ];
  }

  function linksTab(b) {
    const title = h('input', { id: `new-link-title-${b.id}`, type: 'text', placeholder: 'Name, like Shopify', maxlength: '60', 'aria-label': 'Link name' });
    const url = h('input', { id: `new-link-url-${b.id}`, type: 'text', inputmode: 'url', placeholder: 'Web address', 'aria-label': 'Web address' });
    return [
      b.site ? siteSlot(b) : null,
      h('p', { class: 'hint', text: 'Keep every account, dashboard and tool for this area here, so it is one tap away.' }),
      h('form', {
        class: 'add-row', onsubmit: (e) => {
          e.preventDefault();
          const u = PC.ui.safeUrl(url.value);
          if (!u) { PC.ui.toast('That web address doesn’t look right. Try something like shopify.com'); url.focus(); return; }
          const name = title.value.trim() || new URL(u).hostname.replace(/^www\./, '');
          title.value = ''; url.value = '';
          change((st) => { find(st, b.id).links.push(newLink(name, u)); });
        },
      }, title, url, h('button', { class: 'btn', type: 'submit' }, icon('plus'), 'Add')),
      b.links.length ? h('ul', { class: 'links' }, b.links.map((l) => h('li', {},
        h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, h('strong', { text: l.title }), h('span', { class: 'muted', text: l.url.replace(/^https?:\/\//, '').replace(/\/$/, '') })),
        h('button', { class: 'icon-btn tiny', type: 'button', 'aria-label': `Copy ${l.title} address`, onclick: () => copy(l.url) }, icon('copy')),
        h('button', { class: 'icon-btn tiny', type: 'button', 'aria-label': `Delete ${l.title}`, onclick: () => change((st) => { const x = find(st, b.id); x.links = x.links.filter((k) => k.id !== l.id); }) }, icon('trash')))))
        : h('p', { class: 'empty', text: 'No links yet.' }),
    ];
  }

  let noteTimer = 0;
  function notesTab(b) {
    return [
      h('p', { class: 'hint', text: b.hall ? 'Friday retro: what went well, what got stuck, what matters next week.' : 'Ideas, plans, logins hints (never passwords), anything worth keeping.' }),
      h('textarea', {
        id: `notes-${b.id}`, class: 'notes', rows: '14', 'aria-label': `${b.name} notes`, value: b.notes,
        placeholder: b.hall ? 'Went well:\n\nGot stuck:\n\nNext week:' : 'Start typing. It saves on its own.',
        oninput: (e) => {
          const v = e.target.value;
          clearTimeout(noteTimer);
          noteTimer = setTimeout(() => change((st) => { find(st, b.id).notes = v; }, { quiet: true }), 600);
        },
      }),
    ];
  }

  function scheduleTab(b) {
    const title = h('input', { id: `new-job-${b.id}`, type: 'text', placeholder: 'Job, like Post on TikTok', maxlength: '160', 'aria-label': 'Job' });
    const time = h('input', { id: `new-job-time-${b.id}`, type: 'time', value: '09:00', 'aria-label': 'Time' });
    const rep = h('select', { id: `new-job-rep-${b.id}`, 'aria-label': 'Repeats' }, Object.entries(REPEATS).map(([k, v]) => h('option', { value: k, text: v })));
    const jobs = b.schedule.slice().sort((a, c) => (a.time < c.time ? -1 : 1));
    return [
      h('p', { class: 'hint', text: 'Repeating jobs show up in the morning brief on the days they run.' }),
      h('form', {
        class: 'add-row', onsubmit: (e) => {
          e.preventDefault();
          const v = title.value.trim();
          if (!v) return;
          change((st) => { find(st, b.id).schedule.push(newJob(v, time.value || '09:00', rep.value)); });
          title.value = '';
        },
      }, title, time, rep, h('button', { class: 'btn', type: 'submit' }, icon('plus'), 'Add')),
      jobs.length ? h('ul', { class: 'jobs' }, jobs.map((j) => h('li', {},
        h('span', { class: 'time', text: fmtTime(j.time) }),
        h('span', { class: 'grow', text: j.title }),
        h('span', { class: 'chip', text: REPEATS[j.repeat] || j.repeat }),
        h('button', { class: 'icon-btn tiny', type: 'button', 'aria-label': `Delete ${j.title}`, onclick: () => change((st) => { const x = find(st, b.id); x.schedule = x.schedule.filter((k) => k.id !== j.id); }) }, icon('trash')))))
        : h('p', { class: 'empty', text: 'No repeating jobs yet.' }),
    ];
  }

  /* ---------- chat ---------- */
  async function send(b, text) {
    text = text.trim();
    if (!text || ai.busy) return;
    const bid = b.id;
    change((st) => { find(st, bid).chat.push({ role: 'me', text, at: Date.now() }); });
    if (!PC.ai.available()) {
      const r = PC.ai.offline(find(state(), bid), text);
      change((st) => { find(st, bid).chat.push({ role: 'agent', text: r.text, at: Date.now() }); });
      if (r.action === 'brief') PC.app.openBrief();
      return;
    }
    Object.assign(ai, { busy: true, bid, text: '', log: [], ctl: new AbortController() });
    render();
    let reply = '';
    try {
      const res = await PC.ai.chat(find(state(), bid), {
        signal: ai.ctl.signal,
        onText: ({ text: t }) => { ai.text = t; const n = document.getElementById('stream-text'); if (n) n.textContent = t; },
        onLog: (line) => { ai.log.push(line); },
      });
      reply = res.text + (res.truncated ? '\n\n(I got cut off. Ask me to continue.)' : '');
    } catch (e) {
      if (e && e.code === 'cancelled') reply = e.text ? `${e.text}\n\n(stopped)` : '';
      else reply = [e && e.text, PC.ai.errorText(e)].filter(Boolean).join('\n\n');
    }
    const log = ai.log.slice();
    Object.assign(ai, { busy: false, bid: null, text: '', log: [], ctl: null });
    change((st) => {
      const x = find(st, bid);
      if (!x) return;
      if (log.length) x.chat.push({ role: 'agent', text: log.map((l) => `✓ ${l}`).join('\n'), at: Date.now() });
      if (reply) x.chat.push({ role: 'agent', text: reply, at: Date.now() });
    });
  }

  function chatTab(s, b) {
    const input = h('textarea', { id: `chat-in-${b.id}`, rows: '2', placeholder: `Message ${b.name}…`, 'aria-label': `Message ${b.name}`, maxlength: '2000' });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const v = input.value; input.value = ''; send(b, v); } });
    const mine = ai.busy && ai.bid === b.id;
    const bubbles = [h('div', { class: 'bubble agent intro', text: PC.ai.greeting(s, b) })].concat(
      b.chat.map((m) => h('div', { class: `bubble ${m.role}`, text: m.text })));
    if (mine) {
      bubbles.push(h('div', { class: 'bubble agent live' },
        ai.log.length ? h('div', { class: 'tool-log', text: ai.log.map((l) => `✓ ${l}`).join('\n') }) : null,
        h('span', { id: 'stream-text', text: ai.text || 'Thinking…' })));
    }
    const quick = PC.ai.quickPrompts(b).map((p) => h('button', {
      type: 'button', class: 'chip-btn', disabled: ai.busy, onclick: () => {
        if (!PC.ai.available() && p === 'Delegate a job') { input.value = 'delegate  to Atlas'; input.focus(); input.setSelectionRange(9, 9); return; }
        send(b, p);
      },
    }, p));
    return [
      h('p', { class: 'mode ' + (PC.ai.available() ? 'on' : 'off'), text: PC.ai.available()
        ? `Live answers through your claude.ai account.${PC.ai.canUseTools() ? ` ${b.name} can add tasks and schedules for you.` : ''}`
        : 'Offline helper: it follows simple orders. Type help to see them. Open it on claude.ai for live answers.' }),
      h('div', { class: 'chat-log', 'aria-live': 'polite' }, bubbles),
      h('div', { class: 'quick' }, quick),
      h('form', { class: 'chat-form', onsubmit: (e) => { e.preventDefault(); const v = input.value; input.value = ''; send(b, v); } },
        input,
        mine ? h('button', { class: 'btn stop', type: 'button', onclick: () => ai.ctl && ai.ctl.abort() }, icon('stop'), 'Stop')
          : h('button', { class: 'btn', type: 'submit', disabled: ai.busy }, icon('send'), 'Send')),
      b.chat.length ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => change((st) => { find(st, b.id).chat = []; }) }, 'Clear chat') : null,
    ];
  }

  /* ---------- delegate (manager only) ---------- */
  function delegateTab(s, b) {
    const crew = s.buildings.filter((x) => !x.lead && !x.hall);
    const who = h('select', { id: 'delegate-to', 'aria-label': 'Hand the job to' }, crew.map((x) => h('option', { value: x.id, text: `${x.name} (${x.place})` })));
    const what = h('input', { id: 'delegate-what', type: 'text', maxlength: '200', placeholder: 'The job, like Find 10 product ideas', 'aria-label': 'Job' });
    const due = h('input', { id: 'delegate-due', type: 'date', 'aria-label': 'Due date' });
    const handed = [];
    s.buildings.forEach((x) => x.tasks.forEach((t) => { if (!t.done && t.from === b.name) handed.push({ x, t }); }));
    return [
      h('p', { class: 'hint', text: `Hand a job to another building. While it is open, the wire from ${b.name} to that building lights up.` }),
      h('form', {
        class: 'add-row wrap', onsubmit: (e) => {
          e.preventDefault();
          const v = what.value.trim();
          const target = find(state(), who.value);
          if (!v || !target) return;
          change((st) => { find(st, target.id).tasks.push(newTask(v, due.value, b.name)); });
          what.value = ''; due.value = '';
          PC.ui.toast(`Sent to ${target.name}`);
        },
      }, who, what, due, h('button', { class: 'btn', type: 'submit' }, icon('send'), 'Hand it over')),
      h('h3', { text: 'Handed out and still open' }),
      handed.length ? h('ul', { class: 'tasks' }, handed.map(({ x, t }) => h('li', { class: 'task' },
        h('span', { class: `dot ${x.status}` }), h('strong', { text: x.name }), h('span', { class: 'task-title', text: t.title }),
        dueInfo(t.due) ? h('span', { class: `chip due ${dueInfo(t.due).cls}`, text: dueInfo(t.due).text }) : null)))
        : h('p', { class: 'empty', text: 'Nothing handed out right now.' }),
    ];
  }

  /* ---------- ruflo ---------- */
  function rufloTab(s, b) {
    const slug = PC.ruflo.slug(b.name);
    const next = openTasks(b)[0];
    const type = h('select', {
      id: `ruflo-type-${b.id}`, 'aria-label': 'ruflo agent type',
      onchange: (e) => change((st) => { find(st, b.id).ruflo = e.target.value; }),
    }, RUFLO_TYPES.map((t) => h('option', { value: t, text: t, selected: t === b.ruflo })));
    type.dataset.keep = 'no';
    return [
      h('p', { class: 'hint', text: `This page is the map. ruflo is the engine that lets ${b.name} do real work inside Claude Code. Copy a line, paste it into a terminal (or Claude Code), and it runs.` }),
      h('label', { class: 'field inline', for: `ruflo-type-${b.id}` }, h('span', { text: 'ruflo agent type' }), type),
      cmd(PC.ruflo.spawn(b), `Start ${b.name} as a ruflo agent${next ? ' on the next task' : ''}:`),
      next ? cmd(PC.ruflo.task(b, next.title), 'Put the next task on ruflo’s task list:') : null,
      cmd(PC.ruflo.remember(b), `Save ${b.name}’s tasks, links and notes to ruflo memory:`),
      h('h3', { text: 'In Claude Code, with the Platform Center plugin' }),
      cmd(PC.ruflo.marketplace, 'Once, to add the plugin (after the pull request is merged):'),
      cmd(PC.ruflo.install),
      PLUGIN_AGENTS.includes(slug)
        ? cmd(`Use the ${slug} agent to ${next ? next.title.charAt(0).toLowerCase() + next.title.slice(1) : 'plan the next step'}`, 'Then just ask:')
        : cmd(`/delegate ${b.name} ${next ? next.title : '<the job>'}`, 'Then hand it work:'),
      cmd('/morning-brief', 'And every morning:'),
    ];
  }

  /* ---------- Meeting Hall ---------- */
  function standupText(s) {
    const week = 7 * 864e5;
    return s.buildings.filter((x) => !x.hall).map((x) => {
      const done = x.tasks.filter((t) => t.done && t.doneAt && Date.now() - t.doneAt < week).map((t) => t.title);
      const next = openTasks(x)[0];
      return `${x.name} (${x.status}): done ${done.length ? done.join('; ') : 'nothing yet'} | next: ${next ? next.title : 'nothing planned'}`;
    }).join('\n');
  }

  async function runMeeting(kind) {
    if (ai.busy) return;
    Object.assign(ai, { busy: true, bid: 'hall', text: '', meeting: '', ctl: new AbortController() });
    render();
    try {
      const res = await PC.ai.meeting(kind, { signal: ai.ctl.signal, onText: ({ text }) => { ai.text = text; const n = document.getElementById('stream-text'); if (n) n.textContent = text; } });
      ai.meeting = res.text;
    } catch (e) {
      ai.meeting = e && e.code === 'cancelled' ? (e.text || '') : [e && e.text, PC.ai.errorText(e)].filter(Boolean).join('\n\n');
    }
    Object.assign(ai, { busy: false, bid: null, text: '', ctl: null });
    render();
  }

  function reviewTab(s) {
    const week = 7 * 864e5;
    const crew = s.buildings.filter((x) => !x.hall);
    const doneWeek = crew.reduce((n, x) => n + x.tasks.filter((t) => t.done && t.doneAt && Date.now() - t.doneAt < week).length, 0);
    const open = crew.reduce((n, x) => n + x.tasks.filter((t) => !t.done).length, 0);
    const overdue = crew.reduce((n, x) => n + x.tasks.filter((t) => !t.done && dueInfo(t.due) && dueInfo(t.due).cls === 'overdue').length, 0);
    const text = standupText(s);
    const pre = h('pre', { class: 'standup', text });
    const live = ai.busy && ai.bid === 'hall';
    return [
      h('div', { class: 'stats' },
        h('div', {}, h('strong', { text: doneWeek }), h('span', { text: 'done this week' })),
        h('div', {}, h('strong', { text: open }), h('span', { text: 'open' })),
        h('div', { class: overdue ? 'warn' : '' }, h('strong', { text: overdue }), h('span', { text: 'overdue' }))),
      h('ul', { class: 'crew' }, crew.map((x) => h('li', {},
        h('button', { type: 'button', class: 'crew-row', onclick: () => PC.panel.open(x.id) },
          h('span', { class: `dot ${x.status}` }), h('strong', { text: x.name }),
          h('span', { class: 'muted', text: x.status === 'stuck' ? 'stuck: needs help' : (x.job ? `on: ${x.job}` : x.place) }),
          h('span', { class: 'count', text: `${x.tasks.filter((t) => t.done && t.doneAt && Date.now() - t.doneAt < week).length} done` }))))),
      h('h3', { text: 'Standup notes' }),
      pre,
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => copy(text, pre) }, icon('copy'), 'Copy standup'),
        PC.ai.available() ? h('button', { class: 'btn small', type: 'button', disabled: ai.busy, onclick: () => runMeeting('standup') }, 'Chair a standup') : null,
        PC.ai.available() ? h('button', { class: 'btn small', type: 'button', disabled: ai.busy, onclick: () => runMeeting('retro') }, 'Run the Friday retro') : null,
        live ? h('button', { class: 'btn stop small', type: 'button', onclick: () => ai.ctl && ai.ctl.abort() }, icon('stop'), 'Stop') : null),
      live ? h('div', { class: 'bubble agent live' }, h('span', { id: 'stream-text', text: ai.text || 'Thinking…' }))
        : ai.meeting ? h('div', { class: 'bubble agent', text: ai.meeting }) : null,
    ];
  }

  PC.panel = {
    mount(node) {
      el = node;
      try { tab = localStorage.getItem('platform-center:tab') || 'now'; } catch (e) { tab = 'now'; }
    },
    open(id, t) {
      currentId = id;
      if (t) tab = t;
      el.hidden = false;
      render();
      PC.app.onPanel(id);
      const title = document.getElementById('panel-title');
      if (title) title.setAttribute('tabindex', '-1');
    },
    close() { currentId = null; el.hidden = true; el.replaceChildren(); PC.app.onPanel(null); },
    current: () => currentId,
    render,
  };
})();
