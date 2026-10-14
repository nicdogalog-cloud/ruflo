/* Platform Center: the crew doing real work.
 *
 * "Do this task" on any task asks Claude (the `sample` capability, on the
 * viewer's own claude.ai account) to make the actual deliverable for it, as
 * that crew member: captions, competitor notes, a budget, a checklist...
 * The work is saved on the task, in that building, and the task is marked
 * done or "needs nic's check". Nova can also hand parts of a job to other
 * buildings, which then get their own "Do this task" button.
 *
 * Honest limits: the crew works only while this page is open and only when
 * nic taps the button. Nothing runs on a timer or in the background, and
 * nobody posts, buys, sends or signs up for anything; nic does those.
 */
(function () {
  'use strict';
  const PC = (window.PC = window.PC || {});
  const { h, icon, toast, modal, copy } = PC.ui;
  const { task: newTask, MAX_RESULT, DOING } = PC.util;

  const state = () => PC.store.get();
  const find = (s, id) => s.buildings.find((b) => b.id === id);
  const findTask = (s, bid, tid) => { const b = find(s, bid); return b ? b.tasks.find((t) => t.id === tid) : null; };

  // the one task being worked on right now (one at a time keeps it calm and within rate limits)
  let active = null; // { bid, tid, name, title, text, ctl }
  let view = null; // { bid, tid, box } while the work window is open

  const busy = () => !!active;
  const runningOn = (tid) => !!active && active.tid === tid;

  function refreshView() {
    if (!view || !view.box.isConnected) { view = null; return; }
    view.box.replaceChildren(...viewBody(view.bid, view.tid).flat().filter(Boolean));
  }

  /* ---------- doing a task ---------- */
  async function run(bid, tid, opts = {}) {
    if (!PC.ai.available()) { toast('The crew can only do tasks on claude.ai, with AI answers on.'); return; }
    if (active) { toast(`${active.name} is still working on “${active.title}”. One task at a time.`); open(active.bid, active.tid); return; }
    const s = state();
    const b = find(s, bid);
    const t = findTask(s, bid, tid);
    if (!b || !t) return;
    const before = { status: b.status, job: b.job };
    active = { bid, tid, name: b.name, title: t.title, text: '', ctl: new AbortController(), error: '' };
    PC.app.change((st) => { const x = find(st, bid); x.status = 'working'; x.job = (DOING + t.title).slice(0, 80); });
    open(bid, tid);

    let res = null;
    let err = null;
    try {
      res = await PC.ai.work(b, t, {
        signal: active.ctl.signal,
        redo: opts.redo,
        onText: ({ text }) => { if (!active) return; active.text = text; const n = document.getElementById('work-stream'); if (n) n.textContent = text; },
      });
    } catch (e) { err = e || {}; }

    const name = active.name;
    active = null;
    let handed = [];
    let saved = false;
    let failText = '';
    if (res) {
      const p = PC.ai.parseWork(res.text);
      if (p.work) {
        const cut = res.truncated || !p.status;
        PC.app.change((st) => {
          const x = find(st, bid);
          if (x) restore(x, before);
          const k = findTask(st, bid, tid);
          if (!k) return;
          if (x && x.lead && p.handout.length) handed = handOut(st, x, p.handout);
          let text = p.work;
          if (handed.length) text += `\n\nHANDED OUT\n${handed.map((d) => `- ${d.name}: ${d.title}`).join('\n')}`;
          k.result = text.slice(0, MAX_RESULT);
          k.summary = p.summary || p.work.split('\n').find((l) => l.trim()).trim().slice(0, 140);
          k.resultAt = Date.now();
          k.review = cut || p.status !== 'done';
          k.nicStep = cut ? 'It was cut short. Check it, or tap Redo and ask for less.' : (p.status === 'done' ? '' : (p.nicStep || 'Check this and tick it off.'));
          if (!k.review) { k.done = true; k.doneAt = Date.now(); }
        });
        saved = true;
      } else failText = 'The reply came back empty. Try again.';
    } else if (err.code === 'cancelled') {
      failText = '';
    } else {
      failText = PC.ai.errorText(err);
    }
    if (!saved) PC.app.change((st) => { const x = find(st, bid); if (x) restore(x, before); });

    if (saved) {
      const k = findTask(state(), bid, tid);
      toast(k && k.review ? `${name} finished. It needs your check.` : `${name} finished “${k ? k.title : 'the task'}”.`);
      if (handed.length) setTimeout(() => toast(`Handed out to ${[...new Set(handed.map((d) => d.name))].join(', ')}`), 2800);
    } else if (failText) {
      toast(failText);
      if (view && view.tid === tid) view.error = failText;
    } else toast('Stopped. Nothing was saved.');
    refreshView();
  }

  function restore(x, before) {
    if (!x.job.startsWith(DOING)) return; // nic changed it meanwhile
    x.status = before.status === 'working' && before.job.startsWith(DOING) ? 'idle' : before.status;
    x.job = before.job.startsWith(DOING) ? '' : before.job;
  }

  // Nova's HAND OUT lines become real tasks in the other buildings.
  function handOut(st, lead, list) {
    const out = [];
    list.forEach(({ to, title }) => {
      const n = to.toLowerCase().replace(/\s*\(.*\)$/, '').trim();
      const target = st.buildings.find((x) => !x.hall && x.id !== lead.id && (x.name.toLowerCase() === n || x.place.toLowerCase() === n));
      if (!target || !title) return;
      if (target.tasks.some((k) => !k.done && k.title.toLowerCase() === title.toLowerCase())) return;
      target.tasks.push(newTask(title, PC.util.inDays(3), lead.name));
      out.push({ name: target.name, title });
    });
    return out;
  }

  function stop() { if (active) active.ctl.abort(); }

  /* ---------- after the work ---------- */
  function approve(bid, tid) {
    PC.app.change((st) => { const k = findTask(st, bid, tid); if (!k) return; k.review = false; k.nicStep = ''; k.done = true; k.doneAt = Date.now(); });
    toast('Approved and ticked off');
    refreshView();
  }
  function discard(bid, tid) {
    PC.app.change((st) => { const k = findTask(st, bid, tid); if (!k) return; Object.assign(k, { result: '', summary: '', nicStep: '', review: false, resultAt: 0 }); });
    toast('Work deleted. The task is still on the list.');
    if (view) view.close();
  }

  /* ---------- the work window ---------- */
  function open(bid, tid) {
    const s = state();
    const b = find(s, bid);
    if (!b || !findTask(s, bid, tid)) return;
    const box = h('div', { class: 'work-view' });
    const close = modal(`${b.name}’s work`, box, { wide: true, onClose: () => { view = null; } });
    view = { bid, tid, box, close, error: '' };
    refreshView();
  }

  function viewBody(bid, tid) {
    const s = state();
    const b = find(s, bid);
    const t = findTask(s, bid, tid);
    if (!b || !t) return [h('p', { class: 'empty', text: 'This task is gone.' })];
    const head = [
      h('p', { class: 'eyebrow', text: `${b.place}${t.from ? ` · from ${t.from}` : ''}` }),
      h('h3', { class: 'work-task', text: t.title }),
    ];
    if (runningOn(tid)) {
      return head.concat(
        h('p', { class: 'mode on', text: `${b.name} is working on it now. Keep this page open: the work stops if you close it.` }),
        h('pre', { class: 'work-text live', id: 'work-stream', text: active.text || 'Thinking…' }),
        h('div', { class: 'row' }, h('button', { class: 'btn stop', type: 'button', onclick: stop }, icon('stop'), 'Stop')));
    }
    const err = view && view.tid === tid && view.error ? h('p', { class: 'error', role: 'alert', text: view.error }) : null;
    if (!t.resultAt) {
      return head.concat(err, h('p', { class: 'empty', text: 'No work saved for this task yet.' }),
        PC.ai.available() && !t.done ? h('div', { class: 'row' }, doButton(b, t)) : null);
    }
    const feedback = h('input', { id: 'work-feedback', type: 'text', maxlength: '300', placeholder: 'What should change? (optional)', 'aria-label': 'What should change' });
    const pre = h('pre', { class: 'work-text', text: t.result || '(The full text was cleared to save space. The summary is kept.)' });
    return head.concat(
      h('div', { class: 'row' },
        h('span', { class: 'chip ' + (t.review ? 'review' : 'ok'), text: t.review ? 'Needs your check' : 'Done' }),
        h('span', { class: 'muted small', text: `Saved ${new Date(t.resultAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` })),
      t.summary ? h('p', { class: 'work-summary', text: t.summary }) : null,
      t.review && t.nicStep ? h('p', { class: 'your-part' }, h('strong', { text: 'Your part: ' }), t.nicStep) : null,
      err,
      pre,
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => copy(t.result || t.summary, pre) }, icon('copy'), 'Copy'),
        t.review ? h('button', { class: 'btn small', type: 'button', onclick: () => approve(bid, tid) }, icon('check'), 'Approve and tick off') : null),
      PC.ai.available() ? h('form', { class: 'add-row', onsubmit: (e) => {
        e.preventDefault();
        run(bid, tid, { redo: { previous: t.result || t.summary, feedback: feedback.value.trim().slice(0, 300) } });
      } }, feedback, h('button', { class: 'btn ghost', type: 'submit', disabled: busy() }, 'Redo')) : null,
      h('button', { class: 'btn ghost small danger-text', type: 'button', onclick: () => discard(bid, tid) }, icon('trash'), 'Delete this work'));
  }

  /* ---------- small pieces the panel and brief use ---------- */
  function doButton(b, t, small) {
    if (runningOn(t.id)) return h('button', { class: 'btn small working-btn', type: 'button', onclick: () => open(b.id, t.id) }, 'Working…');
    return h('button', {
      class: 'btn small' + (small ? ' do-btn' : ''), type: 'button', disabled: busy(),
      title: busy() ? `${active.name} is working on another task` : `${b.name} makes the work for this task now`,
      onclick: () => run(b.id, t.id),
    }, 'Do this task');
  }

  // the chip or button that sits on a task row
  function taskControl(b, t) {
    if (b.hall) return null;
    if (runningOn(t.id)) return doButton(b, t, true);
    if (t.resultAt) {
      return h('button', { class: 'chip-btn work-chip ' + (t.review ? 'review' : 'ok'), type: 'button', onclick: () => open(b.id, t.id) },
        t.review ? 'Check work' : 'View work');
    }
    if (t.done || !PC.ai.available()) return null;
    return doButton(b, t, true);
  }

  // A task from a scheduled job, done now (schedules are reminders; nothing runs on its own).
  function runJob(bid, job) {
    if (!PC.ai.available()) return;
    if (active) { toast(`${active.name} is still working. One task at a time.`); return; }
    const title = `${job.title} (${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })})`;
    const k = newTask(title, PC.util.isoDate());
    PC.app.change((st) => { const x = find(st, bid); if (x) x.tasks.push(k); });
    run(bid, k.id);
  }

  window.addEventListener('beforeunload', (e) => { if (active) { e.preventDefault(); e.returnValue = ''; } });

  PC.work = { run, stop, open, approve, discard, busy, runningOn, taskControl, doButton, runJob, active: () => active };
})();
