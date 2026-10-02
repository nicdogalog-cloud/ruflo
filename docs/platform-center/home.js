/* Platform Center: the Today screen, nic's home base.
 *
 * Ask Jarvis (a chat with Claude through the page's `sample` capability, on
 * nic's own claude.ai account, aware of the whole city), Nova's latest
 * briefing, the "Your part" to-dos, the crew's latest work, and quick links.
 * The neon city is one tab away. The chat is saved in the city document
 * (state.jarvis.chat), trimmed small; it is not part of nic's Claude app chats.
 */
(function () {
  'use strict';
  const PC = (window.PC = window.PC || {});
  const { h, icon, toast } = PC.ui;

  const state = () => PC.store.get();
  const $ = (id) => document.getElementById(id);

  const RAW = 'https://raw.githubusercontent.com/nicdogalog-cloud/ruflo/crease-cam-files/social/';
  const LINKS = [
    { title: 'Instagram', sub: '@creasecam07', url: 'https://www.instagram.com/creasecam07/' },
    { title: 'Website', sub: 'nicdogalog-cloud.github.io/ruflo', url: 'https://nicdogalog-cloud.github.io/ruflo/' },
    { title: 'All videos', sub: 'GitHub folder', url: 'https://github.com/nicdogalog-cloud/ruflo/tree/crease-cam-files/social' },
  ];
  // Newest first, as of 2 October 2026 (from social/posted-log.md). "Watch" goes to the Instagram reel when there is one.
  const VIDEOS = [
    { title: 'Crease Cam app explainer', file: 'crease-cam-app-explainer.mp4' },
    { title: 'Do this before you pad up', file: 'crease-cam-nets-session-habits.mp4' },
    { title: 'Better nets videos for £0', file: 'crease-cam-free-to-start.mp4' },
    { title: 'Same phone, better spot (before and after)', file: 'crease-cam-before-after-nets.mp4', reel: 'https://www.instagram.com/reel/Dd_-2wjFB0Q/' },
    { title: 'Things cricketers say', file: 'crease-cam-things-cricketers-say.mp4' },
    { title: 'Rating your nets filming setups', file: 'crease-cam-rate-my-setup.mp4', reel: 'https://www.instagram.com/reel/Dd_cQZrgbEr/' },
  ];
  const SUGGEST = ['What should I do today?', 'What’s waiting for me?', 'Sum up the latest briefing', 'Write a caption for today’s video'];

  let busy = null; // { ctl, live, text, log }
  let lastTick = null; // { bid, tid, nicStep } for Undo
  let errorNote = '';
  let briefOpen = false;

  const when = (at) => {
    if (!at) return '';
    const d = new Date(at);
    const today = new Date();
    const same = d.toDateString() === today.toDateString();
    return same ? `today, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
      : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + `, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  };

  /* ---------- Ask Jarvis ---------- */
  function chatLog() {
    const s = state();
    const list = (s.jarvis && s.jarvis.chat) || [];
    const kids = [];
    if (!list.length && !busy) {
      kids.push(h('div', { class: 'bubble agent intro', text: `Hi ${s.owner}, I’m Jarvis. Ask me anything about the business. I can see the crew’s tasks, your to-dos and the latest briefing.` }));
    }
    list.forEach((m) => kids.push(h('div', { class: `bubble ${m.role === 'me' ? 'me' : 'agent'}`, text: m.text })));
    if (busy) {
      kids.push(h('div', { class: 'bubble agent live', 'aria-live': 'polite' },
        busy.log.length ? h('div', { class: 'tool-log', text: busy.log.join('\n') }) : null,
        busy.text || 'Thinking…'));
    }
    if (errorNote) kids.push(h('p', { class: 'ask-error', role: 'alert', text: errorNote }));
    return kids;
  }
  function renderLog() {
    const log = $('ask-log');
    if (!log) return;
    const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.replaceChildren(...chatLog());
    if (atEnd || busy) log.scrollTop = log.scrollHeight;
    const send = $('ask-send');
    if (send) send.replaceChildren(...(busy ? [icon('stop'), 'Stop'] : [icon('send'), 'Send']));
    $('ask-suggest').hidden = !!busy || ((state().jarvis || {}).chat || []).length > 2;
    $('ask-mode').textContent = PC.ai.available()
      ? 'Answers come from Claude on your claude.ai account.'
      : 'Jarvis can answer only when this page is open on claude.ai. Here it follows simple orders.';
  }

  // Send one message; resolves with Jarvis's reply text ('' on error). Voice mode uses it too.
  async function send(raw) {
    const text = String(raw || '').trim().slice(0, PC.util.JARVIS_MSG);
    if (!text || busy) return '';
    errorNote = '';
    PC.voice.stopSpeaking();
    PC.app.change((st) => { st.jarvis.chat.push({ role: 'me', text, at: Date.now() }); }, { quiet: true });
    if (!PC.ai.available()) {
      const s = state();
      const lead = s.buildings.find((b) => b.lead) || s.buildings[0];
      const res = PC.ai.offline(lead, text);
      const reply = res.text;
      PC.app.change((st) => { st.jarvis.chat.push({ role: 'jarvis', text: reply, at: Date.now() }); }, { quiet: true });
      if (res.action === 'brief') PC.app.openBrief();
      render();
      return reply;
    }
    busy = { ctl: new AbortController(), text: '', log: [] };
    renderLog();
    let reply = '';
    try {
      const history = state().jarvis.chat.slice();
      const res = await PC.ai.jarvis(history, {
        signal: busy.ctl.signal,
        onText: ({ text: t }) => { if (busy) { busy.text = t; renderLog(); } },
        onLog: (line) => { if (busy) { busy.log.push(line); renderLog(); } },
      });
      reply = String(res.text || '').trim();
    } catch (e) {
      if (e && e.code === 'cancelled') reply = String((e && e.text) || (busy && busy.text) || '').trim();
      else { errorNote = PC.ai.errorText(e); reply = ''; }
    }
    const log = busy ? busy.log : [];
    busy = null;
    if (reply) {
      const full = log.length ? `${log.join('\n')}\n\n${reply}` : reply;
      PC.app.change((st) => { st.jarvis.chat.push({ role: 'jarvis', text: full, at: Date.now() }); }, { quiet: true });
      if (PC.voice.aloud() && !PC.voice.isOn()) PC.voice.speak(reply);
    }
    render();
    return reply;
  }

  function askPanel() {
    const input = h('textarea', { id: 'ask-input', rows: '3', maxlength: String(PC.util.JARVIS_MSG), placeholder: 'Ask Jarvis anything… (Enter to send, Shift+Enter for a new line)', 'aria-label': 'Message to Jarvis' });
    const go = () => { if (busy) { busy.ctl.abort(); return; } const v = input.value; if (!v.trim()) { input.focus(); return; } input.value = ''; send(v); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); go(); } });
    const confirmClear = h('div', { class: 'confirm', hidden: true },
      h('p', { text: 'Clear the whole Jarvis chat? This can’t be undone.' }),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { confirmClear.hidden = true; } }, 'Keep it'),
        h('button', { class: 'btn danger', type: 'button', onclick: () => { PC.app.change((st) => { st.jarvis.chat = []; }, { quiet: true }); confirmClear.hidden = true; errorNote = ''; renderLog(); toast('Chat cleared'); } }, 'Clear chat')));
    return h('section', { class: 'ask', 'aria-labelledby': 'ask-title' },
      h('div', { class: 'ask-head' },
        h('div', {}, h('h2', { id: 'ask-title', text: 'Ask Jarvis' }), h('p', { class: 'hint', id: 'ask-mode' })),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => { confirmClear.hidden = false; } }, 'Clear chat')),
      confirmClear,
      h('div', { class: 'ask-log', id: 'ask-log', role: 'log', 'aria-label': 'Chat with Jarvis' }),
      h('div', { class: 'quick', id: 'ask-suggest' }, SUGGEST.map((q) => h('button', { type: 'button', class: 'chip-btn', onclick: () => send(q) }, q))),
      h('form', { class: 'ask-form', onsubmit: (e) => { e.preventDefault(); go(); } },
        input,
        h('button', { class: 'btn big', type: 'submit', id: 'ask-send' }, icon('send'), 'Send')),
      voiceBar());
  }

  /* ---------- voice ---------- */
  const VOICE_TEXT = {
    off: '',
    starting: 'Starting the microphone…',
    waiting: 'Listening. Say “Hi Jarvis”, then your question.',
    heard: 'Go ahead, I’m listening…',
    thinking: 'Jarvis is thinking…',
    speaking: 'Jarvis is speaking…',
  };
  function voiceBar() {
    const vBtn = h('button', { class: 'btn ghost toggle', type: 'button', id: 'voice-btn', 'aria-pressed': 'false', onclick: () => {
      if (PC.voice.isOn()) PC.voice.stop(); else PC.voice.start();
    } });
    const aBtn = h('button', { class: 'btn ghost toggle', type: 'button', id: 'aloud-btn', 'aria-pressed': 'false', hidden: !PC.voice.canSpeak(), onclick: () => {
      PC.voice.setAloud(aBtn.getAttribute('aria-pressed') !== 'true'); paintVoice();
    } }, 'Read replies aloud');
    return h('div', { class: 'voice' },
      h('div', { class: 'row' }, vBtn, aBtn),
      h('p', { class: 'voice-status', id: 'voice-status', role: 'status' }));
  }
  function paintVoice() {
    const st = PC.voice.state();
    const on = PC.voice.isOn();
    const vBtn = $('voice-btn');
    if (!vBtn) return;
    vBtn.setAttribute('aria-pressed', String(on));
    vBtn.classList.toggle('on', on);
    vBtn.replaceChildren(h('span', { class: 'mic-dot' + (on ? ' live' : ''), 'aria-hidden': 'true' }), on ? 'Voice mode on · turn off' : 'Voice mode');
    const aBtn = $('aloud-btn');
    if (aBtn) { const a = PC.voice.aloud(); aBtn.setAttribute('aria-pressed', String(a)); aBtn.classList.toggle('on', a); aBtn.disabled = on; }
    const out = $('voice-status');
    if (st === 'blocked') {
      out.className = 'voice-status blocked';
      out.replaceChildren(h('strong', { text: 'Voice mode is off. ' }), PC.voice.reason(), ' ',
        'You can still talk to Jarvis: click in the box and use your computer’s dictation (Windows: press the Windows key + H. Mac: Edit menu › Start Dictation), then press Send. “Read replies aloud” still works.');
    } else {
      out.className = 'voice-status' + (on ? ' live' : '');
      out.textContent = VOICE_TEXT[st] || '';
    }
    document.body.classList.toggle('listening', on);
  }

  /* ---------- the Today column ---------- */
  function briefCard(s) {
    const b = PC.ai.latestBriefing(s);
    if (!b) return h('section', { class: 'card' }, h('h3', { text: 'Latest briefing' }), h('p', { class: 'empty', text: 'No briefing yet. The crew shift writes one every 2 hours.' }));
    const long = b.text.length > 700;
    return h('section', { class: 'card brief-card', 'aria-labelledby': 'brief-title' },
      h('div', { class: 'card-head' },
        h('h3', { id: 'brief-title', text: `${b.from}’s latest briefing` }),
        h('span', { class: 'muted small', text: when(b.at) })),
      h('div', { class: 'brief-text' + (long && !briefOpen ? ' clamp' : ''), text: b.text }),
      h('div', { class: 'row' },
        long ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => { briefOpen = !briefOpen; render(); } }, briefOpen ? 'Show less' : 'Show all') : null,
        PC.voice.canSpeak() ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => PC.voice.speak(b.text) }, 'Read it to me') : null));
  }

  function tick(b, t) {
    lastTick = { bid: b.id, tid: t.id, nicStep: t.nicStep, title: t.title };
    PC.app.change((st) => {
      const k = st.buildings.find((x) => x.id === b.id).tasks.find((x) => x.id === t.id);
      if (k) { k.done = true; k.doneAt = Date.now(); k.review = false; k.nicStep = ''; }
    });
  }
  function undo() {
    const u = lastTick;
    lastTick = null;
    if (!u) return;
    PC.app.change((st) => {
      const b = st.buildings.find((x) => x.id === u.bid);
      const k = b && b.tasks.find((x) => x.id === u.tid);
      if (k) { k.done = false; k.doneAt = ''; k.review = true; k.nicStep = u.nicStep; }
    });
  }

  function partCard(s) {
    const list = PC.ai.yourPart(s);
    return h('section', { class: 'card', 'aria-labelledby': 'part-title' },
      h('div', { class: 'card-head' }, h('h3', { id: 'part-title', text: 'Your part' }), h('span', { class: 'count', text: list.length ? `${list.length} to do` : '' })),
      lastTick ? h('p', { class: 'undo-row' }, `Ticked off: ${lastTick.title}. `, h('button', { type: 'button', class: 'link-like', onclick: undo }, 'Undo')) : null,
      list.length ? h('ul', { class: 'todo' }, list.map(({ b, t }) => {
        const id = `todo-${t.id}`;
        return h('li', { style: `--b:${b.color}` },
          h('input', { type: 'checkbox', id, onchange: () => tick(b, t), 'aria-label': `Done: ${t.title}` }),
          h('label', { for: id, class: 'todo-text' },
            h('strong', { text: t.nicStep || t.title }),
            h('span', { class: 'muted', text: `${b.name} · ${t.title}` })),
          h('button', { type: 'button', class: 'btn ghost small', onclick: () => openWork(b.id, t.id) }, 'See the work'));
      })) : h('p', { class: 'empty', text: 'Nothing waiting for you. Nice.' }));
  }

  function workCard(s) {
    const done = [];
    s.buildings.forEach((b) => PC.ai.recentWork(b).forEach((t) => { if (!t.review) done.push({ b, t }); }));
    done.sort((a, c) => c.t.resultAt - a.t.resultAt);
    const top = done.slice(0, 5);
    return h('section', { class: 'card', 'aria-labelledby': 'work-title' },
      h('div', { class: 'card-head' }, h('h3', { id: 'work-title', text: 'Latest crew work' }),
        h('button', { type: 'button', class: 'link-like small', onclick: () => PC.app.setView('city') }, 'Open the city')),
      top.length ? h('ul', { class: 'work-feed' }, top.map(({ b, t }) => h('li', {},
        h('button', { type: 'button', class: 'feed-row', style: `--b:${b.color}`, onclick: () => openWork(b.id, t.id) },
          h('span', { class: 'who', text: b.name }),
          h('span', { class: 'what' }, h('strong', { text: t.title }), t.summary ? h('span', { class: 'muted', text: t.summary }) : null),
          h('span', { class: 'muted small when', text: when(t.resultAt) })))))
        : h('p', { class: 'empty', text: 'No finished crew work yet.' }));
  }

  function linksCard(s) {
    const site = s.buildings.find((b) => b.site && b.site.url);
    const links = LINKS.slice(0, 2).concat(site ? [{ title: site.site.label.replace(/ website\/app$/i, ' app'), sub: site.site.tag || 'Test site', url: site.site.url }] : [], LINKS.slice(2));
    return h('section', { class: 'card', 'aria-labelledby': 'links-title' },
      h('h3', { id: 'links-title', text: 'Quick links' }),
      h('div', { class: 'quick-links' }, links.map((l) => h('a', { class: 'qlink', href: l.url, target: '_blank', rel: 'noopener noreferrer' },
        h('strong', { text: l.title }), h('span', { class: 'muted', text: l.sub })))),
      h('h3', { class: 'sub-head', text: 'Latest videos' }),
      h('ul', { class: 'videos' }, VIDEOS.map((v) => h('li', {},
        h('span', { class: 'v-title', text: v.title }),
        v.reel ? h('a', { class: 'btn ghost small', href: v.reel, target: '_blank', rel: 'noopener noreferrer' }, 'Watch') : null,
        h('a', { class: 'btn ghost small', href: RAW + v.file, target: '_blank', rel: 'noopener noreferrer', title: 'Downloads the video file' }, 'Download')))),
      h('p', { class: 'hint', text: 'Newest first, as of 2 October. “All videos” always has the full, up-to-date list.' }));
  }

  function openWork(bid, tid) {
    PC.app.setView('city');
    PC.panel.open(bid, 'work');
    PC.work.open(bid, tid);
  }

  function render() {
    const side = $('today-side');
    if (!side) return;
    const s = state();
    const hour = new Date().getHours();
    $('today-hello').textContent = `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}, ${s.owner}`;
    $('today-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    side.replaceChildren(briefCard(s), partCard(s), workCard(s), linksCard(s));
    renderLog();
  }

  function mount() {
    $('ask-slot').replaceWith(askPanel());
    PC.voice.init({ onCommand: (text) => send(text), onState: paintVoice });
    paintVoice();
    render();
  }

  PC.home = { mount, render, send };
})();
