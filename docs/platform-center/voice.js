/* Platform Center: talking to Jarvis.
 *
 * Two separate parts:
 *  - Reading replies aloud uses the browser's speechSynthesis (a British voice
 *    when the computer has one). It needs no microphone.
 *  - Voice mode listens through the microphone with the browser's speech
 *    recognition (Chrome and Edge), waits for "Hi Jarvis" or "Hey Jarvis",
 *    sends what nic says next, reads the answer out and listens again.
 *    It listens only while this page is open and voice mode is on.
 *    If the browser or the page frame blocks the microphone, voice mode turns
 *    itself off and says why; nothing is faked.
 */
(function () {
  'use strict';
  const PC = (window.PC = window.PC || {});

  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const synth = window.speechSynthesis || null;
  const WAKE = /\b(?:hi|hey|hiya|high|hay|ok|okay)[\s,]+jarvis\b[\s,.!?]*(.*)$/i;
  const AWAKE_MS = 10000;

  let onCommand = async () => '';
  let onState = () => {};
  let on = false;
  let state = 'off'; // off | starting | waiting | heard | thinking | speaking | blocked
  let reason = '';
  let rec = null;
  let awakeUntil = 0;
  let restarts = [];
  let speakAloud = false;

  const set = (st, why = '') => { state = st; reason = why; onState(state, reason); };

  /* ---------- speaking ---------- */
  let voice = null;
  function pickVoice() {
    if (!synth) return null;
    const all = synth.getVoices() || [];
    const gb = all.filter((v) => /en[-_]GB/i.test(v.lang));
    voice = gb.find((v) => /male|daniel|george|ryan|thomas|arthur/i.test(v.name) && !/female/i.test(v.name))
      || gb.find((v) => /google/i.test(v.name)) || gb[0]
      || all.find((v) => /^en/i.test(v.lang)) || null;
    return voice;
  }
  if (synth) { pickVoice(); try { synth.addEventListener('voiceschanged', pickVoice); } catch (e) { /* older browsers */ } }

  // Short pieces read more reliably than one long utterance in Chrome.
  function chunks(text) {
    const clean = String(text || '').replace(/^\s*[-•*]\s+/gm, '').replace(/[#*_`]/g, '').replace(/https?:\/\/\S+/g, 'the link').trim();
    const parts = clean.match(/[^.!?\n]+[.!?]*/g) || [];
    const out = [];
    let cur = '';
    parts.forEach((p) => { if ((cur + p).length > 220 && cur) { out.push(cur.trim()); cur = ''; } cur += ' ' + p; });
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  function speak(text) {
    return new Promise((resolve) => {
      if (!synth) { resolve(false); return; }
      try { synth.cancel(); } catch (e) { /* ignore */ }
      const list = chunks(text);
      if (!list.length) { resolve(true); return; }
      const v = voice || pickVoice();
      let left = list.length;
      // safety net: some browsers never fire 'end'
      const guard = setTimeout(() => resolve(true), Math.min(120000, 4000 + String(text).length * 90));
      list.forEach((piece) => {
        const u = new SpeechSynthesisUtterance(piece);
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-GB';
        u.rate = 1;
        const done = () => { left -= 1; if (left <= 0) { clearTimeout(guard); resolve(true); } };
        u.onend = done;
        u.onerror = done;
        synth.speak(u);
      });
    });
  }
  function stopSpeaking() { try { if (synth) synth.cancel(); } catch (e) { /* ignore */ } }

  /* ---------- listening ---------- */
  async function micCheck() {
    // A clear answer first: does the page frame let us use the microphone at all?
    try {
      const fp = document.permissionsPolicy || document.featurePolicy;
      if (fp && typeof fp.allowsFeature === 'function' && !fp.allowsFeature('microphone')) {
        return 'This page’s frame on claude.ai does not allow the microphone, so voice mode can’t listen here.';
      }
    } catch (e) { /* not supported: carry on */ }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return '';
    } catch (e) {
      const n = e && e.name;
      if (n === 'NotFoundError') return 'No microphone was found on this computer.';
      if (n === 'NotAllowedError' || n === 'SecurityError') return 'The microphone is blocked for this page (by the browser or by claude.ai’s page frame), so voice mode can’t listen here.';
      return `The microphone could not start (${n || 'unknown error'}).`;
    }
  }

  function makeRec() {
    const r = new Rec();
    r.lang = 'en-GB';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onstart = () => { if (on && state === 'starting') set('waiting'); };
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const said = (res[0] && res[0].transcript || '').trim();
        if (!said) continue;
        const m = said.match(WAKE);
        if (!res.isFinal) {
          if (m && state === 'waiting') { awakeUntil = Date.now() + AWAKE_MS; set('heard'); }
          continue;
        }
        restarts = [];
        if (m && m[1].trim()) { command(m[1].trim()); return; }
        if (m) { awakeUntil = Date.now() + AWAKE_MS; set('heard'); continue; }
        if (Date.now() < awakeUntil) { command(said); return; }
      }
      if (state === 'heard' && Date.now() > awakeUntil) set('waiting');
    };
    r.onerror = (e) => {
      const err = e && e.error;
      if (err === 'not-allowed' || err === 'service-not-allowed') stop('The browser blocked speech recognition for this page, so voice mode can’t listen here.');
      else if (err === 'audio-capture') stop('No microphone could be used.');
      else if (err === 'network') stop('The browser’s speech service could not be reached, so voice mode can’t listen right now.');
      else if (err === 'language-not-supported') stop('This browser can’t recognise British English speech.');
      // 'no-speech' and 'aborted' are normal: onend restarts listening
    };
    r.onend = () => {
      if (!on || state === 'thinking' || state === 'speaking') return;
      // restart, but not in a tight loop if the browser keeps stopping at once
      const now = Date.now();
      restarts = restarts.filter((t) => now - t < 15000).concat(now);
      if (restarts.length > 6) { stop('Listening kept stopping by itself, so voice mode turned off. Try again in a moment.'); return; }
      listen();
    };
    return r;
  }

  function listen() {
    if (!on) return;
    if (!rec) rec = makeRec();
    try { rec.start(); if (state !== 'heard') set('waiting'); } catch (e) { /* already started */ }
  }

  async function command(text) {
    awakeUntil = 0;
    set('thinking');
    try { rec && rec.abort(); } catch (e) { /* ignore */ }
    let reply = '';
    try { reply = await onCommand(text); } catch (e) { reply = ''; }
    if (!on) return;
    if (reply) { set('speaking'); await speak(reply); }
    if (!on) return;
    set('waiting');
    listen();
  }

  async function start() {
    if (on) return;
    if (!Rec) { set('blocked', 'This browser has no speech recognition. Voice mode works in Chrome or Edge on a computer.'); return; }
    on = true;
    set('starting');
    const problem = await micCheck();
    if (problem) { stop(problem); return; }
    if (!on) return;
    restarts = [];
    listen();
  }

  function stop(why) {
    on = false;
    awakeUntil = 0;
    try { rec && rec.abort(); } catch (e) { /* ignore */ }
    rec = null;
    stopSpeaking();
    set(why ? 'blocked' : 'off', why || '');
  }

  PC.voice = {
    init(o) { onCommand = o.onCommand || onCommand; onState = o.onState || onState; },
    canListen: () => !!Rec,
    canSpeak: () => !!synth,
    start, stop, speak, stopSpeaking,
    isOn: () => on,
    state: () => state,
    reason: () => reason,
    aloud: () => speakAloud || on,
    setAloud(v) { speakAloud = !!v; if (!v) stopSpeaking(); },
  };
})();
