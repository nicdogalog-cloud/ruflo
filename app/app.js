import { clips, settings } from './store.js';
import { Camera, DemoCamera, ZOOM } from './camera.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');
// Website preview: no real camera, demo clips instead. Set to false for the real app.
const DEMO = false;
const cam = DEMO ? new DemoCamera($('#demoFeed')) : new Camera($('#preview'));
const DEMO_CLIP = { bat: { src: 'demo/bat-1.mp4', thumb: 'demo/hero-batter-nets-thumb.jpg', duration: 4 },
  bowl: { src: 'demo/bowl-1.mp4', thumb: 'demo/nets-empty-lane-thumb.jpg', duration: 4 } };
let state = settings.get();
let current = 'film';
let filter = 'all';

/* ---------------- guide card ---------------- */
const MODES = {
  bat: { name: 'Batting', sees: "The batter face-on, over the bowler's shoulder.", zoom: '3x', zoomNote: 'tight on the batter',
    watch: 'Head position, stance and trigger, front foot stride, bat path, balance.', cone: 'M292 75L80 60L80 90Z', hint: 'Record, then bat' },
  bowl: { name: 'Bowling', sees: 'You from behind as you bowl, and the whole pitch.', zoom: '1x', zoomNote: 'wide, whole pitch',
    watch: 'Last strides, front foot landing and no-balls, arm and release, line and where it pitches, follow-through.', cone: 'M292 75L40 46L40 104Z', hint: 'Record, then bowl' },
};

function renderGuides() {
  const m = MODES[state.mode];
  $$('.guide-card-slot').forEach((slot) => {
    if (!slot.firstElementChild) slot.append($('#guideTpl').content.cloneNode(true));
    $('[data-gc="modeName"]', slot).textContent = m.name.toUpperCase();
    $('[data-gc="sees"]', slot).textContent = m.sees;
    $('[data-gc="zoom"]', slot).textContent = m.zoom;
    $('[data-gc="zoomNote"]', slot).textContent = m.zoomNote;
    $('[data-gc="watch"]', slot).textContent = m.watch;
    $('[data-gc="cone"]', slot).setAttribute('d', m.cone);
  });
}

/* ---------------- mode ---------------- */
function setMode(mode) {
  state = settings.set({ mode });
  $$('[data-setmode]').forEach((b) => b.classList.toggle('is-on', b.dataset.setmode === mode));
  $('#filmHint').textContent = `${MODES[mode].name} · zoom ${MODES[mode].zoom} · ${MODES[mode].hint}`;
  if (cam.on) cam.setZoom(ZOOM[mode]);
  renderGuides();
}

/* ---------------- navigation ---------------- */
function go(tab) {
  if (app.classList.contains('recording')) return;
  current = tab;
  $$('.screen').forEach((s) => (s.hidden = s.dataset.tab !== tab));
  $$('.tab').forEach((t) => t.classList.toggle('is-on', t.dataset.goto === tab));
  if (tab === 'clips') renderClips();
  if (tab === 'settings') renderSettings();
  if (tab === 'film') { if (DEMO) startCamera(); else if (cam.on) cam.video.play().catch(() => {}); }
  else if (cam.on && !app.classList.contains('recording')) cam.stop(), showIdle();
}

/* ---------------- sheets ---------------- */
function openSheet(id) {
  $('#scrim').hidden = false;
  $$('.sheet').forEach((s) => (s.hidden = s.id !== id));
}
function closeSheets() {
  $('#scrim').hidden = true;
  $$('.sheet').forEach((s) => (s.hidden = true));
}
function confirm(title, text, yesLabel) {
  $('#confirmTitle').textContent = title;
  $('#confirmText').textContent = text;
  $('#confirmYes').textContent = yesLabel;
  openSheet('confirmSheet');
  return new Promise((res) => {
    const yes = () => { cleanup(); closeSheets(); res(true); };
    const no = () => { cleanup(); res(false); };
    const cleanup = () => { $('#confirmYes').removeEventListener('click', yes); $('#scrim').removeEventListener('click', no); };
    $('#confirmYes').addEventListener('click', yes);
    $('#scrim').addEventListener('click', no, { once: true });
  });
}

