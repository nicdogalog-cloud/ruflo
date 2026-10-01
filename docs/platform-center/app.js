/* Platform Center: the app shell. Top bar, workspaces sidebar, morning
 * brief, search, settings and the building editor. Boots everything.
 */
(function () {
  'use strict';
  const PC = (window.PC = window.PC || {});
  const { h, icon, toast, modal, copy, cmd, dueInfo, fmtTime, runsOn, money } = PC.ui;
  const { COLORS, STYLES, RUFLO_TYPES, isoDate } = PC.util;

  const $ = (id) => document.getElementById(id);
  const state = () => PC.store.get();
  const find = (s, id) => s.buildings.find((b) => b.id === id);
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
  };
  let downloads = null;

  const STATUS_TEXT = {
    starter: 'Starter city · saves when you change something',
    'starter-cloud': 'Starter city · saves to your account when you change something',
    local: 'Saved in this browser',
    cloud: 'Saved to your account',
    saving: 'Saving…',
    device: 'Saved in this browser only',
    unsaved: 'Not saved: this browser blocks storage. Use Settings › Copy backup.',
  };

  /* ---------- changes ---------- */
  function change(fn, opts = {}) {
    PC.store.commit(fn);
    renderShell();
    PC.city.redraw();
    if (!opts.quiet) PC.panel.render();
  }

  /* ---------- top bar ---------- */
  function renderChips(s) {
    $('chips').replaceChildren(...s.buildings.filter((b) => !b.hall).map((b) => h('button', {
      type: 'button', class: 'agent-chip' + (PC.panel.current() === b.id ? ' on' : ''), style: `--b:${b.color}`,
      onclick: () => PC.panel.open(b.id), 'aria-label': `${b.name}, ${b.status}${b.job ? `, working on ${b.job}` : ''}`,
    }, h('span', { class: `dot ${b.status}` }), h('span', { class: 'chip-text' }, h('strong', { text: b.name }), h('small', { text: b.job ? `on: ${b.job}` : b.place })))));
  }

  function renderGoal(s) {
    const pct = s.goal.target > 0 ? Math.min(100, (s.goal.current / s.goal.target) * 100) : 0;
    $('goal-btn').replaceChildren(
      h('span', { class: 'goal-label', text: 'Goal' }),
      h('span', { class: 'goal-value' }, h('strong', { text: money(s.goal.current) }), ` / ${money(s.goal.target)}`),
      h('span', { class: 'meter', 'aria-hidden': 'true' }, h('span', { style: `width:${pct.toFixed(1)}%` })));
    $('goal-btn').setAttribute('aria-label', `${s.goal.label}: ${money(s.goal.current)} of ${money(s.goal.target)}. Edit goal`);
  }

  /* ---------- sidebar ---------- */
  function renderSidebar(s) {
    const cur = PC.panel.current();
    $('workspace-list').replaceChildren(...s.buildings.map((b) => {
      const open = b.tasks.filter((t) => !t.done).length;
      const late = b.tasks.some((t) => !t.done && dueInfo(t.due) && dueInfo(t.due).cls === 'overdue');
      return h('li', {}, h('button', {
        type: 'button', class: 'ws' + (cur === b.id ? ' on' : ''), style: `--b:${b.color}`, onclick: () => PC.panel.open(b.id),
        'aria-current': cur === b.id ? 'true' : null,
      },
      h('span', { class: 'ws-icon', 'aria-hidden': 'true' }),
      h('span', { class: 'ws-text' }, h('strong', { text: b.name }), h('small', { text: b.place })),
      b.hall ? null : h('span', { class: 'ws-count' + (late ? ' late' : ''), text: open ? String(open) : '' , title: `${open} open task${open === 1 ? '' : 's'}` }),
      h('span', { class: `dot ${b.status}` })));
    }));
    $('brief-time').textContent = fmtTime(s.brief.time);
  }

  function renderShell() {
    const s = state();
    $('business-name').textContent = s.business;
    renderChips(s);
    renderGoal(s);
    renderSidebar(s);
    const note = $('starter-note');
    note.hidden = !s.starter || ls.get('platform-center:hide-starter') === '1';
    const [hh, mm] = s.brief.time.split(':').map(Number);
    const now = new Date();
    $('brief-ready').hidden = !(s.brief.lastSeen !== isoDate() && (now.getHours() > hh || (now.getHours() === hh && now.getMinutes() >= mm)));
  }

  function setSaveStatus(code) {
    const el = $('save-status');
    if (!el) return;
    el.textContent = STATUS_TEXT[code] || '';
    el.dataset.state = code;
  }

  /* ---------- goal ---------- */
  function editGoal() {
    const s = state();
    const label = h('input', { id: 'goal-label', type: 'text', value: s.goal.label, maxlength: '40' });
    const target = h('input', { id: 'goal-target', type: 'number', min: '0', step: '1', value: String(s.goal.target) });
    const current = h('input', { id: 'goal-current', type: 'number', min: '0', step: '1', value: String(s.goal.current) });
    const close = modal('Monthly goal', h('form', {
      class: 'form', onsubmit: (e) => {
        e.preventDefault();
        change((st) => { st.goal = { label: label.value.trim() || 'Monthly revenue', target: Math.max(0, +target.value || 0), current: Math.max(0, +current.value || 0) }; });
        close();
        toast('Goal updated');
      },
    },
    field('What you are aiming for', label),
    h('div', { class: 'two' }, field('Target this month ($)', target), field('So far this month ($)', current)),
    h('p', { class: 'hint', text: 'Update “so far” whenever money comes in. Ledger and the morning brief use it.' }),
    h('div', { class: 'row end' }, h('button', { class: 'btn', type: 'submit' }, 'Save goal'))));
  }

  function field(label, input, hint) {
    if (!input.id) input.id = 'f-' + Math.random().toString(36).slice(2, 8);
    return h('div', { class: 'field' }, h('label', { for: input.id, text: label }), input, hint ? h('small', { class: 'hint', text: hint }) : null);
  }

  /* ---------- morning brief ---------- */
  function briefText(s) {
    const lines = [`Morning brief for ${s.business}, ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`];
    lines.push(`Goal: ${money(s.goal.current)} of ${money(s.goal.target)} (${s.goal.label})`);
    const due = [];
    s.buildings.forEach((b) => b.tasks.forEach((t) => { const d = dueInfo(t.due); if (!t.done && d && (d.cls === 'today' || d.cls === 'overdue')) due.push(`- ${b.name}: ${t.title} (${d.text.toLowerCase()})`); }));
    const { check, finished } = crewWork(s);
    lines.push('', 'Crew work to check:', ...(check.length ? check.map(({ b, t }) => `- ${b.name}: ${t.title}${t.summary ? ` (${t.summary})` : ''}${t.nicStep ? `. Your part: ${t.nicStep}` : ''}`) : ['- nothing waiting']));
    lines.push('', 'Finished by the crew (last 7 days):', ...(finished.length ? finished.map(({ b, t }) => `- ${b.name}: ${t.title}${t.summary ? ` (${t.summary})` : ''}`) : ['- nothing yet']));
    lines.push('', 'Due today or overdue:', ...(due.length ? due : ['- nothing']));
    const jobs = [];
    s.buildings.forEach((b) => b.schedule.forEach((j) => { if (runsOn(j)) jobs.push({ t: j.time, line: `- ${fmtTime(j.time)} ${b.name}: ${j.title}` }); }));
    jobs.sort((a, c) => (a.t < c.t ? -1 : 1));
    lines.push('', 'Scheduled today:', ...(jobs.length ? jobs.map((j) => j.line) : ['- nothing']));
    s.buildings.filter((b) => b.site).forEach((b) => {
      const open = byDue(b.tasks.filter((t) => !t.done));
      lines.push('', `${b.place} updates (${b.name}):`, `- ${b.site.label}${b.site.tag ? ` (${b.site.tag})` : ''}: ${b.site.url || 'no link yet'}`,
        ...(open.length ? open.slice(0, 3).map((t) => `- ${t.title}`) : ['- nothing on the update list']));
    });
    return lines.join('\n');
  }
  // real saved work: waiting for nic's check, and finished in the last 7 days
  function crewWork(s) {
    const check = [];
    const finished = [];
    s.buildings.forEach((b) => PC.ai.recentWork(b).forEach((t) => {
      if (t.review) check.push({ b, t });
      else if (Date.now() - t.resultAt < 7 * 864e5) finished.push({ b, t });
    }));
    const newest = (a, c) => c.t.resultAt - a.t.resultAt;
    return { check: check.sort(newest), finished: finished.sort(newest).slice(0, 8) };
  }
  function workBrief(s, close) {
    const { check, finished } = crewWork(s);
    const item = ({ b, t }) => h('li', {},
      h('button', { type: 'button', class: 'link-like', onclick: () => { close(); PC.panel.open(b.id, 'work'); PC.work.open(b.id, t.id); } }, h('strong', { text: b.name }), ` ${t.title}`),
      t.summary ? h('span', { class: 'muted small', text: t.summary }) : null,
      t.review && t.nicStep ? h('span', { class: 'your-part', text: `Your part: ${t.nicStep}` }) : null);
    return [
      h('section', {}, h('h3', { text: 'Crew work to check' }),
        check.length ? h('ul', { class: 'brief-list work-brief' }, check.map(item))
          : h('p', { class: 'empty', text: finished.length ? 'Nothing waiting for you.' : 'No crew work yet. Open a building, go to Tasks and tap Do this task. The crew works only while this page is open.' })),
      finished.length ? h('section', {}, h('h3', { text: 'Finished by the crew this week' }), h('ul', { class: 'brief-list work-brief' }, finished.map(item))) : null,
    ];
  }
  const byDue = (list) => list.slice().sort((a, c) => ((a.due || '9999') < (c.due || '9999') ? -1 : 1));

  // the brief's section for a building that looks after a website/app (Crease Cam)
  function siteBrief(b, close) {
    const open = byDue(b.tasks.filter((t) => !t.done));
    const toTasks = () => { close(); PC.panel.open(b.id, 'tasks'); };
    return h('section', {}, h('h3', { text: `${b.place} updates` }),
      b.site.url
        ? h('p', { class: 'hint' }, h('a', { class: 'inline-link', href: b.site.url, target: '_blank', rel: 'noopener noreferrer', text: b.site.tag || b.site.label }), ` · ${open.length} open update${open.length === 1 ? '' : 's'} with ${b.name}`)
        : h('p', { class: 'hint', text: `No ${b.site.label} link yet. Add it in ${b.place}.` }),
      open.length ? h('ul', { class: 'brief-list' }, open.slice(0, 3).map((t) => {
        const d = dueInfo(t.due);
        return h('li', {}, h('button', { type: 'button', class: 'link-like', onclick: toTasks }, t.title), d ? h('span', { class: `chip due ${d.cls}`, text: d.text }) : null);
      })) : h('p', { class: 'empty', text: 'Nothing on the update list.' }));
  }

  function openBrief() {
    const s = state();
    if (s.brief.lastSeen !== isoDate()) change((st) => { st.brief.lastSeen = isoDate(); });
    const st = state();
    const hour = new Date().getHours();
    const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const due = [];
    st.buildings.forEach((b) => b.tasks.forEach((t) => { const d = dueInfo(t.due); if (!t.done && d && (d.cls === 'today' || d.cls === 'overdue')) due.push({ b, t, d }); }));
    const jobs = [];
    st.buildings.forEach((b) => b.schedule.forEach((j) => { if (runsOn(j)) jobs.push({ b, j }); }));
    jobs.sort((a, c) => (a.j.time < c.j.time ? -1 : 1));
    const pct = st.goal.target > 0 ? Math.min(100, (st.goal.current / st.goal.target) * 100) : 0;
    const out = h('div', { class: 'bubble agent', hidden: true });
    let ctl = null;
    const aiBtn = h('button', { class: 'btn', type: 'button', onclick: async () => {
      if (ctl) { ctl.abort(); return; }
      ctl = new AbortController();
      out.hidden = false; out.textContent = 'Thinking…';
      aiBtn.replaceChildren(icon('stop'), 'Stop');
      try {
        const res = await PC.ai.brief({ signal: ctl.signal, onText: ({ text }) => { out.textContent = text; } });
        out.textContent = res.text;
      } catch (e) {
        out.textContent = e && e.code === 'cancelled' ? (e.text || '') : [e && e.text, PC.ai.errorText(e)].filter(Boolean).join('\n\n');
        if (!out.textContent) out.hidden = true;
      }
      ctl = null;
      aiBtn.replaceChildren(icon('sun'), `Have ${lead(st).name} write it`);
    } }, icon('sun'), `Have ${lead(st).name} write it`);
    const plain = briefText(st);
    const pre = h('pre', { class: 'sr-only', text: plain });
    const close = modal(`${hello}, ${st.owner}`, h('div', { class: 'brief' },
      h('p', { class: 'eyebrow', text: `Morning brief · ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}` }),
      h('div', { class: 'brief-goal' },
        h('span', { text: st.goal.label }),
        h('strong', { text: `${money(st.goal.current)} of ${money(st.goal.target)}` }),
        h('span', { class: 'meter' }, h('span', { style: `width:${pct.toFixed(1)}%` }))),
      workBrief(st, () => close()),
      h('section', {}, h('h3', { text: 'Due today or overdue' }),
        due.length ? h('ul', { class: 'brief-list' }, due.map(({ b, t, d }) => h('li', {},
          h('button', { type: 'button', class: 'link-like', onclick: () => { close(); PC.panel.open(b.id, 'tasks'); } }, h('strong', { text: b.name }), ` ${t.title}`),
          h('span', { class: `chip due ${d.cls}`, text: d.text })))) : h('p', { class: 'empty', text: 'Nothing due. A good day to get ahead.' })),
      h('section', {}, h('h3', { text: 'Scheduled today' }),
        jobs.length ? h('ul', { class: 'jobs' }, jobs.map(({ b, j }) => h('li', {}, h('span', { class: 'time', text: fmtTime(j.time) }), h('strong', { text: b.name }), ` ${j.title}`)))
          : h('p', { class: 'empty', text: 'Nothing scheduled.' })),
      st.buildings.filter((b) => b.site).map((b) => siteBrief(b, () => close())),
      h('section', {}, h('h3', { text: 'The crew' }),
        h('ul', { class: 'brief-list' }, st.buildings.filter((b) => !b.hall).map((b) => {
          const next = b.tasks.filter((t) => !t.done).sort((a, c) => (a.due || '9999') < (c.due || '9999') ? -1 : 1)[0];
          return h('li', {}, h('span', { class: `dot ${b.status}` }), h('strong', { text: b.name }), h('span', { class: 'muted', text: next ? ` next: ${next.title}` : ' nothing planned' }));
        }))),
      pre,
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => copy(plain, pre) }, icon('copy'), 'Copy brief'),
        PC.ai.available() ? aiBtn : null),
      out,
      cmd('/morning-brief', 'Get this brief from ruflo in Claude Code (with the Platform Center plugin):')), { wide: true, onClose: () => { if (ctl) ctl.abort(); } });
  }
  const lead = (s) => s.buildings.find((b) => b.lead) || s.buildings[0];

  /* ---------- search ---------- */
  function openSearch() {
    const input = h('input', { id: 'search-q', type: 'search', placeholder: 'Search buildings, tasks, links and notes', autocomplete: 'off', 'aria-label': 'Search' });
    const list = h('ul', { class: 'results', role: 'list' });
    let close = null;
    const go = (fn) => () => { close(); fn(); };
    function results(q) {
      const s = state();
      const low = q.trim().toLowerCase();
      const out = [];
      s.buildings.forEach((b) => {
        const hit = (t) => t && t.toLowerCase().includes(low);
        if (!low || hit(b.name) || hit(b.place) || hit(b.role)) out.push({ kind: 'Building', title: b.name, sub: b.place, act: go(() => PC.panel.open(b.id)) });
        if (!low) return;
        b.tasks.forEach((t) => { if (hit(t.title)) out.push({ kind: t.done ? 'Done' : 'Task', title: t.title, sub: b.name, act: go(() => PC.panel.open(b.id, 'tasks')) }); });
        b.links.forEach((l) => { if (hit(l.title) || hit(l.url)) out.push({ kind: 'Link', title: l.title, sub: b.name, href: l.url }); });
        if (b.site && b.site.url && (hit(b.site.label) || hit(b.site.url) || hit(b.site.tag))) out.push({ kind: 'Link', title: b.site.label, sub: `${b.name}${b.site.tag ? ` · ${b.site.tag}` : ''}`, href: b.site.url });
        b.schedule.forEach((j) => { if (hit(j.title)) out.push({ kind: 'Schedule', title: j.title, sub: `${b.name} · ${fmtTime(j.time)}`, act: go(() => PC.panel.open(b.id, 'schedule')) }); });
        if (hit(b.notes)) {
          const i = b.notes.toLowerCase().indexOf(low);
          out.push({ kind: 'Note', title: b.notes.slice(Math.max(0, i - 20), i + 50).replace(/\s+/g, ' '), sub: b.name, act: go(() => PC.panel.open(b.id, 'notes')) });
        }
      });
      if (!low || 'morning brief'.includes(low)) out.push({ kind: 'Brief', title: 'Morning brief', sub: fmtTime(s.brief.time), act: go(openBrief) });
      list.replaceChildren(...(out.length ? out.slice(0, 30).map((r) => h('li', {}, r.href
        ? h('a', { class: 'result', href: r.href, target: '_blank', rel: 'noopener noreferrer' }, h('span', { class: 'kind', text: r.kind }), h('strong', { text: r.title }), h('small', { text: r.sub }))
        : h('button', { type: 'button', class: 'result', onclick: r.act }, h('span', { class: 'kind', text: r.kind }), h('strong', { text: r.title }), h('small', { text: r.sub }))))
        : [h('li', { class: 'empty', text: 'Nothing matches that.' })]));
    }
    input.addEventListener('input', () => results(input.value));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const first = list.querySelector('.result'); if (first) first.click(); } });
    close = modal('Search', h('div', { class: 'search' }, input, list));
    results('');
  }

  /* ---------- building editor ---------- */
  function editBuilding(id) {
    const s = state();
    const b = id ? find(s, id) : null;
    const used = new Set(s.buildings.map((x) => x.color));
    const draft = b ? { ...b } : { name: '', place: '', role: '', color: COLORS.find((c) => !used.has(c)) || COLORS[s.buildings.length % COLORS.length], style: 'office', ruflo: 'analyst', lead: false };
    const name = h('input', { id: 'b-name', type: 'text', maxlength: '24', value: draft.name, required: true, placeholder: 'Like Echo' });
    const place = h('input', { id: 'b-place', type: 'text', maxlength: '28', value: draft.place, placeholder: 'Like Support Desk' });
    const role = h('textarea', { id: 'b-role', rows: '3', maxlength: '220', value: draft.role, placeholder: 'What this building takes care of' });
    const style = h('select', { id: 'b-style' }, Object.entries(STYLES).map(([k, v]) => h('option', { value: k, text: v, selected: k === draft.style })));
    const type = h('select', { id: 'b-type' }, RUFLO_TYPES.map((t) => h('option', { value: t, text: t, selected: t === draft.ruflo })));
    let color = draft.color;
    const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Colour' }, COLORS.map((c) => {
      const btn = h('button', { type: 'button', class: 'sw' + (c === color ? ' on' : ''), style: `--c:${c}`, role: 'radio', 'aria-checked': String(c === color), 'aria-label': c,
        onclick: () => { color = c; swatches.querySelectorAll('.sw').forEach((n) => { const on = n === btn; n.classList.toggle('on', on); n.setAttribute('aria-checked', String(on)); }); } });
      return btn;
    }));
    const leadBox = h('input', { id: 'b-lead', type: 'checkbox', checked: !!draft.lead, disabled: !!(b && b.lead) });
    const leadText = b && b.lead
      ? 'This is the manager. To change that, edit another building and make it the manager.'
      : 'Make this the manager (the HQ at the back of the city)';
    const err = h('p', { class: 'error', role: 'alert', hidden: true });
    const confirmRow = h('div', { class: 'confirm', hidden: true },
      h('p', { text: `Delete ${b ? b.name : ''} and everything in it? This can’t be undone.` }),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { confirmRow.hidden = true; } }, 'Keep it'),
        h('button', { class: 'btn danger', type: 'button', onclick: () => {
          change((st) => {
            st.buildings = st.buildings.filter((x) => x.id !== b.id);
            if (!st.buildings.some((x) => x.lead) && st.buildings.length) (st.buildings.find((x) => !x.hall) || st.buildings[0]).lead = true;
          });
          close(); PC.panel.close(); toast(`${b.name} removed`);
        } }, 'Delete it')));
    const close = modal(b ? `Edit ${b.name}` : 'Add a building', h('form', {
      class: 'form', onsubmit: (e) => {
        e.preventDefault();
        const n = name.value.trim();
        if (!n) { err.textContent = 'Give the building a name.'; err.hidden = false; name.focus(); return; }
        if (state().buildings.some((x) => x.name.toLowerCase() === n.toLowerCase() && (!b || x.id !== b.id))) {
          err.textContent = `There is already a building called ${n}. Pick another name.`; err.hidden = false; name.focus(); return;
        }
        const vals = { name: n, place: place.value.trim() || STYLES[style.value], role: role.value.trim() || 'Describe what this building takes care of.', color, style: style.value, ruflo: type.value };
        let newId = null;
        change((st) => {
          if (leadBox.checked) st.buildings.forEach((x) => { x.lead = false; });
          if (b) {
            const x = find(st, b.id);
            const old = x.name;
            Object.assign(x, vals, { lead: leadBox.checked || !!b.lead });
            if (old !== n) st.buildings.forEach((y) => y.tasks.forEach((t) => { if (t.from === old) t.from = n; }));
          } else {
            const nb = PC.store.newBuilding({ ...vals, lead: leadBox.checked });
            newId = nb.id;
            st.buildings.push(nb);
          }
        });
        close();
        if (newId) { PC.panel.open(newId); toast(`${n} added to the city`); } else toast('Saved');
      },
    },
    h('div', { class: 'two' }, field('Name', name), field('Place', place)),
    field('What it takes care of', role),
    h('div', { class: 'two' }, field('Building style', style), field('ruflo agent type', type, 'Used for the ruflo commands in the Ruflo tab.')),
    h('div', { class: 'field' }, h('span', { class: 'label', text: 'Colour' }), swatches),
    h('label', { class: 'check', for: 'b-lead' }, leadBox, h('span', { text: leadText })),
    err,
    h('div', { class: 'row between' },
      b && state().buildings.length > 1 ? h('button', { class: 'btn ghost danger-text', type: 'button', onclick: () => { confirmRow.hidden = false; } }, icon('trash'), 'Delete building') : h('span'),
      h('button', { class: 'btn', type: 'submit' }, b ? 'Save changes' : 'Add building')),
    confirmRow));
  }

  /* ---------- settings ---------- */
  function openSettings() {
    const s = state();
    const owner = h('input', { id: 's-owner', type: 'text', maxlength: '30', value: s.owner });
    const biz = h('input', { id: 's-biz', type: 'text', maxlength: '40', value: s.business });
    const time = h('input', { id: 's-time', type: 'time', value: s.brief.time });
    const backup = () => JSON.stringify(state(), null, 2);
    const paste = h('textarea', { id: 's-restore', rows: '4', placeholder: 'Paste a backup here, or pick a backup file below.' });
    const file = h('input', { id: 's-file', type: 'file', accept: '.json,application/json' });
    const restoreErr = h('p', { class: 'error', role: 'alert', hidden: true });
    const resetRow = h('div', { class: 'confirm', hidden: true },
      h('p', { text: 'Replace your whole city with the starter city? Your tasks, links and notes will be gone.' }),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { resetRow.hidden = true; } }, 'Keep my city'),
        h('button', { class: 'btn danger', type: 'button', onclick: () => { PC.store.replace(PC.store.starter()); afterReplace(); close(); toast('Starter city restored'); } }, 'Reset')));
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { paste.value = String(r.result || ''); };
      r.readAsText(f);
    });
    const close = modal('Settings', h('div', { class: 'form' },
      h('form', { class: 'form', onsubmit: (e) => {
        e.preventDefault();
        change((st) => { st.owner = owner.value.trim() || 'there'; st.business = biz.value.trim() || 'My new business'; st.brief.time = time.value || '08:00'; });
        toast('Settings saved');
      } },
      h('div', { class: 'two' }, field('Your name', owner), field('Business name', biz)),
      field('Morning brief time', time),
      h('div', { class: 'row end' }, h('button', { class: 'btn', type: 'submit' }, 'Save'))),
      h('section', { class: 'block' }, h('h3', { text: 'Where your city is saved' }),
        h('p', { class: 'hint', text: `${STATUS_TEXT[PC.store.status()] || ''}. ${window.claude ? 'On claude.ai your city is saved to your account and only you can see it.' : 'Opened outside claude.ai, the city lives in this browser. Copy a backup now and then.'}` }),
        h('p', { class: 'hint', text: PC.ai.available() ? 'AI answers: on (uses your own claude.ai account). The crew does a task when you tap Do this task, only while this page is open. Nothing runs in the background or on a timer.' : 'AI answers: off here. The crew follows simple orders instead, and cannot do tasks.' })),
      h('section', { class: 'block' }, h('h3', { text: 'Backup' }),
        h('div', { class: 'row' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => copy(backup()) }, icon('copy'), 'Copy backup'),
          h('button', { class: 'btn ghost', type: 'button', onclick: saveFile }, 'Save backup file')),
        paste, file, restoreErr,
        h('div', { class: 'row' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => {
          let data = null;
          try { data = JSON.parse(paste.value); } catch (e) { data = null; }
          if (!data || !Array.isArray(data.buildings)) { restoreErr.textContent = 'That isn’t a Platform Center backup. Copy one from Settings › Copy backup.'; restoreErr.hidden = false; return; }
          PC.store.replace(data); afterReplace(); close(); toast('Backup restored');
        } }, 'Restore backup'))),
      h('section', { class: 'block' }, h('h3', { text: 'ruflo' }),
        cmd(PC.ruflo.init, 'Set up ruflo in a project folder (once):'),
        cmd(PC.ruflo.city(state()), 'Save the whole city to ruflo memory, so /morning-brief and the crew agents can read it:')),
      h('section', { class: 'block' }, h('h3', { text: 'Start over' }),
        h('button', { class: 'btn ghost danger-text', type: 'button', onclick: () => { resetRow.hidden = false; } }, 'Reset to the starter city'),
        resetRow)), { wide: true });
  }

  async function saveFile() {
    const data = JSON.stringify(state(), null, 2);
    const filename = `platform-center-backup-${isoDate()}.json`;
    if (downloads) {
      try { await downloads.save({ filename, data }); toast('Backup saved'); } catch (e) { if (!e || e.code !== 'declined') toast('Couldn’t save the file here. Use Copy backup instead.'); }
      return;
    }
    if (window.claude) { toast('Saving files isn’t available here. Use Copy backup instead.'); return; }
    const a = h('a', { href: URL.createObjectURL(new Blob([data], { type: 'application/json' })), download: filename });
    document.body.append(a); a.click(); a.remove();
  }

  function afterReplace() {
    PC.panel.close();
    renderShell();
    PC.city.redraw();
  }

  /* ---------- boot ---------- */
  function onPanel(id) {
    PC.city.select(id);
    document.body.classList.toggle('panel-open', !!id);
    renderChips(state());
    renderSidebar(state());
  }

  function boot() {
    PC.store.init((s) => { renderShell(); PC.city.redraw(); PC.panel.render(); }, setSaveStatus);
    PC.panel.mount($('panel'));
    PC.city.mount($('city'), { getState: state, onPick: (id) => PC.panel.open(id) });
    renderShell();
    $('goal-btn').addEventListener('click', editGoal);
    $('search-btn').addEventListener('click', openSearch);
    $('menu-btn').addEventListener('click', openSettings);
    $('add-building').addEventListener('click', () => editBuilding(null));
    $('brief-row').addEventListener('click', openBrief);
    $('brief-ready-open').addEventListener('click', openBrief);
    $('starter-hide').addEventListener('click', () => { ls.set('platform-center:hide-starter', '1'); $('starter-note').hidden = true; });
    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); openSearch(); }
      else if (e.key === 'Escape' && $('modal').hidden && PC.panel.current()) PC.panel.close();
    });
    window.addEventListener('pagehide', () => PC.store.saveNow());
    PC.ai.onChange(() => { PC.panel.render(); });
    PC.ai.init();
    if (window.claude && typeof window.claude.use === 'function') {
      window.claude.use('downloads').then((d) => { downloads = d; }).catch(() => { downloads = null; });
    }
    const hash = (location.hash || '').slice(1).toLowerCase();
    const s = state();
    const deep = hash && s.buildings.find((b) => PC.ruflo.slug(b.name) === hash);
    if (hash === 'brief') openBrief();
    else if (deep) PC.panel.open(deep.id);
    else if (window.matchMedia('(min-width: 1100px)').matches) PC.panel.open(lead(s).id, 'now');
  }

  PC.app = { change, editBuilding, openBrief, onPanel };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
