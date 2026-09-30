/* Platform Center: the crew's voice.
 * On claude.ai the page may use the `sample` capability, so each building's
 * crew member answers live through the viewer's own claude.ai account and can change
 * the city through a few page tools. Anywhere else a small offline helper
 * understands simple orders ("add ...", "delegate ... to Atlas", "plan my day").
 */
(function () {
  'use strict';
  const PC = (window.PC = window.PC || {});
  const { isoDate, task: newTask, job: newJob, REPEATS } = PC.util;

  let sample = null;
  let tools = false;
  let ready = false;
  const listeners = [];
  const notify = () => listeners.forEach((fn) => fn(ready));

  async function init() {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    try { sample = await window.claude.use('sample'); } catch (e) { sample = null; }
    if (!sample) return;
    ready = true;
    try { const lim = await sample.limits(); tools = !!(lim && lim.tools); } catch (e) { tools = false; }
    notify();
  }

  const byName = (s, name) => s.buildings.find((b) => b.name.toLowerCase() === String(name || '').trim().toLowerCase()) || null;
  const leadOf = (s) => s.buildings.find((b) => b.lead) || s.buildings[0];
  const today = () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  function cityJSON(s, focus) {
    return JSON.stringify({
      today: `${isoDate()} (${new Date().toLocaleDateString(undefined, { weekday: 'long' })})`,
      business: s.business,
      owner: s.owner,
      goal: s.goal,
      buildings: s.buildings.map((b) => ({
        name: b.name,
        place: b.place,
        role: b.role,
        status: b.status,
        job: b.job || undefined,
        open_tasks: b.tasks.filter((t) => !t.done).slice(0, 12).map((t) => ({ id: t.id, title: t.title, due: t.due || undefined, from: t.from || undefined })),
        done_last_7_days: b.tasks.filter((t) => t.done && t.doneAt && Date.now() - t.doneAt < 7 * 864e5).map((t) => t.title).slice(0, 8),
        schedule: b.schedule.map((j) => `${j.title} at ${j.time}, ${REPEATS[j.repeat] || j.repeat}`),
        notes: b === focus ? b.notes.slice(0, 1500) || undefined : undefined,
        links: b === focus ? b.links.map((l) => l.title) : undefined,
      })),
    });
  }

  function rules(s, b) {
    const lead = leadOf(s);
    return [
      `You are ${b.name}, the crew member who runs the ${b.place} in ${s.owner}'s Platform Center: a city-shaped command center for a new business called "${s.business}". Each building is one area of the business with one AI crew member.`,
      `Your area: ${b.role}`,
      b.lead
        ? 'You are the manager. You plan the day, hand out work to the other buildings, run the Friday retro and chair standups in the Meeting Hall.'
        : `The manager is ${lead.name}. You mainly handle your own area, and you can suggest work for other buildings.`,
      'Talk like a friendly, practical teammate. Keep replies short: under 120 words, plain text, "-" lists are fine, no headings or tables. The business is just starting, so keep advice concrete and doable today.',
      tools
        ? `You can change the city with your tools (add_task, complete_task, add_schedule, set_status). Use them when ${s.owner} asks for a change or clearly agrees to one. After using a tool, say in one line what you changed.`
        : `You cannot change the city yourself here, so tell ${s.owner} exactly what to add and where.`,
      `The city right now (JSON): ${cityJSON(s, b)}`,
    ].join('\n\n');
  }

  function cityTools(speaker, log) {
    const find = (name) => {
      const b = byName(PC.store.get(), name);
      if (!b) throw new Error(`No building named "${name}". Use a name from the city JSON.`);
      return b;
    };
    return [
      {
        name: 'add_task',
        description: 'Add a task to one building. Use the building name exactly as it appears in the city JSON. Returns the new task id.',
        inputSchema: { type: 'object', properties: { building: { type: 'string' }, title: { type: 'string' }, due: { type: 'string', description: 'Optional due date, YYYY-MM-DD' } }, required: ['building', 'title'] },
        execute(input) {
          const target = find(input.building);
          const title = String(input.title || '').trim().slice(0, 200);
          if (!title) throw new Error('The task title is empty.');
          const due = /^\d{4}-\d{2}-\d{2}$/.test(String(input.due || '')) ? String(input.due) : '';
          const t = newTask(title, due, target.id === speaker.id ? '' : speaker.name);
          PC.app.change((s) => { s.buildings.find((b) => b.id === target.id).tasks.push(t); });
          log(`Added “${title}” to ${target.name}`);
          return { ok: true, task_id: t.id };
        },
      },
      {
        name: 'complete_task',
        description: 'Mark a task done by its id from the city JSON. Returns ok.',
        inputSchema: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'] },
        execute(input) {
          const id = String(input.task_id || '');
          let title = '';
          PC.app.change((s) => s.buildings.forEach((b) => b.tasks.forEach((t) => { if (t.id === id) { t.done = true; t.doneAt = Date.now(); title = t.title; } })));
          if (!title) throw new Error('No open task with that id.');
          log(`Finished “${title}”`);
          return { ok: true };
        },
      },
      {
        name: 'add_schedule',
        description: 'Add a repeating job to a building’s schedule, like a daily research scan. Returns ok.',
        inputSchema: {
          type: 'object',
          properties: { building: { type: 'string' }, title: { type: 'string' }, time: { type: 'string', description: '24-hour HH:MM' }, repeat: { type: 'string', enum: Object.keys(REPEATS) } },
          required: ['building', 'title', 'time', 'repeat'],
        },
        execute(input) {
          const target = find(input.building);
          const title = String(input.title || '').trim().slice(0, 160);
          const time = /^\d{2}:\d{2}$/.test(String(input.time)) ? String(input.time) : '09:00';
          const repeat = REPEATS[input.repeat] ? input.repeat : 'daily';
          if (!title) throw new Error('The job title is empty.');
          PC.app.change((s) => { s.buildings.find((b) => b.id === target.id).schedule.push(newJob(title, time, repeat)); });
          log(`Scheduled “${title}” for ${target.name}`);
          return { ok: true };
        },
      },
      {
        name: 'set_status',
        description: 'Set a building’s status (idle, working or stuck) and optionally what it is working on. Returns ok.',
        inputSchema: { type: 'object', properties: { building: { type: 'string' }, status: { type: 'string', enum: ['idle', 'working', 'stuck'] }, job: { type: 'string' } }, required: ['building', 'status'] },
        execute(input) {
          const target = find(input.building);
          const status = ['idle', 'working', 'stuck'].includes(input.status) ? input.status : 'idle';
          PC.app.change((s) => {
            const b = s.buildings.find((x) => x.id === target.id);
            b.status = status;
            if (typeof input.job === 'string') b.job = input.job.slice(0, 80);
          });
          log(`${target.name} is now ${status}`);
          return { ok: true };
        },
      },
    ];
  }

  function errorText(e) {
    const code = e && e.code;
    if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) {
      ready = false; notify();
      return 'AI answers are off for this page, so I’m back to simple orders. Type help to see them.';
    }
    if (code === 'tools_unavailable') { tools = false; return 'I can’t change the city from here. Ask again and I’ll just answer.'; }
    if (code === 'rate_limited') return 'Too many requests right now. Try again in a minute.';
    if (code === 'session_expired') return 'Your claude.ai sign-in expired. Sign in again, then retry.';
    if (code === 'refused') return 'I can’t help with that one. Try asking another way.';
    if (code === 'prompt_too_large') return 'That was too much to send at once. Clear this chat and try again.';
    return 'I couldn’t get an answer just now. Try again.';
  }

  function chat(b, { onText, signal, onLog }) {
    const s = PC.store.get();
    const turns = [{ role: 'user', content: rules(s, b) }].concat(
      b.chat.slice(-11).map((m) => ({ role: m.role === 'me' ? 'user' : 'assistant', content: m.text })));
    const opts = { onText, signal, modelTier: 'quick' };
    if (tools) opts.tools = cityTools(b, onLog || (() => {}));
    else opts.cache = false;
    return sample(turns, opts);
  }

  function brief({ onText, signal }) {
    const s = PC.store.get();
    const lead = leadOf(s);
    const prompt = [
      `You are ${lead.name}, the manager of ${s.owner}'s Platform Center for a new business called "${s.business}". Today is ${today()}.`,
      `Write ${s.owner}'s morning brief from the city below. Plain text, under 160 words. Use exactly these three labels, each on its own line and followed by "-" bullets: Focus today, Heads-up, One move for the goal.`,
      `The city (JSON): ${cityJSON(s, lead)}`,
    ].join('\n\n');
    return sample(prompt, { onText, signal, modelTier: 'default' });
  }

  function meeting(kind, { onText, signal }) {
    const s = PC.store.get();
    const lead = leadOf(s);
    const ask = kind === 'retro'
      ? 'Run a short Friday retro for the week: what went well, what got stuck, and the top 3 priorities for next week, naming the building for each.'
      : 'Chair a quick standup: one line per building (skip the Meeting Hall) with what it finished recently, what it does today, and anything blocking it.';
    const prompt = [
      `You are ${lead.name}, the manager of ${s.owner}'s Platform Center for a new business called "${s.business}". Today is ${today()}.`,
      `${ask} Plain text, under 180 words, "-" bullets.`,
      `The city (JSON): ${cityJSON(s, lead)}`,
    ].join('\n\n');
    return sample(prompt, { onText, signal, modelTier: 'default' });
  }

  /* ---------- offline helper ---------- */
  const HELP = [
    'Here is what I understand without AI:',
    '- add <task>  (add it to my list)',
    '- add <task> to <building>',
    '- delegate <task> to <building>',
    '- done <number>  (finish that task in my list)',
    '- plan my day',
    '- brief  (open the morning brief)',
    'Open Platform Center on claude.ai to talk with me for real.',
  ].join('\n');

  function planText(s) {
    const open = [];
    s.buildings.forEach((b) => b.tasks.forEach((t) => { if (!t.done) open.push({ b, t }); }));
    open.sort((a, c) => (a.t.due || '9999') < (c.t.due || '9999') ? -1 : 1);
    const top = open.slice(0, 5);
    if (!top.length) return 'Nothing is waiting. Add a task to any building and I will line it up.';
    const lines = top.map(({ b, t }) => {
      const d = PC.ui.dueInfo(t.due);
      return `- ${b.name}: ${t.title}${d ? ` (${d.text.toLowerCase()})` : ''}`;
    });
    const jobs = [];
    s.buildings.forEach((b) => b.schedule.forEach((j) => { if (PC.ui.runsOn(j)) jobs.push(`- ${PC.ui.fmtTime(j.time)} ${b.name}: ${j.title}`); }));
    return ['Here is the plan for today:', ...lines].concat(jobs.length ? ['', 'Scheduled today:', ...jobs] : []).join('\n');
  }

  function offline(b, text) {
    const s = PC.store.get();
    const t = text.trim();
    const low = t.toLowerCase();
    let m;
    if (/^(help|\?|commands?)$/.test(low)) return { text: HELP };
    if (/^(open (the )?)?(morning )?brief$/.test(low)) return { text: 'Opening the morning brief.', action: 'brief' };
    if (/^what should i do next\??$/.test(low)) {
      const next = b.tasks.filter((x) => !x.done).sort((a, c) => (a.due || '9999') < (c.due || '9999') ? -1 : 1)[0];
      return { text: next ? `Next up for ${b.name}: ${next.title}. Tick it off in Tasks when it is done.` : 'Nothing on my list. Add a task and I will keep it lined up.' };
    }
    if (/^(plan( my| the)? day|status|what'?s up|overview)/.test(low)) return { text: planText(s) };
    if ((m = t.match(/^done\s+(\d+)$/i))) {
      const open = b.tasks.filter((x) => !x.done);
      const hit = open[Number(m[1]) - 1];
      if (!hit) return { text: `I only have ${open.length} open task${open.length === 1 ? '' : 's'}. Check the Tasks tab for the numbers.` };
      PC.app.change((st) => { const k = st.buildings.find((x) => x.id === b.id).tasks.find((x) => x.id === hit.id); k.done = true; k.doneAt = Date.now(); });
      return { text: `Done: “${hit.title}”. Nice.` };
    }
    if ((m = t.match(/^(?:delegate|send|ask)\s+(.+?)\s+to\s+(.+)$/i)) || (m = t.match(/^(?:add|todo|task)\s+(.+?)\s+(?:to|for)\s+(.+)$/i))) {
      const target = byName(s, m[2]);
      if (target) {
        const k = newTask(m[1].trim().slice(0, 200), '', target.id === b.id ? '' : b.name);
        PC.app.change((st) => { st.buildings.find((x) => x.id === target.id).tasks.push(k); });
        return { text: target.id === b.id ? `Added “${k.title}” to my list.` : `Sent “${k.title}” to ${target.name}.` };
      }
    }
    if ((m = t.match(/^(?:add|todo|task)\s+(.+)$/i))) {
      const k = newTask(m[1].trim().slice(0, 200));
      PC.app.change((st) => { st.buildings.find((x) => x.id === b.id).tasks.push(k); });
      return { text: `Added “${k.title}” to my list.` };
    }
    return { text: `I’m running without AI here, so I only follow simple orders.\n\n${HELP}` };
  }

  function greeting(s, b) {
    if (b.hall) return `The Meeting Hall is where the crew gets together. Ask me to chair a standup or run the Friday retro.`;
    if (b.lead) return ready
      ? `Hey ${s.owner}. ${b.name} here, ready when you are. I can:\n- plan the day\n- delegate a job to another building\n- run a Friday retro\n- chair a standup\nJust say the word.`
      : `Hey ${s.owner}. ${b.name} here. I can:\n- plan the day\n- delegate a job to another building\n- open the morning brief\nType help to see how to ask.`;
    return `Hi ${s.owner}, ${b.name} here from the ${b.place}. I look after this: ${b.role}\nWhat should I work on?`;
  }

  function quickPrompts(b) {
    if (b.hall) return ['Chair a standup', 'Run a Friday retro'];
    if (!ready) return b.lead ? ['Plan my day', 'Delegate a job', 'Open the brief'] : ['What should I do next?', 'Plan my day', 'Help'];
    if (b.lead) return ['Plan my day', 'Delegate a job', 'Run a Friday retro', 'Chair a standup'];
    return ['What should I do next?', 'Break my top task into steps', 'Give me 3 ideas'];
  }

  PC.ai = {
    init,
    available: () => ready,
    canUseTools: () => ready && tools,
    onChange: (fn) => listeners.push(fn),
    chat, brief, meeting, offline, planText, greeting, quickPrompts, errorText,
  };
})();
