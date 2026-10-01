/* Platform Center: the 3D city's geometry. Builds plain vertex arrays for
 * city3d.js from the same layout as the flat city (city.js), so every
 * building keeps its block, height and look. City units: x and y run along
 * the ground, z points up. Each vertex is 13 floats:
 *   position (3), normal (3), colour rgb + glow (4), blink (period s, dim, phase)
 * A positive blink period is an on/off blink, a negative one a soft pulse.
 */
(function () {
  'use strict';
  const PC = (window.PC = window.PC || {});
  const STRIDE = 13;
  const STILL = [0, 1, 0];
  const UP = [0, 0, 1], NONE = [0, 0, 0];
  const FACES = [[0, 1], [1, 0], [0, -1], [-1, 0]];

  let T = [], Ln = [];
  const lay = () => PC.cityLayout;
  const hex = (c) => lay().rgb(c).map((v) => v / 255);
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return A.map((v, i) => v + (B[i] - v) * t); };
  const col = (c, glow = 0) => { const v = typeof c === 'string' ? hex(c) : c; return [v[0], v[1], v[2], glow]; };
  const edge = (c, a) => col(c, a);
  const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };

  // city (x, y, z-up) -> GL (x, y-up, z)
  function vtx(arr, p, n, c, a) { arr.push(p[0], p[2], p[1], n[0], n[2], n[1], c[0], c[1], c[2], c[3], a[0], a[1], a[2]); }
  function quad(p0, p1, p2, p3, n, c, a = STILL) { [p0, p1, p2, p0, p2, p3].forEach((p) => vtx(T, p, n, c, a)); }
  function tri(p0, p1, p2, n, c, a = STILL) { [p0, p1, p2].forEach((p) => vtx(T, p, n, c, a)); }
  function seg(p, q, c) { vtx(Ln, p, NONE, c, STILL); vtx(Ln, q, NONE, c, STILL); }

  function box(x, y, fx, fy, z0, z1, side, top, ec, a = STILL) {
    const X0 = x - fx, X1 = x + fx, Y0 = y - fy, Y1 = y + fy;
    quad([X0, Y1, z0], [X1, Y1, z0], [X1, Y1, z1], [X0, Y1, z1], [0, 1, 0], side, a);
    quad([X1, Y1, z0], [X1, Y0, z0], [X1, Y0, z1], [X1, Y1, z1], [1, 0, 0], side, a);
    quad([X1, Y0, z0], [X0, Y0, z0], [X0, Y0, z1], [X1, Y0, z1], [0, -1, 0], side, a);
    quad([X0, Y0, z0], [X0, Y1, z0], [X0, Y1, z1], [X0, Y0, z1], [-1, 0, 0], side, a);
    quad([X0, Y0, z1], [X1, Y0, z1], [X1, Y1, z1], [X0, Y1, z1], UP, top || side, a);
    if (!ec) return;
    const c = [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]];
    c.forEach(([ax, ay], i) => {
      const [bx, by] = c[(i + 1) % 4];
      seg([ax, ay, z1], [bx, by, z1], ec);
      seg([ax, ay, z0], [bx, by, z0], ec);
      seg([ax, ay, z0], [ax, ay, z1], ec);
    });
  }
  const circ = (cx, cy, r, i, n) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r];
  function disc(cx, cy, r, z, n, c, a) { for (let i = 0; i < n; i++) tri([cx, cy, z], [...circ(cx, cy, r, i, n), z], [...circ(cx, cy, r, i + 1, n), z], UP, c, a); }
  function loop(cx, cy, r, z, n, c) { for (let i = 0; i < n; i++) seg([...circ(cx, cy, r, i, n), z], [...circ(cx, cy, r, i + 1, n), z], c); }
  // a flat panel on the face of a block; u runs along the face (0..1), z up
  function panel(x, y, f, n, u0, u1, z0, z1, out, c, a) {
    const [nx, ny] = n, tx = -ny, ty = nx, e = f + out;
    const at = (uu, z) => [x + nx * e + tx * (uu - 0.5) * 2 * f, y + ny * e + ty * (uu - 0.5) * 2 * f, z];
    quad(at(u0, z0), at(u1, z0), at(u1, z1), at(u0, z1), [nx, ny, 0], c, a);
    return at;
  }

  /* ---------- scenery ---------- */
  function tree(x, y) {
    box(x, y, 0.012, 0.012, 0.05, 0.1, col('#0e5f4f'));
    const r = 0.055, zb = 0.09, zt = 0.23, g = col('#1fb58a', 0.12);
    const c = [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]];
    c.forEach((p, i) => {
      const q = c[(i + 1) % 4], mx = (p[0] + q[0]) / 2 - x, my = (p[1] + q[1]) / 2 - y;
      tri([p[0], p[1], zb], [q[0], q[1], zb], [x, y, zt], norm([mx * 0.14, my * 0.14, r * r * 20]), g);
    });
  }
  function plot(x, y, color, active) {
    box(x, y, 0.4, 0.4, 0, 0.05, col('#1a1d78'), col('#232a96'), edge(color, active ? 1 : 0.35));
    if (active) { // a bright halo round the selected block
      const r = 0.47, c = [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]];
      c.forEach((q, i) => seg([...q, 0.01], [...c[(i + 1) % 4], 0.01], edge(color, 1)));
    }
  }
  function ground(g) {
    // the old flat city's glow: darker at the back corner, brighter at the front
    const top = [col('#15136a'), col(mix('#15136a', '#2a1a9a', 0.5)), col('#2a1a9a'), col(mix('#15136a', '#2a1a9a', 0.5))];
    const P = [[g.x0, g.y0, 0], [g.x1, g.y0, 0], [g.x1, g.y1, 0], [g.x0, g.y1, 0]];
    [0, 1, 2, 0, 2, 3].forEach((i) => vtx(T, P[i], UP, top[i], STILL));
    box((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, (g.x1 - g.x0) / 2, (g.y1 - g.y0) / 2, -0.18, -0.001, col('#120f55'), null, edge('#8c82ff', 0.55));
    const road = edge('#5ee7ff', 0.3);
    for (let c = g.minX - 0.5; c <= g.maxX + 0.5; c++) seg([c, g.y0, 0.004], [c, g.y1, 0.004], road);
    for (let c = g.minY - 0.5; c <= g.maxY + 0.5; c++) seg([g.x0, c, 0.004], [g.x1, c, 0.004], road);
    // the endless neon grid under the floating city
    const n = 16, cx = Math.round((g.x0 + g.x1) / 2), cy = Math.round((g.y0 + g.y1) / 2), gc = edge('#b06bff', 0.4);
    for (let i = -n; i <= n; i++) {
      seg([cx + i, cy - n, -0.6], [cx + i, cy + n, -0.6], gc);
      seg([cx - n, cy + i, -0.6], [cx + n, cy + i, -0.6], gc);
    }
  }
  function plaza() {
    plot(0, 0, '#5ee7ff', false);
    disc(0, 0, 0.3, 0.056, 20, col('#10307a'));
    disc(0, 0, 0.21, 0.06, 20, col('#5ee7ff', 1), [-4.4, 0.35, 0]);
    box(0, 0, 0.012, 0.012, 0.06, 0.34, col('#dcfaff', 1));
    [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].forEach(([dx, dy]) => tree(dx, dy));
  }
  function park(x, y) {
    plot(x, y, '#2dd4bf', false);
    [[-0.22, -0.2], [0.18, -0.26], [-0.26, 0.16], [0.08, 0.02], [0.24, 0.22]].forEach(([dx, dy]) => tree(x + dx, y + dy));
  }

  /* ---------- buildings ---------- */
  function windows(p, idx, z0, z1, f) {
    const { x, y, b } = p, h = lay().hash;
    const rows = Math.max(1, Math.floor((z1 - z0) / 0.17));
    const lit = b.status === 'working' ? 0.75 : b.status === 'stuck' ? 0.5 : 0.35;
    const dark = col([8 / 255, 12 / 255, 55 / 255], 0.4);
    FACES.forEach((n, s) => {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < 3; c++) {
          const seed = idx * 97 + s * 31 + r * 7 + c;
          const twinkle = h(seed) > 0.8;
          const on = twinkle || h(seed) < lit;
          const zc = z0 + ((r + 0.5) / rows) * (z1 - z0), uc = (c + 0.5) / 3;
          let fill = dark, a = STILL;
          if (on) {
            if (b.status === 'stuck') { fill = col('#ff5c7a', 1); a = [5.2, 0.55, h(seed + 2)]; } else fill = col(h(seed + 1) > 0.5 ? b.color : '#fff3c4', 1);
            if (twinkle && b.status !== 'stuck') a = [5.2, 0.06, h(seed + 2)];
          }
          panel(x, y, f, n, uc - 0.11, uc + 0.11, zc - 0.035, zc + 0.035, 0.004, fill, a);
        }
      }
    });
  }

  function extras(p, info) {
    const { x, y, h, f, b } = p;
    const c = b.color, glowEdge = edge(c, 0.9);
    switch (b.style) {
      case 'lab': { // a glass dome
        const R = f * 0.9, seg = 12, rings = 4, dome = col(mix('#1b2590', c, 0.6), 0.35);
        for (let i = 0; i < seg; i++) {
          for (let k = 0; k < rings; k++) {
            const pt = (ii, kk) => { const a = (ii / seg) * Math.PI * 2, e = (kk / rings) * Math.PI / 2; return [x + Math.cos(a) * Math.cos(e) * R, y + Math.sin(a) * Math.cos(e) * R, h + Math.sin(e) * R]; };
            const q = [pt(i, k), pt(i + 1, k), pt(i + 1, k + 1), pt(i, k + 1)];
            const m = q.reduce((s, v) => s.map((w, j) => w + v[j] / 4), [0, 0, 0]);
            quad(...q, norm([m[0] - x, m[1] - y, m[2] - h]), dome);
          }
        }
        loop(x, y, R, h + 0.002, seg, glowEdge);
        break;
      }
      case 'shop': // a glowing awning band all round
        box(x, y, f * 1.08, f * 1.08, h * 0.55, h * 0.72, col(c, 0.85), null, null);
        break;
      case 'studio': // a big lit glass wall
        panel(x, y, f, [0, 1], 0.12, 0.88, h * 0.25, h * 0.8, 0.008, col(mix('#1b2590', c, 0.65), 0.8));
        break;
      case 'depot': // two loading doors
        [0.2, 0.62].forEach((u0) => {
          const at = panel(x, y, f, [1, 0], u0, u0 + 0.26, 0.05, h * 0.62, 0.008, col('#0b0f45', 0.2));
          seg(at(u0, h * 0.62), at(u0 + 0.26, h * 0.62), edge(c, 0.8));
          seg(at(u0, 0.05), at(u0, h * 0.62), edge(c, 0.8)); seg(at(u0 + 0.26, 0.05), at(u0 + 0.26, h * 0.62), edge(c, 0.8));
        });
        break;
      case 'hall': { // a pitched roof
        const r = h + 0.28, roof = col(mix('#2b3cb0', c, 0.35), 0.1), side = col(mix('#10175f', c, 0.2));
        quad([x - f, y + f, h], [x + f, y + f, h], [x + f, y, r], [x - f, y, r], norm([0, 0.28, f]), roof);
        quad([x + f, y - f, h], [x - f, y - f, h], [x - f, y, r], [x + f, y, r], norm([0, -0.28, f]), roof);
        tri([x + f, y + f, h], [x + f, y - f, h], [x + f, y, r], [1, 0, 0], side);
        tri([x - f, y - f, h], [x - f, y + f, h], [x - f, y, r], [-1, 0, 0], side);
        seg([x - f, y, r], [x + f, y, r], glowEdge);
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sy]) => seg([x + sx * f, y + sy * f, h], [x + sx * f, y, r], glowEdge));
        break;
      }
      case 'bank':
        box(x, y, f * 1.12, f * 1.12, h, h + 0.06, col(mix('#1b2590', c, 0.3)), col(mix('#2b3cb0', c, 0.4)), glowEdge);
        break;
      case 'office':
        box(x + f * 0.35, y - f * 0.3, f * 0.3, f * 0.3, h, h + 0.12, col(mix('#1b2590', c, 0.2)), col(mix('#2b3cb0', c, 0.3)), edge(c, 0.5));
        break;
      case 'media': { // a rooftop billboard with a play button, blinking while Buzz is working
        const z0 = h + 0.08, z1 = h + 0.34, by = y + f * 0.2, w = f * 0.72;
        [-0.6, 0.6].forEach((k) => box(x + k * w, by, 0.01, 0.01, h, z0, col('#d2dcff', 0.3)));
        const blink = b.status === 'working' ? [1.2, 0.5, 0] : STILL;
        box(x, by, w, 0.015, z0, z1, col(c, 0.9), col(mix('#10175f', c, 0.4)), edge('#ffe6f6', 0.9), blink);
        [1, -1].forEach((sd) => {
          const yy = by + sd * 0.017, zm = (z0 + z1) / 2, s = (z1 - z0) * 0.28;
          tri([x - s * 0.7, yy, zm - s], [x - s * 0.7, yy, zm + s], [x + s * 0.8, yy, zm], [0, sd, 0], col('#ffffff', 1));
        });
        break;
      }
      case 'tower': // the floating diamond is drawn each frame (it bobs); remember where
        info.diamond = { x, y, z: h + 0.38, c };
        break;
      default: break;
    }
  }

  function stadium(p, info) {
    const { x, y, h, b } = p, c = b.color, N = 24;
    const RO = 0.38, RI = 0.27, zi = 0.14, zf = 0.08;
    const wall = col(mix('#10175f', c, 0.12)), stands = col(mix('#1b2590', c, 0.28));
    for (let i = 0; i < N; i++) {
      const a0 = circ(x, y, RO, i, N), a1 = circ(x, y, RO, i + 1, N), b0 = circ(x, y, RI, i, N), b1 = circ(x, y, RI, i + 1, N);
      const am = (i + 0.5) / N * Math.PI * 2, cs = Math.cos(am), sn = Math.sin(am);
      quad([...a0, 0.05], [...a1, 0.05], [...a1, h], [...a0, h], [cs, sn, 0], wall);
      quad([...a0, h], [...a1, h], [...b1, zi], [...b0, zi], norm([-cs * 0.16, -sn * 0.16, 0.11]), stands);
      quad([...b0, zi], [...b1, zi], [...b1, zf], [...b0, zf], [-cs, -sn, 0], wall);
      // the band of seats round the outside, and a lit gate every few bays
      const s0 = circ(x, y, RO + 0.004, i, N), s1 = circ(x, y, RO + 0.004, i + 1, N);
      quad([...s0, h * 0.7], [...s1, h * 0.7], [...s1, h * 0.88], [...s0, h * 0.88], [cs, sn, 0], col(c, 0.6));
      if (i % 3 === 1) quad([...s0, 0.07], [...s1, 0.07], [...s1, 0.14], [...s0, 0.14], [cs, sn, 0], col(b.status === 'idle' ? '#fff3c4' : c, 1));
    }
    loop(x, y, RO, h, N, edge(c, 0.95));
    disc(x, y, RI, zf, N, col('#0c5a3a', 0.15));
    loop(x, y, 0.16, zf + 0.003, 20, edge('#f0fff0', 0.5)); // the 30-yard circle
    quad([x - 0.035, y - 0.13, zf + 0.004], [x + 0.035, y - 0.13, zf + 0.004], [x + 0.035, y + 0.13, zf + 0.004], [x - 0.035, y + 0.13, zf + 0.004], UP, col('#e2cf96', 0.2));
    [y - 0.12, y + 0.12].forEach((sy) => box(x, sy, 0.012, 0.004, zf, zf + 0.05, col('#ffffff', 1)));
    // floodlights: bright while Wicket works, flickering red when stuck
    const lamp = b.status === 'stuck' ? '#ff5c7a' : '#fff4c2';
    const flick = b.status === 'stuck' ? [0.8, 0.45, 0] : STILL;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => {
      const mx = x + dx * RO * 0.75, my = y + dy * RO * 0.75, top = h + 0.5;
      box(mx, my, 0.008, 0.008, h, top, col('#d2dcff', 0.3));
      box(mx, my, 0.035, 0.035, top, top + 0.03, col(lamp, 1), null, null, flick);
      info.lamps.push({ pos: [mx, my, top + 0.015], color: lamp, status: b.status });
    });
  }

  function building(p, idx, info, active) {
    const { x, y, h, f, b } = p;
    plot(x, y, b.color, active);
    if (b.style === 'stadium') { stadium(p, info); return; }
    tree(x - 0.33, y - 0.33); tree(x + 0.33, y - 0.33); tree(x - 0.33, y + 0.33);
    const side = col(mix('#1b2590', b.color, 0.2)), top = col(mix('#2b3cb0', b.color, 0.3)), ec = edge(b.color, active ? 1 : 0.7);
    if (b.style === 'tower') { box(x, y, 0.27, 0.27, 0.05, 0.38, side, top, ec); box(x, y, f, f, 0.38, h, side, top, ec); } else box(x, y, f, f, 0.05, h, side, top, ec);
    windows(p, idx, b.style === 'tower' ? 0.42 : 0.1, h - 0.06, f);
    extras(p, info);
  }

  /* Static geometry for the whole city: triangles, neon lines, and what the
   * renderer needs to draw each frame (beacons, lamps, the diamond). */
  function build(state, active) {
    T = []; Ln = [];
    const { placed, bounds, parks, lead } = lay().layout(state.buildings);
    const info = { placed, bounds, lead, lamps: [], diamond: null, beacons: [] };
    ground(bounds);
    plaza();
    parks.forEach((k) => park(k.x, k.y));
    placed.forEach((p, i) => {
      building(p, i, info, active.has(p.b.id));
      const bz = lay().beaconZ(p), base = p.h + (p.b.style === 'hall' ? 0.28 : 0.04);
      seg([p.x, p.y, base], [p.x, p.y, bz], edge(p.b.color, 0.8));
      info.beacons.push({ p, pos: [p.x, p.y, bz] });
    });
    const tri3 = new Float32Array(T), lines = new Float32Array(Ln);
    T = []; Ln = [];
    return { tri: tri3, lines, info };
  }

  // Things that move every frame: the cars on the roads and the HQ diamond.
  function dynamic(info, t, still) {
    T = [];
    const g = info.bounds, h = lay().hash;
    for (let i = 0; i < 6; i++) {
      const alongY = i % 2 === 1;
      const lo = alongY ? g.minX : g.minY, n = (alongY ? g.maxX : g.maxY) - lo + 2;
      const lane = lo - 0.5 + Math.floor(h(i + 3) * n);
      const from = alongY ? g.y0 : g.x0, span = (alongY ? g.y1 : g.x1) - from;
      const s = still ? h(i + 9) : ((t * (0.00005 + h(i) * 0.00006) + h(i + 5)) % 1);
      const pos = from + s * span, cx = alongY ? lane : pos, cy = alongY ? pos : lane;
      box(cx, cy, alongY ? 0.022 : 0.04, alongY ? 0.04 : 0.022, 0.006, 0.036, col(i % 3 ? '#ffc857' : '#ff7ad9', 1));
    }
    const d = info.diamond;
    if (d) {
      const bob = still ? 0 : Math.sin(t / 800) * 0.03, spin = still ? 0 : t / 2400, s = 0.13;
      const z = d.z + bob, c = col(d.c, 0.85);
      const ring = [0, 1, 2, 3].map((k) => [d.x + Math.cos(spin + (k * Math.PI) / 2) * s, d.y + Math.sin(spin + (k * Math.PI) / 2) * s, z]);
      [[z + s * 1.3, 1], [z - s * 1.1, -1]].forEach(([tipZ, up]) => ring.forEach((q, k) => {
        const r = ring[(k + 1) % 4], m = [(q[0] + r[0]) / 2 - d.x, (q[1] + r[1]) / 2 - d.y];
        tri(q, r, [d.x, d.y, tipZ], norm([m[0], m[1], up * s * 0.8]), c);
      }));
    }
    const out = new Float32Array(T);
    T = [];
    return out;
  }

  PC.city3dMesh = { build, dynamic, STRIDE };
})();
