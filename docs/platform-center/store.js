/* Platform Center: city state, the starter city, and saving.
 *
 * Saving works in two places:
 *  - On claude.ai the page asks for the `db` capability and keeps the whole
 *    city in one owner-only document (data/owner-hub/city/state).
 *  - Everywhere (and always as a backup) it keeps a copy in localStorage.
 * Nothing is written until the owner changes something.
 */
(function () {
  'use strict';
  const PC = (window.PC = window.PC || {});

  const LS_KEY = 'platform-center:v1';
  const DOC_PATH = 'data/owner-hub/city/state';
  const MAX_CHAT = 40;

  const uid = () => Math.random().toString(36).slice(2, 10);
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };

  const COLORS = ['#5ee7ff', '#a78bfa', '#ff7ad9', '#60a5fa', '#ffc857', '#7dffb2', '#ff9f5a', '#2dd4bf', '#c3f73a'];
  const STYLES = { tower: 'Tower', office: 'Office', studio: 'Studio', lab: 'Lab', shop: 'Shop', bank: 'Bank', depot: 'Depot', hall: 'Hall', house: 'House', stadium: 'Stadium' };
  // Agent types accepted by `npx ruflo@latest agent spawn -t <type>`.
  const RUFLO_TYPES = ['coordinator', 'architect', 'researcher', 'analyst', 'coder', 'reviewer', 'tester', 'optimizer'];
  const REPEATS = { daily: 'every day', weekdays: 'weekdays', mon: 'Mondays', tue: 'Tuesdays', wed: 'Wednesdays', thu: 'Thursdays', fri: 'Fridays', sat: 'Saturdays', sun: 'Sundays' };

  const task = (title, due = '', from = '') => ({ id: uid(), title, due, done: false, doneAt: '', from });
  const link = (title, url) => ({ id: uid(), title, url });
  const job = (title, time, repeat) => ({ id: uid(), title, time, repeat });
  // A building can look after one website or app: its link, and a short tag like "Test site".
  const site = (o) => (o && typeof o === 'object'
    ? { label: typeof o.label === 'string' && o.label ? o.label : 'Website/app', url: typeof o.url === 'string' ? o.url : '', tag: typeof o.tag === 'string' ? o.tag : '' }
    : null);

  function building(o) {
    return {
      id: o.id || uid(),
      name: o.name || 'New building',
      place: o.place || 'Office',
      role: o.role || 'Describe what this building takes care of.',
      style: STYLES[o.style] ? o.style : 'office',
      color: o.color || COLORS[0],
      ruflo: RUFLO_TYPES.includes(o.ruflo) ? o.ruflo : 'analyst',
      lead: !!o.lead,
      hall: !!o.hall,
      status: ['idle', 'working', 'stuck'].includes(o.status) ? o.status : 'idle',
      job: o.job || '',
      tasks: Array.isArray(o.tasks) ? o.tasks : [],
      links: Array.isArray(o.links) ? o.links : [],
      notes: typeof o.notes === 'string' ? o.notes : '',
      schedule: Array.isArray(o.schedule) ? o.schedule : [],
      chat: Array.isArray(o.chat) ? o.chat.slice(-MAX_CHAT) : [],
      site: site(o.site),
    };
  }

  /* Crease Cam: nic's cricket project, a stadium on the edge of the city.
   * Wicket keeps the Crease Cam website/app's update list. The id is fixed so
   * every load adds the very same building to a city saved before it existed. */
  const CREASE_CAM_ID = 'crease-cam';
  function creaseCam() {
    return building({
      id: CREASE_CAM_ID,
      name: 'Wicket', place: 'Crease Cam', style: 'stadium', color: '#c3f73a', ruflo: 'coder',
      role: 'Crease Cam, your cricket project. Keeps the Crease Cam website/app up to date: what needs updating, fixes and new releases.',
      site: { label: 'Crease Cam website/app', url: 'https://creasecam-test-u5t8ga.pages.dev/', tag: 'Test site' },
      tasks: [task('Go through the Crease Cam test site and list what needs updating', inDays(0)), task('Check the Crease Cam test site on a phone', inDays(1))],
      schedule: [job('Crease Cam update check', '10:00', 'mon')],
    });
  }

  /* Buildings added after a city was first saved. Each runs once per city:
   * its id goes into `seeded`, so a building the owner deletes stays deleted. */
  const SEEDS = [
    {
      id: 'crease-cam',
      apply(s) {
        const taken = s.buildings.some((b) => b.id === CREASE_CAM_ID || /^wicket$/i.test(b.name) || /^crease cam$/i.test(b.place));
        if (taken) return;
        const hall = s.buildings.findIndex((b) => b.hall);
        s.buildings.splice(hall < 0 ? s.buildings.length : hall, 0, creaseCam());
      },
    },
  ];
  function applySeeds(s) {
    SEEDS.forEach((seed) => {
      if (s.seeded.includes(seed.id)) return;
      seed.apply(s);
      s.seeded.push(seed.id);
    });
    return s;
  }

  function starter() {
    return {
      v: 1,
      starter: true,
      owner: 'nic',
      business: 'My new business',
      goal: { label: 'Monthly revenue', target: 2500, current: 0 },
      brief: { time: '08:00', lastSeen: '' },
      updatedAt: 0,
      seeded: SEEDS.map((x) => x.id),
      buildings: [
        building({
          name: 'Nova', place: 'HQ Tower', style: 'tower', color: '#5ee7ff', ruflo: 'coordinator', lead: true,
          role: 'Manager. Plans your day, hands out work to the other buildings and writes the morning brief.',
          job: 'Waiting for today’s plan',
          tasks: [task('Write the business idea in one sentence', inDays(0)), task('Set this month’s goal (tap GOAL at the top)', inDays(1)), task('Choose a name for the business', inDays(3))],
          links: [link('Calendar', 'https://calendar.google.com/'), link('Email', 'https://mail.google.com/')],
          schedule: [job('Morning brief', '08:00', 'daily'), job('Weekly review in the Meeting Hall', '17:00', 'fri')],
        }),
        building({
          name: 'Forge', place: 'Workshop', style: 'office', color: '#a78bfa', ruflo: 'architect',
          role: 'Product and projects. What you are building and every step to launch it.',
          tasks: [task('Decide what you sell first: a product or a service', inDays(2)), task('Write a 5-step launch checklist', inDays(5))],
          links: [link('GitHub', 'https://github.com/nicdogalog-cloud'), link('Ruflo fork', 'https://github.com/nicdogalog-cloud/ruflo')],
        }),
        building({
          name: 'Pixel', place: 'Studio', style: 'studio', color: '#ff7ad9', ruflo: 'analyst',
          role: 'Content and marketing. Posts, videos, brand and social accounts.',
          tasks: [task('Claim the business name on Instagram and TikTok', inDays(2)), task('Plan 3 launch posts', inDays(6))],
          links: [link('Instagram', 'https://www.instagram.com/'), link('TikTok', 'https://www.tiktok.com/')],
          schedule: [job('Post one piece of content', '18:00', 'weekdays')],
        }),
        building({
          name: 'Atlas', place: 'Research Lab', style: 'lab', color: '#60a5fa', ruflo: 'researcher',
          role: 'Research. Customers, competitors, trends and new ideas.',
          tasks: [task('Find 5 competitors and note their prices', inDays(3)), task('Write 3 questions to ask possible customers', inDays(4))],
          schedule: [job('Look for 10 trending product ideas', '09:00', 'daily')],
        }),
        building({
          name: 'Sol', place: 'Storefront', style: 'shop', color: '#ffc857', ruflo: 'analyst',
          role: 'Sales and customers. Offers, orders, leads and follow-ups.',
          tasks: [task('Decide the first offer and its price', inDays(4)), task('List 10 people to tell about the launch', inDays(7))],
        }),
        building({
          name: 'Ledger', place: 'Bank', style: 'bank', color: '#7dffb2', ruflo: 'analyst',
          role: 'Money. Revenue, costs, budget and the monthly goal.',
          tasks: [task('List every startup cost', inDays(3)), task('Open a separate bank account for the business', inDays(10))],
        }),
        building({
          name: 'Cog', place: 'Depot', style: 'depot', color: '#ff9f5a', ruflo: 'optimizer',
          role: 'Operations. Tools, accounts, admin and paperwork.',
          tasks: [task('List the apps and accounts the business will use', inDays(5)), task('Check what registration or permits your area needs', inDays(9))],
        }),
        creaseCam(),
        building({
          name: 'Meeting Hall', place: 'Town square', style: 'hall', color: '#2dd4bf', ruflo: 'coordinator', hall: true,
          role: 'Weekly review. The whole crew meets here on Fridays.',
        }),
      ],
    };
  }

  // Fill in anything missing so imported or older data never breaks the page.
  function normalize(s) {
    const base = starter();
    if (!s || typeof s !== 'object' || !Array.isArray(s.buildings)) return base;
    return applySeeds(clean(s, base));
  }
  function clean(s, base) {
    const cleanList = (arr, fields) => (Array.isArray(arr) ? arr : []).filter((x) => x && typeof x === 'object').map((x) => {
      const out = { id: typeof x.id === 'string' ? x.id : uid() };
      for (const [k, def] of Object.entries(fields)) out[k] = typeof x[k] === typeof def ? x[k] : def;
      return out;
    });
    return {
      v: 1,
      starter: !!s.starter,
      owner: typeof s.owner === 'string' ? s.owner : base.owner,
      business: typeof s.business === 'string' ? s.business : base.business,
      goal: {
        label: s.goal && typeof s.goal.label === 'string' ? s.goal.label : base.goal.label,
        target: s.goal && Number.isFinite(+s.goal.target) ? +s.goal.target : base.goal.target,
        current: s.goal && Number.isFinite(+s.goal.current) ? +s.goal.current : 0,
      },
      brief: {
        time: s.brief && /^\d{2}:\d{2}$/.test(s.brief.time) ? s.brief.time : base.brief.time,
        lastSeen: s.brief && typeof s.brief.lastSeen === 'string' ? s.brief.lastSeen : '',
      },
      updatedAt: Number.isFinite(+s.updatedAt) ? +s.updatedAt : 0,
      seeded: Array.isArray(s.seeded) ? s.seeded.filter((x) => typeof x === 'string') : [],
      buildings: s.buildings.filter((b) => b && typeof b === 'object').map((b) => building({
        ...b,
        tasks: cleanList(b.tasks, { title: '', due: '', done: false, doneAt: '', from: '' }),
        links: cleanList(b.links, { title: '', url: '' }),
        schedule: cleanList(b.schedule, { title: '', time: '09:00', repeat: 'daily' }),
        chat: (Array.isArray(b.chat) ? b.chat : []).filter((m) => m && typeof m.text === 'string').map((m) => ({ role: m.role === 'me' ? 'me' : 'agent', text: m.text, at: m.at || 0 })),
      })),
    };
  }

  /* ---------- saving ---------- */
  let state = null;
  let ref = null;
  let cloudWritable = true;
  let timer = 0;
  let writing = false;
  let again = false;
  let status = 'starter';
  let onRemote = () => {};
  let onStatus = () => {};

  const setStatus = (s) => { status = s; onStatus(s); };
  const clone = (x) => JSON.parse(JSON.stringify(x));

  function readLocal() {
    try { const raw = localStorage.getItem(LS_KEY); return raw ? normalize(JSON.parse(raw)) : null; } catch (e) { return null; }
  }
  function writeLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
  }

  async function connectCloud() {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    let db = null;
    try { db = await window.claude.use('db'); } catch (e) { db = null; }
    if (!db) return;
    try { ref = db.doc(DOC_PATH); } catch (e) { ref = null; return; }
    ref.onSnapshot((snap) => {
      if (snap.exists) {
        const remote = normalize(clone(snap.data()));
        if ((remote.updatedAt || 0) > (state.updatedAt || 0)) {
          state = remote;
          writeLocal();
          onRemote(state);
        }
      }
      if (status !== 'saving') setStatus(state.starter ? 'starter-cloud' : 'cloud');
    }, () => { ref = null; setStatus(state.starter ? 'starter' : 'local'); });
  }

  async function flush() {
    timer = 0;
    const localOk = writeLocal();
    if (!ref || !cloudWritable) { setStatus(localOk ? 'local' : 'unsaved'); return; }
    if (writing) { again = true; return; }
    writing = true;
    setStatus('saving');
    try {
      await ref.set(clone(state));
      setStatus('cloud');
    } catch (e) {
      if (e && e.code === 'invalid_argument') cloudWritable = false; // this viewer may not write the owner's city
      setStatus(localOk ? (cloudWritable ? 'local' : 'device') : 'unsaved');
    } finally {
      writing = false;
      if (again) { again = false; flush(); }
    }
  }

  function trimForSize() {
    // A db document holds at most 256 KiB; long chats are the only thing that can grow without limit.
    let size = JSON.stringify(state).length;
    let keep = MAX_CHAT;
    while (size > 200000 && keep > 4) {
      keep = Math.floor(keep / 2);
      state.buildings.forEach((b) => { b.chat = b.chat.slice(-keep); });
      size = JSON.stringify(state).length;
    }
  }

  PC.util = { uid, isoDate, inDays, clone, COLORS, STYLES, RUFLO_TYPES, REPEATS, task, link, job };

  PC.store = {
    init(remoteCb, statusCb) {
      onRemote = remoteCb || onRemote;
      onStatus = statusCb || onStatus;
      const saved = readLocal();
      state = saved || starter();
      setStatus(saved && !saved.starter ? 'local' : 'starter');
      connectCloud();
      return state;
    },
    get: () => state,
    status: () => status,
    newBuilding: (o) => building(o),
    starter,
    normalize,
    // Every change goes through here: mutate, stamp, save soon.
    commit(mutate) {
      mutate(state);
      state.starter = false;
      state.updatedAt = Date.now();
      state.buildings.forEach((b) => { if (b.chat.length > MAX_CHAT) b.chat = b.chat.slice(-MAX_CHAT); });
      trimForSize();
      clearTimeout(timer);
      timer = setTimeout(flush, 700);
    },
    replace(next) {
      const updatedAt = Date.now();
      state = normalize(next);
      state.starter = false;
      state.updatedAt = updatedAt;
      clearTimeout(timer);
      flush();
      return state;
    },
    saveNow() { if (timer) { clearTimeout(timer); flush(); } },
  };
})();