let toastT;
function toast(msg, ms = 2800) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms);
}

/* ---------------- first run ---------------- */
function showStep(name) {
  $$('.ob-step').forEach((s) => (s.hidden = s.dataset.step !== name));
}
function startOnboarding() {
  $('#onboard').hidden = false;
  showStep('welcome');
}
$('#onboard').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.age) { state = settings.set({ family: b.dataset.age === 'junior' }); showStep(b.dataset.age === 'junior' ? 'parent' : 'private'); }
  else if (b.dataset.mode) { setMode(b.dataset.mode); state = settings.set({ defMode: b.dataset.mode }); showStep('guide'); }
  else if (b.dataset.next) showStep(b.dataset.next);
  else if ('finish' in b.dataset) {
    state = settings.set({ onboarded: true });
    $('#onboard').hidden = true;
    go('film');
    startCamera();
  }
});

/* ---------------- camera ---------------- */
function showIdle() {
  $('#vfIdle').hidden = cam.on; $('#vfError').hidden = true;
  $('#recBtn').disabled = false;
}
async function startCamera() {
  try {
    await cam.start();
    await cam.setZoom(ZOOM[state.mode]);
    $('#vfIdle').hidden = true; $('#vfError').hidden = true;
  } catch (err) {
    $('#vfIdle').hidden = true; $('#vfError').hidden = false;
  }
}
$('#startCam').addEventListener('click', () => {
  if (state.showGuide && !sessionStorage.getItem('cc.guideSeen')) {
    sessionStorage.setItem('cc.guideSeen', '1');
    openSheet('guideSheet');
    $('#guideSheet [data-close-sheet]').addEventListener('click', startCamera, { once: true });
  } else startCamera();
});
$('#retryCam').addEventListener('click', startCamera);

let recStart = 0, recTimer = 0, recSnap = '';
async function toggleRecord() {
  if (state.family === 'pending') return toast('A parent or guardian needs to finish setup before filming.');
  if (!cam.on) { await startCamera(); if (!cam.on) return; }
  if (!app.classList.contains('recording')) {
    try { cam.startRecording(); } catch { return toast("This phone can't record here yet. Try Safari's latest version."); }
    recStart = Date.now();
    app.classList.add('recording', 'recording-lock');
    $('#recPill').hidden = false;
    $('#recTime').textContent = '00:00';
    recTimer = setInterval(() => {
      const s = Math.floor((Date.now() - recStart) / 1000);
      $('#recTime').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      if (s === 1) recSnap = cam.snapshot();
    }, 250);
    navigator.vibrate?.(15);
  } else {
    await finishRecording();
  }
}
async function finishRecording(interrupted = false) {
  clearInterval(recTimer);
  const thumb = recSnap || cam.snapshot();
  recSnap = '';
  const blob = await cam.stopRecording();
  app.classList.remove('recording', 'recording-lock');
  $('#recPill').hidden = true;
  if (!DEMO && (!blob || !blob.size)) return;
  const first = !(await clips.all()).length;
  const clip = DEMO
    ? { id: String(Date.now()), created: Date.now(), mode: state.mode, duration: (Date.now() - recStart) / 1000, src: DEMO_CLIP[state.mode].src, thumb }
    : { id: String(Date.now()), created: Date.now(), mode: state.mode, duration: (Date.now() - recStart) / 1000, blob, type: blob.type, thumb };
  try { await clips.add(clip); }
  catch { return toast("Your phone is out of space, so this clip can't be saved. Free up some space and try again.", 4500); }
  navigator.storage?.persist?.();
  setLastThumb(thumb);
  if (interrupted) toast('Recording stopped. The part you filmed is saved.', 4000);
  else toast(first ? 'Saved on this phone. Film from the same spot next time to compare.' : 'Saved to Clips', first ? 4500 : 1800);
}
$('#recBtn').addEventListener('click', toggleRecord);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && app.classList.contains('recording')) finishRecording(true);
});

