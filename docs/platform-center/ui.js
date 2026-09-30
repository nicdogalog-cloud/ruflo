/* Platform Center: small UI helpers shared by the panel and the app shell,
 * plus the builders for the ruflo commands the page hands out.
 */
(function () {
  'use strict';
  const PC = (window.PC = window.PC || {});

  /* Build DOM without innerHTML for anything the owner typed. */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'svg') el.innerHTML = v; // static icon markup only
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    kids.flat(Infinity).forEach((c) => {
      if (c == null || c === false) return;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  const S = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONS = {
    search: S('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    menu: S('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    plus: S('<path d="M12 5v14M5 12h14"/>'),
    close: S('<path d="M6 6l12 12M18 6 6 18"/>'),
    check: S('<path d="m5 12 5 5 9-10"/>'),
    trash: S('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    copy: S('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h9"/>'),
    send: S('<path d="M4 12 20 4l-6 16-3-7-7-1Z"/>'),
    stop: S('<rect x="7" y="7" width="10" height="10" rx="1"/>'),
    edit: S('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/>'),
    out: S('<path d="M14 5h5v5M19 5l-8 8M18 14v5H5V6h5"/>'),
    sun: S('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    back: S('<path d="M15 5l-7 7 7 7"/>'),
  };
  const icon = (name) => h('span', { class: 'ico', 'aria-hidden': 'true', svg: ICONS[name] });

  /* ---------- toast ---------- */
  let toastTimer = 0;
  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* ---------- modal ---------- */
  let closeCurrent = null;
  function modal(title, body, opts = {}) {
    if (closeCurrent) closeCurrent();
    const back = document.getElementById('modal');
    const card = document.getElementById('modal-card');
    const prevFocus = document.activeElement;
    card.className = 'modal' + (opts.wide ? ' wide' : '');
    card.replaceChildren(
      h('div', { class: 'modal-head' },
        h('h2', { id: 'modal-title', text: title }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => close() }, icon('close'))),
      body,
    );
    card.setAttribute('aria-labelledby', 'modal-title');
    back.hidden = false;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const onBack = (e) => { if (e.target === back) close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', onBack);
    function close() {
      back.hidden = true;
      card.replaceChildren();
      document.removeEventListener('keydown', onKey);
      back.removeEventListener('mousedown', onBack);
      closeCurrent = null;
      if (opts.onClose) opts.onClose();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    }
    closeCurrent = close;
    const first = card.querySelector('input, textarea, select, button:not(.icon-btn)');
    if (first) setTimeout(() => first.focus(), 30);
    return close;
  }

  /* ---------- copy ---------- */
  function copy(text, selectEl) {
    const fallback = () => {
      if (selectEl) {
        const range = document.createRange();
        range.selectNodeContents(selectEl);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
      }
      toast('Selected. Press Ctrl+C (or ⌘C) to copy.');
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => toast('Copied'), fallback);
      } else fallback();
    } catch (e) { fallback(); }
  }

  /* A command line with a copy button. */
  function cmd(text, note) {
    const code = h('code', { text });
    return h('div', { class: 'cmd' },
      note ? h('p', { class: 'cmd-note', text: note }) : null,
      h('div', { class: 'cmd-row' },
        h('pre', {}, code),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Copy command', onclick: () => copy(text, code) }, icon('copy'))));
  }

  /* ---------- dates, times, money ---------- */
  const { isoDate } = PC.util;
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function dueInfo(due) {
    if (!due) return null;
    const today = isoDate();
    const t = parseISO(today), d = parseISO(due);
    const diff = Math.round((d - t) / 86400000);
    const nice = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    if (diff < 0) return { cls: 'overdue', text: `Overdue · ${nice}` };
    if (diff === 0) return { cls: 'today', text: 'Today' };
    if (diff === 1) return { cls: 'soon', text: 'Tomorrow' };
    return { cls: diff <= 3 ? 'soon' : 'later', text: nice };
  }
  function fmtTime(hm) {
    const [H, M] = (hm || '09:00').split(':').map(Number);
    const h12 = ((H + 11) % 12) + 1;
    return `${h12}:${String(M).padStart(2, '0')} ${H < 12 ? 'AM' : 'PM'}`;
  }
  function runsOn(job, date = new Date()) {
    const day = DAYS[date.getDay()];
    if (job.repeat === 'daily') return true;
    if (job.repeat === 'weekdays') return date.getDay() >= 1 && date.getDay() <= 5;
    return job.repeat === day;
  }
  const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
  function safeUrl(raw) {
    let s = String(raw || '').trim();
    if (!s) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
    try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch (e) { return ''; }
  }

  /* ---------- ruflo commands ---------- */
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agent';
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  function compact(state) {
    return {
      business: state.business,
      owner: state.owner,
      goal: state.goal,
      buildings: state.buildings.map((b) => ({
        name: b.name, place: b.place, role: b.role, ruflo_type: b.ruflo, status: b.status, job: b.job,
        open_tasks: b.tasks.filter((t) => !t.done).map((t) => ({ title: t.title, due: t.due, from: t.from })),
        schedule: b.schedule.map((j) => ({ title: j.title, time: j.time, repeat: j.repeat })),
        links: b.links.map((l) => ({ title: l.title, url: l.url })),
        site: b.site ? { label: b.site.label, url: b.site.url || 'not added yet', tag: b.site.tag || undefined } : undefined,
        notes: b.notes.slice(0, 600),
      })),
    };
  }
  const ruflo = {
    slug,
    compact,
    spawn(b) {
      const next = b.tasks.find((t) => !t.done);
      return `npx ruflo@latest agent spawn -t ${b.ruflo} --name ${slug(b.name)}` + (next ? ` --task ${q(next.title)}` : '');
    },
    task: (b, title) => `npx ruflo@latest task create -t custom -d ${q(title)} --assign ${slug(b.name)} --tags platform-center`,
    remember: (b) => `npx ruflo@latest memory store --namespace platform-center --key ${slug(b.name)} --value ${q(JSON.stringify(compact({ buildings: [b] }).buildings[0]))}`,
    city: (state) => `npx ruflo@latest memory store --namespace platform-center --key city --value ${q(JSON.stringify(compact(state)))}`,
    init: 'npx ruflo@latest init',
    marketplace: '/plugin marketplace add nicdogalog-cloud/ruflo',
    install: '/plugin install ruflo-platform-center@ruflo',
  };

  PC.ui = { h, icon, toast, modal, copy, cmd, dueInfo, fmtTime, runsOn, money, safeUrl };
  PC.ruflo = ruflo;
})();
