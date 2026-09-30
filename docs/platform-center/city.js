/* Platform Center: the isometric neon city, drawn on a <canvas>.
 * The manager (lead) building stands at the back like an HQ tower, a plaza
 * sits in the middle, and every other building fills the rings around it.
 * Dashed lines run from each beacon to the manager; they flow while the
 * manager has work handed out to that building.
 */
(function () {
  'use strict';
  const PC = (window.PC = window.PC || {});

  const HEIGHT = { tower: 1.75, office: 0.95, studio: 0.7, lab: 0.75, shop: 0.55, bank: 0.85, depot: 0.5, hall: 0.55, house: 0.5 };
  const FOOT = { tower: 0.2, office: 0.25, studio: 0.27, lab: 0.25, shop: 0.29, bank: 0.28, depot: 0.31, hall: 0.3, house: 0.24 };
  const STATUS_COLOR = { working: '#7dffb2', idle: '#9aa3ff', stuck: '#ff5c7a' };

  let canvas, ctx, getState, onPick;
  let W = 0, H = 0, dpr = 1, u = 50, ox = 0, oy = 0;
  let hits = [];
  let hoverId = null, selectedId = null;
  let raf = 0, last = 0, stars = [];
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  /* ---------- small helpers ---------- */
  const P = (x, y, z = 0) => [ox + (x - y) * u, oy + (x + y) * u * 0.5 - z * u];
  function rgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
  function mix(a, b, t) {
    const A = rgb(a), B = rgb(b);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
  }
  function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function poly(pts, fill, stroke, lw = 1) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }

  /* ---------- layout: which block each building stands on ---------- */
  function ring(r) {
    const out = [];
    for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) if (Math.max(Math.abs(x), Math.abs(y)) === r) out.push([x, y]);
    // front-facing blocks first so a small city looks balanced
    return out.sort((a, b) => (b[0] + b[1]) - (a[0] + a[1]) || a[0] - b[0]);
  }
  function layout(buildings) {
    const lead = buildings.find((b) => b.lead) || buildings[0];
    const free = [];
    for (let r = 1; free.length < buildings.length; r++) free.push(...ring(r));
    const backIdx = free.findIndex(([x, y]) => x === -1 && y === -1);
    const leadSlot = free.splice(backIdx, 1)[0];
    const placed = [];
    let i = 0;
    buildings.forEach((b) => {
      const [x, y] = b === lead ? leadSlot : free[i++];
      placed.push({ b, x, y, h: HEIGHT[b.style] || 0.8, f: FOOT[b.style] || 0.25 });
    });
    const R = Math.max(1, ...placed.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))));
    return { placed, R, lead };
  }
  const beaconZ = (p) => p.h + (p.b.lead ? 0.75 : 0.5);

  function fit(placed, R) {
    const e = R + 0.85;
    const pts = [[-e, -e, 0], [e, -e, 0], [e, e, 0], [-e, e, 0]];
    placed.forEach((p) => pts.push([p.x, p.y, beaconZ(p) + 0.35]));
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(([x, y, z]) => {
      const sx = x - y, sy = (x + y) * 0.5 - z;
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    });
    const padTop = 44, padBottom = 14;
    u = Math.min((W * 0.94) / (maxX - minX), (H - padTop - padBottom) / (maxY - minY), 150);
    ox = W / 2 - ((minX + maxX) / 2) * u;
    oy = padTop - minY * u + ((H - padTop - padBottom) - (maxY - minY) * u) / 2;
  }

  /* ---------- scenery ---------- */
  function sky(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#07062a');
    g.addColorStop(0.45, '#1a1375');
    g.addColorStop(0.8, '#4b169a');
    g.addColorStop(1, '#b01f93');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    stars.forEach((s) => {
      const a = motion.matches ? s.a : s.a * (0.6 + 0.4 * Math.sin(t / 900 + s.p));
      ctx.fillStyle = `rgba(210,220,255,${a})`;
      ctx.fillRect(s.x * W, s.y * H * 0.5, s.r, s.r);
    });
  }

  function ground(R, t) {
    const e = R + 0.85;
    const glow = ctx.createLinearGradient(0, P(-e, -e)[1], 0, P(e, e)[1]);
    glow.addColorStop(0, '#15136a');
    glow.addColorStop(1, '#2a1a9a');
    poly([P(-e, -e), P(e, -e), P(e, e), P(-e, e)], glow, 'rgba(140,130,255,0.45)', 1.5);
    // road grid between blocks
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(94,231,255,0.18)';
    for (let k = -R - 1; k <= R; k++) {
      const c = k + 0.5;
      ctx.beginPath(); ctx.moveTo(...P(c, -e)); ctx.lineTo(...P(c, e)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(...P(-e, c)); ctx.lineTo(...P(e, c)); ctx.stroke();
    }
    ctx.restore();
    // a few cars gliding along the roads
    for (let i = 0; i < 6; i++) {
      const lane = (Math.floor(hash(i + 3) * (2 * R + 2)) - R - 1) + 0.5;
      const speed = 0.00005 + hash(i) * 0.00006;
      const s = motion.matches ? hash(i + 9) : ((t * speed + hash(i + 5)) % 1);
      const pos = -e + s * 2 * e;
      const [cx, cy] = i % 2 ? P(lane, pos, 0.02) : P(pos, lane, 0.02);
      ctx.fillStyle = i % 3 ? 'rgba(255,200,87,0.9)' : 'rgba(255,122,217,0.9)';
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.5, u * 0.03), 0, Math.PI * 2); ctx.fill();
    }
  }

  function plot(x, y, color, active) {
    const s = 0.4, z = 0.05;
    poly([P(x - s, y + s, 0), P(x + s, y + s, 0), P(x + s, y + s, z), P(x - s, y + s, z)], '#1a1d78');
    poly([P(x + s, y + s, 0), P(x + s, y - s, 0), P(x + s, y - s, z), P(x + s, y + s, z)], '#12145a');
    ctx.save();
    if (active) { ctx.shadowColor = color; ctx.shadowBlur = 16; }
    poly([P(x - s, y - s, z), P(x + s, y - s, z), P(x + s, y + s, z), P(x - s, y + s, z)], '#232a96', rgba(color, active ? 0.95 : 0.3), active ? 2 : 1);
    ctx.restore();
  }

  function tree(x, y) {
    const [tx, ty] = P(x, y, 0.05);
    const r = Math.max(2.5, u * 0.06);
    ctx.fillStyle = '#0e5f4f';
    ctx.fillRect(tx - 1, ty - r * 0.6, 2, r * 0.8);
    ctx.fillStyle = '#1fb58a';
    ctx.beginPath(); ctx.arc(tx, ty - r * 1.2, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(125,255,178,0.35)';
    ctx.beginPath(); ctx.arc(tx - r * 0.3, ty - r * 1.45, r * 0.45, 0, Math.PI * 2); ctx.fill();
  }

  function plaza(t) {
    plot(0, 0, '#5ee7ff', false);
    const [cx, cy] = P(0, 0, 0.06);
    const rx = u * 0.42, ry = u * 0.21;
    ctx.fillStyle = '#10307a';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    const pulse = motion.matches ? 0.5 : 0.5 + 0.5 * Math.sin(t / 700);
    ctx.fillStyle = `rgba(94,231,255,${0.25 + pulse * 0.25})`;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.7, ry * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(220,250,255,0.85)';
    ctx.fillRect(cx - 1.5, cy - u * 0.28, 3, u * 0.28);
    [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].forEach(([dx, dy]) => tree(dx, dy));
  }

  /* ---------- buildings ---------- */
  function faceQuad(side, x, y, f, u0, u1, z0, z1) {
    if (side === 'L') return [P(x - f + 2 * f * u0, y + f, z0), P(x - f + 2 * f * u1, y + f, z0), P(x - f + 2 * f * u1, y + f, z1), P(x - f + 2 * f * u0, y + f, z1)];
    return [P(x + f, y + f - 2 * f * u0, z0), P(x + f, y + f - 2 * f * u1, z0), P(x + f, y + f - 2 * f * u1, z1), P(x + f, y + f - 2 * f * u0, z1)];
  }

  function box(x, y, f, z0, z1, color, edgeAlpha = 0.85) {
    poly([P(x - f, y + f, z0), P(x + f, y + f, z0), P(x + f, y + f, z1), P(x - f, y + f, z1)], mix('#1b2590', color, 0.16), rgba(color, edgeAlpha * 0.6));
    poly([P(x + f, y + f, z0), P(x + f, y - f, z0), P(x + f, y - f, z1), P(x + f, y + f, z1)], mix('#10175f', color, 0.1), rgba(color, edgeAlpha * 0.6));
    poly([P(x - f, y - f, z1), P(x + f, y - f, z1), P(x + f, y + f, z1), P(x - f, y + f, z1)], mix('#2b3cb0', color, 0.28), rgba(color, edgeAlpha), 1.2);
  }

  function windows(p, idx, t, z0, z1, f) {
    const { x, y, b } = p;
    const rows = Math.max(1, Math.floor((z1 - z0) / 0.17));
    const cols = 3;
    const lit = b.status === 'working' ? 0.75 : b.status === 'stuck' ? 0.5 : 0.35;
    const bucket = motion.matches ? 0 : Math.floor(t / 2600);
    ['L', 'R'].forEach((side, s) => {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const seed = idx * 97 + s * 31 + r * 7 + c;
          const on = hash(seed + (hash(seed) > 0.8 ? bucket : 0)) < lit;
          const zc = z0 + ((r + 0.5) / rows) * (z1 - z0);
          const uc = (c + 0.5) / cols;
          let fill = 'rgba(8,12,55,0.9)';
          if (on) fill = b.status === 'stuck' ? (bucket % 2 ? '#ff5c7a' : '#b8324f') : (hash(seed + 1) > 0.5 ? b.color : '#fff3c4');
          poly(faceQuad(side, x, y, f, uc - 0.11, uc + 0.11, zc - 0.035, zc + 0.035), fill);
        }
      }
    });
  }

  function extras(p, t) {
    const { x, y, h, f, b } = p;
    const c = b.color;
    switch (b.style) {
      case 'lab': {
        const [cx, cy] = P(x, y, h);
        ctx.fillStyle = rgba(c, 0.55);
        ctx.beginPath(); ctx.ellipse(cx, cy, f * u * 0.9, f * u * 0.75, 0, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = rgba(c, 0.9); ctx.stroke();
        break;
      }
      case 'shop':
        poly(faceQuad('L', x, y, f * 1.08, 0.02, 0.98, h * 0.55, h * 0.72), rgba(c, 0.9));
        poly(faceQuad('R', x, y, f * 1.08, 0.02, 0.98, h * 0.55, h * 0.72), rgba(c, 0.7));
        break;
      case 'studio':
        poly(faceQuad('L', x, y, f, 0.12, 0.88, h * 0.25, h * 0.8), rgba(c, 0.55), rgba(c, 0.95));
        break;
      case 'depot':
        [0.2, 0.62].forEach((u0) => poly(faceQuad('R', x, y, f, u0, u0 + 0.26, 0, h * 0.62), '#0b0f45', rgba(c, 0.7)));
        break;
      case 'hall': {
        const r = h + 0.28;
        poly([P(x - f, y + f, h), P(x + f, y + f, h), P(x + f, y, r), P(x - f, y, r)], mix('#2b3cb0', c, 0.35), rgba(c, 0.8));
        poly([P(x + f, y + f, h), P(x + f, y - f, h), P(x + f, y, r)], mix('#10175f', c, 0.2), rgba(c, 0.8));
        break;
      }
      case 'bank':
        box(x, y, f * 1.12, h, h + 0.06, c);
        break;
      case 'office':
        box(x + f * 0.35, y - f * 0.3, f * 0.3, h, h + 0.12, c, 0.5);
        break;
      case 'tower': {
        const [cx, cy] = P(x, y, h + 0.38);
        const s = u * 0.16, bob = motion.matches ? 0 : Math.sin(t / 800) * u * 0.02;
        ctx.save();
        ctx.shadowColor = c; ctx.shadowBlur = 22;
        poly([[cx, cy - s * 1.3 + bob], [cx + s, cy + bob], [cx, cy + s * 1.1 + bob], [cx - s, cy + bob]], rgba(c, 0.85), '#e9fbff', 1.2);
        ctx.restore();
        break;
      }
      default: break;
    }
  }

  function drawBuilding(p, idx, t) {
    const { x, y, h, f, b } = p;
    const active = b.id === hoverId || b.id === selectedId;
    plot(x, y, b.color, active);
    tree(x - 0.33, y - 0.33); tree(x + 0.33, y - 0.33); tree(x - 0.33, y + 0.33);
    ctx.save();
    if (active) { ctx.shadowColor = b.color; ctx.shadowBlur = 18; }
    if (b.style === 'tower') {
      box(x, y, 0.27, 0.05, 0.38, b.color);
      box(x, y, f, 0.38, h, b.color);
    } else {
      box(x, y, f, 0.05, h, b.color);
    }
    ctx.restore();
    windows(p, idx, t, b.style === 'tower' ? 0.42 : 0.1, h - 0.06, f);
    extras(p, t);
  }

  function beacon(p, t) {
    const { x, y, h, b } = p;
    const top = P(x, y, beaconZ(p));
    const base = P(x, y, h + (b.style === 'hall' ? 0.28 : 0.04));
    ctx.strokeStyle = rgba(b.color, 0.75); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(...base); ctx.lineTo(...top); ctx.stroke();
    const sc = STATUS_COLOR[b.status] || STATUS_COLOR.idle;
    const beat = motion.matches ? 0.6 : 0.5 + 0.5 * Math.sin(t / (b.status === 'stuck' ? 250 : 600) + x * 2 + y);
    const r = (b.status === 'working' ? 6 : 4.5) + beat * 3;
    const g = ctx.createRadialGradient(top[0], top[1], 0, top[0], top[1], r * 3);
    g.addColorStop(0, rgba(b.status === 'idle' ? b.color : sc, 0.9));
    g.addColorStop(1, rgba(b.status === 'idle' ? b.color : sc, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(top[0], top[1], r * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(top[0], top[1], 2.4, 0, Math.PI * 2); ctx.fill();
    return top;
  }

  function wires(placed, lead, tops, t) {
    const lt = tops.get(lead.id);
    if (!lt) return;
    placed.forEach((p) => {
      if (p.b === lead) return;
      const bt = tops.get(p.b.id);
      const delegated = p.b.tasks.some((k) => !k.done && k.from && k.from === lead.name);
      ctx.save();
      ctx.setLineDash([5, 6]);
      ctx.lineDashOffset = delegated && !motion.matches ? -t / 40 : 0;
      ctx.strokeStyle = delegated ? rgba(p.b.color, 0.9) : 'rgba(220,230,255,0.35)';
      ctx.lineWidth = delegated ? 1.8 : 1.1;
      ctx.beginPath();
      ctx.moveTo(lt[0], lt[1]);
      const mx = (lt[0] + bt[0]) / 2, my = Math.min(lt[1], bt[1]) - u * 0.35;
      ctx.quadraticCurveTo(mx, my, bt[0], bt[1]);
      ctx.stroke();
      ctx.restore();
    });
  }

  function label(p, top) {
    const b = p.b;
    const fs = Math.round(Math.min(15, Math.max(11, u * 0.2)));
    const sub = b.job ? `on: ${b.job}` : b.place;
    ctx.save();
    ctx.font = `600 ${fs}px "Chakra Petch", "Trebuchet MS", sans-serif`;
    const nameW = ctx.measureText(b.name).width;
    ctx.font = `500 ${fs - 3}px Manrope, "Segoe UI", sans-serif`;
    const subText = sub.length > 26 ? sub.slice(0, 25) + '…' : sub;
    const subW = ctx.measureText(subText).width;
    const w = Math.max(nameW + 14, subW);
    const lx = top[0] - w / 2, ly = top[1] - fs * 2.3;
    ctx.shadowColor = 'rgba(0,0,20,0.8)'; ctx.shadowBlur = 6;
    ctx.fillStyle = STATUS_COLOR[b.status] || STATUS_COLOR.idle;
    ctx.beginPath(); ctx.arc(lx + 4, ly + fs * 0.5, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.font = `600 ${fs}px "Chakra Petch", "Trebuchet MS", sans-serif`;
    ctx.fillStyle = '#f2f4ff'; ctx.textBaseline = 'middle';
    ctx.fillText(b.name, lx + 12, ly + fs * 0.5);
    ctx.shadowBlur = 0;
    ctx.fillStyle = rgba(b.color, 0.9);
    ctx.fillRect(lx + 12, ly + fs * 1.05, Math.min(nameW, 40), 2);
    ctx.font = `500 ${fs - 3}px Manrope, "Segoe UI", sans-serif`;
    ctx.fillStyle = 'rgba(200,206,255,0.85)';
    ctx.fillText(subText, lx + 12, ly + fs * 1.6);
    ctx.restore();
    return [lx - 4, ly - 4, lx + w + 14, ly + fs * 2.1];
  }

  /* ---------- frame ---------- */
  function draw(t) {
    if (!ctx || !W || !H) return;
    const s = getState();
    const { placed, R, lead } = layout(s.buildings);
    fit(placed, R);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sky(t);
    ground(R, t);
    const order = placed.map((p, i) => ({ p, i })).concat([{ plaza: true, x: 0, y: 0 }])
      .sort((a, b) => ((a.plaza ? 0 : a.p.x + a.p.y) - (b.plaza ? 0 : b.p.x + b.p.y)) || ((a.plaza ? 0 : a.p.x) - (b.plaza ? 0 : b.p.x)));
    order.forEach((o) => (o.plaza ? plaza(t) : drawBuilding(o.p, o.i, t)));
    const tops = new Map();
    order.forEach((o) => { if (!o.plaza) tops.set(o.p.b.id, beacon(o.p, t)); });
    if (lead) wires(placed, lead, tops, t);
    hits = [];
    order.forEach((o) => {
      if (o.plaza) return;
      const p = o.p;
      const rect = label(p, tops.get(p.b.id));
      const foot = [P(p.x - 0.4, p.y - 0.4), P(p.x + 0.4, p.y - 0.4), P(p.x + 0.4, p.y + 0.4), P(p.x - 0.4, p.y + 0.4)];
      const xs = foot.map((q) => q[0]), ys = foot.map((q) => q[1]);
      hits.push({ id: p.b.id, depth: p.x + p.y, body: [Math.min(...xs), tops.get(p.b.id)[1], Math.max(...xs), Math.max(...ys)], rect });
    });
  }

  function loop(t) {
    raf = requestAnimationFrame(loop);
    if (t - last < 33) return; // ~30 fps is plenty
    last = t;
    draw(t);
  }

  function start() {
    cancelAnimationFrame(raf);
    if (motion.matches || document.hidden) { draw(performance.now()); return; }
    raf = requestAnimationFrame(loop);
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    draw(performance.now());
  }

  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    const inside = (b) => mx >= b[0] && mx <= b[2] && my >= b[1] && my <= b[3];
    const byLabel = hits.filter((h) => inside(h.rect));
    if (byLabel.length) return byLabel.sort((a, b) => b.depth - a.depth)[0].id;
    const byBody = hits.filter((h) => inside(h.body));
    return byBody.length ? byBody.sort((a, b) => b.depth - a.depth)[0].id : null;
  }

  PC.city = {
    mount(el, opts) {
      canvas = el; ctx = el.getContext('2d');
      getState = opts.getState; onPick = opts.onPick;
      stars = Array.from({ length: 70 }, (_, i) => ({ x: hash(i + 1), y: hash(i + 101), r: hash(i + 7) > 0.85 ? 2 : 1, a: 0.25 + hash(i + 3) * 0.6, p: hash(i + 11) * 6 }));
      if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
      window.addEventListener('resize', resize);
      canvas.addEventListener('pointermove', (ev) => {
        const id = pick(ev);
        if (id !== hoverId) { hoverId = id; canvas.style.cursor = id ? 'pointer' : 'default'; if (motion.matches) draw(performance.now()); }
      });
      canvas.addEventListener('pointerleave', () => { hoverId = null; if (motion.matches) draw(performance.now()); });
      canvas.addEventListener('click', (ev) => { const id = pick(ev); if (id) onPick(id); });
      document.addEventListener('visibilitychange', start);
      if (motion.addEventListener) motion.addEventListener('change', start);
      resize();
      start();
    },
    select(id) { selectedId = id; draw(performance.now()); },
    redraw() { draw(performance.now()); },
  };
})();