function setLastThumb(src) {
  const b = $('#lastClip');
  b.innerHTML = src ? `<img src="${src}" alt="">` : '<span class="thumb-empty"></span>';
}
$('#lastClip').addEventListener('click', async () => {
  const [c] = await clips.all();
  if (c) openPlayer(c); else go('clips');
});
$('#showGuide').addEventListener('click', () => openSheet('guideSheet'));

/* ---------------- clips ---------------- */
const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
function dayLabel(ts) {
  const d = new Date(ts), today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
async function renderClips() {
  const list = (await clips.all()).filter((c) => filter === 'all' || c.mode === filter);
  const box = $('#clipList');
  box.innerHTML = '';
  $('#clipsEmpty').hidden = list.length > 0;
  const groups = new Map();
  list.forEach((c) => { const k = dayLabel(c.created); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); });
  for (const [label, items] of groups) {
    const sec = document.createElement('div');
    sec.innerHTML = `<p class="day-label">${label} · ${items.length} clip${items.length > 1 ? 's' : ''}</p>`;
    const grid = document.createElement('div');
    grid.className = 'clip-grid';
    items.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'clip';
      const time = new Date(c.created).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      b.innerHTML = `${c.thumb ? `<img src="${c.thumb}" alt="">` : ''}<span class="clip-tag ${c.mode}">${c.mode === 'bat' ? 'BAT 3x' : 'BOWL 1x'}</span><span class="clip-info"><span>${time}</span><span>${fmtDur(c.duration)}</span></span>`;
      b.addEventListener('click', () => openPlayer(c));
      grid.append(b);
    });
    sec.append(grid);
    box.append(sec);
  }
}
$$('[data-filter]').forEach((b) => b.addEventListener('click', () => {
  filter = b.dataset.filter;
  $$('[data-filter]').forEach((x) => x.classList.toggle('is-on', x === b));
  renderClips();
}));

/* ---------------- player ---------------- */
const pv = $('#pVideo');
let playing = null, url = '';
function openPlayer(c) {
  playing = c;
  url && URL.revokeObjectURL(url);
  url = c.blob ? URL.createObjectURL(c.blob) : '';
  pv.src = url || c.src; pv.playbackRate = 1; pv.load();
  $('#pTitle').textContent = MODES[c.mode].name + (c.mode === 'bat' ? ' · 3x' : ' · 1x');
  $('#pDate').textContent = new Date(c.created).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  $$('[data-rate]').forEach((b) => b.classList.toggle('is-on', b.dataset.rate === '1'));
  $('#player').hidden = false;
  if (cam.on && !app.classList.contains('recording')) cam.stop(), showIdle();
}
function closePlayer() {
  pv.pause(); $('#player').hidden = true;
  if (current === 'clips') renderClips();
}
const fmtT = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
function syncScrub() {
  const d = isFinite(pv.duration) ? pv.duration : playing?.duration || 0;
  const p = d ? (pv.currentTime / d) * 100 : 0;
  $('#pScrub').value = p * 10;
  $('#pScrub').style.setProperty('--p', p + '%');
  $('#pCur').textContent = fmtT(pv.currentTime || 0);
  $('#pDur').textContent = fmtT(d);
}
pv.addEventListener('timeupdate', syncScrub);
pv.addEventListener('loadedmetadata', syncScrub);
pv.addEventListener('play', () => $('#player').classList.add('playing'));
pv.addEventListener('pause', () => $('#player').classList.remove('playing'));
pv.addEventListener('error', () => { if (playing) toast("This clip can't be opened. It may have been deleted from your phone."); });
$('#pPlay').addEventListener('click', () => (pv.paused ? pv.play() : pv.pause()));
$('#pScrub').addEventListener('input', (e) => {
  const d = isFinite(pv.duration) ? pv.duration : playing?.duration || 0;
  pv.pause(); pv.currentTime = (e.target.value / 1000) * d; syncScrub();
});
$('#stepBack').addEventListener('click', () => { pv.pause(); pv.currentTime = Math.max(0, pv.currentTime - 1 / 30); });
$('#stepFwd').addEventListener('click', () => { pv.pause(); pv.currentTime = pv.currentTime + 1 / 30; });
$$('[data-rate]').forEach((b) => b.addEventListener('click', () => {
  pv.playbackRate = +b.dataset.rate;
  $$('[data-rate]').forEach((x) => x.classList.toggle('is-on', x === b));
}));
$('#closePlayer').addEventListener('click', closePlayer);
$('#saveClip').addEventListener('click', async () => {
  if (!playing) return;
  if (!playing.blob) return toast('In the app, this saves the clip to your Photos.');
  const ext = (playing.type || '').includes('webm') ? 'webm' : 'mp4';
  const file = new File([playing.blob], `crease-cam-${playing.id}.${ext}`, { type: playing.type || 'video/mp4' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch {}
  } else {
    const a = document.createElement('a');
    a.href = url; a.download = file.name; a.click();
  }
});
$('#deleteClip').addEventListener('click', async () => {
  if (!playing) return;
  if (!(await confirm('Delete this clip?', 'It will be removed from this phone.', 'Delete'))) return;
  await clips.remove(playing.id);
  closePlayer();
  const [c] = await clips.all();
  setLastThumb(c?.thumb || '');
  if (current === 'clips') renderClips();
});

/* ---------------- settings ---------------- */
async function renderSettings() {
  $$('[data-defmode]').forEach((b) => b.classList.toggle('is-on', b.dataset.defmode === state.defMode));
  $('#optGuide').checked = !!state.showGuide;
  $('#clipCount').textContent = String((await clips.all()).length);
  $('#familyNote').textContent = state.family ? 'Under-18 player ›' : 'Not needed';
}
$$('[data-defmode]').forEach((b) => b.addEventListener('click', () => {
  state = settings.set({ defMode: b.dataset.defmode });
  setMode(b.dataset.defmode);
  renderSettings();
}));
$('#optGuide').addEventListener('change', (e) => (state = settings.set({ showGuide: e.target.checked })));
$('#deleteAll').addEventListener('click', async () => {
  const n = (await clips.all()).length;
  if (!n) return toast('No clips to delete.');
  if (!(await confirm(`Delete all ${n} clips?`, 'Every Crease Cam clip on this phone will be removed. This can’t be undone.', 'Delete all'))) return;
  await clips.clear(); setLastThumb(''); renderSettings();
});
$('#replayIntro').addEventListener('click', startOnboarding);
$('#familyRow').addEventListener('click', () => { startOnboarding(); showStep('age'); });
$('#restore').addEventListener('click', () => toast('Pro arrives with the App Store version.'));

/* ---------------- global clicks ---------------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-goto],[data-pro],[data-close-sheet],[data-soon],[data-setmode]');
  if (!t) return;
  if (t.dataset.goto) go(t.dataset.goto);
  else if ('pro' in t.dataset) openSheet('proSheet');
  else if ('closeSheet' in t.dataset) closeSheets();
  else if ('soon' in t.dataset) { closeSheets(); toast('Pro arrives with the App Store version.'); }
  else if (t.dataset.setmode && !app.classList.contains('recording')) setMode(t.dataset.setmode);
});
$('#scrim').addEventListener('click', closeSheets);

/* ---------------- boot ---------------- */
setMode(state.onboarded ? state.defMode : state.mode);
renderGuides();
async function seedDemo() {
  if (!DEMO || localStorage.getItem('cc.demoSeeded')) return;
  const day = 864e5, now = Date.now();
  const seed = [['bowl', now - day - 3.6e6], ['bat', now - day - 3.5e6], ['bat', now - day - 3.4e6]];
  for (const [mode, t] of seed) await clips.add({ id: 'demo-' + t, created: Math.round(t), mode, ...DEMO_CLIP[mode] });
  try { localStorage.setItem('cc.demoSeeded', '1'); } catch {}
}
seedDemo().then(() => clips.all()).then(([c]) => setLastThumb(c?.thumb || '')).catch(() => {});
if (!state.onboarded) startOnboarding(); else if (DEMO) startCamera();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
