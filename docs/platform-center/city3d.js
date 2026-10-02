/* Platform Center: the 3D neon city, drawn with plain WebGL (no library).
 * Drag to turn the city, drag up and down (or two fingers) to tilt, scroll
 * or pinch to zoom, tap a building to open its panel. Name tags, beacons,
 * floodlight glows and the manager's work lines sit on a 2D canvas on top.
 * Without WebGL the flat city from city.js is used instead.
 */
(function () {
  'use strict';
  const PC = (window.PC = window.PC || {});
  const M = () => PC.city3dMesh;
  const L = () => PC.cityLayout;

  const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec4 aCol; attribute vec3 aAnim;
uniform mat4 uVP; uniform vec3 uEye; uniform float uT; uniform float uLines; uniform float uPt;
uniform vec2 uFog;
varying vec3 vCol; varying float vA; varying float vFog;
void main() {
  gl_Position = uVP * vec4(aPos, 1.0);
  gl_PointSize = uPt;
  vFog = clamp((distance(aPos, uEye) - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  float on = 1.0;
  if (aAnim.x > 0.0) on = step(0.5, fract(uT / aAnim.x + aAnim.z));
  else if (aAnim.x < 0.0) on = 0.5 + 0.5 * sin((uT / -aAnim.x + aAnim.z) * 6.2832);
  float k = mix(aAnim.y, 1.0, on);
  vec3 Ld = normalize(vec3(-0.3, 0.9, 0.55));
  float lit = 0.42 + 0.75 * max(dot(aNor, Ld), 0.0);
  if (uLines > 0.5) { vCol = aCol.rgb * k; vA = aCol.a; }
  else { vCol = aCol.rgb * mix(lit, 1.25, aCol.a) * k; vA = 1.0; }
}`;
  const FS = `
precision mediump float;
uniform float uLinesF; uniform vec3 uFogCol;
varying vec3 vCol; varying float vA; varying float vFog;
void main() {
  if (uLinesF > 0.5) gl_FragColor = vec4(vCol, vA * (1.0 - vFog));
  else gl_FragColor = vec4(mix(vCol, uFogCol, vFog * 0.85), 1.0);
}`;

  const FOVY = 0.6;
  const cam = { yaw: Math.PI / 4, pitch: 0.6, zoom: 1, panX: 0, panY: 0, tYaw: Math.PI / 4, tPitch: 0.6, tZoom: 1, tPanX: 0, tPanY: 0, vYaw: 0 };
  const DEFAULT = { yaw: Math.PI / 4, pitch: 0.6, zoom: 1 };
  let canvas, overlay, octx, gl, loc = {}, bufs = {}, counts = {};
  let getState, onPick, opts, mode = '';
  let W = 0, H = 0, dpr = 1, raf = 0, last = 0, lastFrame = 0;
  let mesh = null, sig = '', hoverId = null, selectedId = null;
  let view = null, labels = [], dragged = false, drag = null, touch = null;
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  /* ---------- small maths ---------- */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const toGL = (p) => [p[0], p[2], p[1]];
  function mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
    return o;
  }

  /* ---------- camera ----------
   * The camera orbits the middle of the city at a fixed distance. A 2D fit then
   * scales and centres the picture so the whole city and its name tags fit at
   * any angle (like the flat city did); zoom and pan work on top of that fit. */
  function viewAt(yaw, pitch, g, aspect) {
    const target = [(g.x0 + g.x1) / 2, 0.5, (g.y0 + g.y1) / 2];
    const R = Math.hypot((g.x1 - g.x0) / 2, (g.y1 - g.y0) / 2, 1.0);
    const dist = (R / Math.sin(FOVY / 2)) * 1.1, cp = Math.cos(pitch);
    const eye = [target[0] + dist * cp * Math.cos(yaw), target[1] + dist * Math.sin(pitch), target[2] + dist * cp * Math.sin(yaw)];
    const z = nrm(sub(eye, target)), x = nrm(cross([0, 1, 0], z)), y = cross(z, x);
    const V = [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
    const n = Math.max(0.05, dist - R * 3), f = dist + R * 6 + 50, t = 1 / Math.tan(FOVY / 2), nf = 1 / (n - f);
    const P = [t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0];
    return { PV: mul(P, V), eye, x, y, z, t, dist, R };
  }
  function extent(m, pts) {
    const e = [Infinity, Infinity, -Infinity, -Infinity];
    pts.forEach((p) => {
      const q = toGL(p), w = m[3] * q[0] + m[7] * q[1] + m[11] * q[2] + m[15];
      const x = (m[0] * q[0] + m[4] * q[1] + m[8] * q[2] + m[12]) / w, y = (m[1] * q[0] + m[5] * q[1] + m[9] * q[2] + m[13]) / w;
      e[0] = Math.min(e[0], x); e[1] = Math.min(e[1], y); e[2] = Math.max(e[2], x); e[3] = Math.max(e[3], y);
    });
    return e;
  }
  function camera() {
    const g = mesh.info.bounds, aspect = W / H;
    const pts = [[g.x0, g.y0, 0], [g.x1, g.y0, 0], [g.x1, g.y1, 0], [g.x0, g.y1, 0], [g.x0, g.y0, -0.18], [g.x1, g.y0, -0.18], [g.x1, g.y1, -0.18], [g.x0, g.y1, -0.18]]
      .concat(mesh.info.beacons.map((o) => [o.pos[0], o.pos[1], o.pos[2] + 0.2]));
    // leave room for the name tags at the top, and below the brief banner when it spans the city (phones)
    const br = document.getElementById('brief-ready');
    const padTop = br && !br.hidden && br.offsetWidth > W * 0.5 ? br.offsetTop + br.offsetHeight + 40 : 48;
    const top = 1 - (2 * padTop) / H, bot = -1 + (2 * 14) / H, side = 0.94;
    // one scale for every angle, so turning the city doesn't pump its size
    let s = Infinity;
    for (let i = 0; i < 8; i++) {
      const e = extent(viewAt(cam.yaw + (i * Math.PI) / 4, cam.pitch, g, aspect).PV, pts);
      s = Math.min(s, (2 * side) / (e[2] - e[0]), (top - bot) / (e[3] - e[1]));
    }
    const v = viewAt(cam.yaw, cam.pitch, g, aspect), e = extent(v.PV, pts);
    const lim = [side / s, (top - bot) / 2 / s].map((h) => h * Math.max(0, 1 - 1 / cam.zoom) + 0.02);
    cam.panX = clamp(cam.panX, -lim[0], lim[0]); cam.panY = clamp(cam.panY, -lim[1], lim[1]);
    cam.tPanX = clamp(cam.tPanX, -lim[0], lim[0]); cam.tPanY = clamp(cam.tPanY, -lim[1], lim[1]);
    const S = s * cam.zoom, ox = (e[0] + e[2]) / 2 + cam.panX, oy = (e[1] + e[3]) / 2 - (top + bot) / 2 / s + cam.panY;
    const A = [S, 0, 0, 0, 0, S, 0, 0, 0, 0, 1, 0, -S * ox, -S * oy, 0, 1];
    view = { VP: mul(A, v.PV), eye: v.eye, x: v.x, y: v.y, z: v.z, aspect, t: v.t, dist: v.dist, R: v.R, S, ox, oy };
  }
  // city point -> [screen x, screen y, pixels per city unit there], or null behind the camera
  function project(p) {
    const q = toGL(p), m = view.VP;
    const cx = m[0] * q[0] + m[4] * q[1] + m[8] * q[2] + m[12];
    const cy = m[1] * q[0] + m[5] * q[1] + m[9] * q[2] + m[13];
    const w = m[3] * q[0] + m[7] * q[1] + m[11] * q[2] + m[15];
    if (w < 0.05) return null;
    return [(cx / w * 0.5 + 0.5) * W, (0.5 - cy / w * 0.5) * H, ((H / 2) * view.t * view.S) / w];
  }
  function ease(dt) {
    const k = 1 - Math.exp(-dt * 12);
    if (!drag && !touch) { cam.tYaw += cam.vYaw * dt; cam.vYaw *= Math.exp(-dt * 3.5); if (Math.abs(cam.vYaw) < 0.002) cam.vYaw = 0; }
    let moving = cam.vYaw !== 0;
    ['yaw', 'pitch', 'zoom', 'panX', 'panY'].forEach((n) => {
      const T = 't' + n[0].toUpperCase() + n.slice(1);
      cam[n] += (cam[T] - cam[n]) * k;
      if (Math.abs(cam[T] - cam[n]) > 1e-4) moving = true; else cam[n] = cam[T];
    });
    return moving;
  }

  /* ---------- WebGL ---------- */
  function compile(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  }
  function initGL() {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
    gl.useProgram(prog);
    ['aPos', 'aNor', 'aCol', 'aAnim'].forEach((n) => { loc[n] = gl.getAttribLocation(prog, n); gl.enableVertexAttribArray(loc[n]); });
    ['uVP', 'uEye', 'uT', 'uLines', 'uLinesF', 'uPt', 'uFog', 'uFogCol'].forEach((n) => { loc[n] = gl.getUniformLocation(prog, n); });
    ['tri', 'lines', 'dyn', 'stars'].forEach((k) => { bufs[k] = gl.createBuffer(); counts[k] = 0; });
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    upload('stars', stars(), gl.STATIC_DRAW);
    sig = '';
  }
  function upload(k, data, usage) {
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs[k]); gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
    counts[k] = data.length / M().STRIDE;
  }
  function drawBuf(k, prim) {
    if (!counts[k]) return;
    const S = M().STRIDE * 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs[k]);
    gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, S, 0);
    gl.vertexAttribPointer(loc.aNor, 3, gl.FLOAT, false, S, 12);
    gl.vertexAttribPointer(loc.aCol, 4, gl.FLOAT, false, S, 24);
    gl.vertexAttribPointer(loc.aAnim, 3, gl.FLOAT, false, S, 40);
    gl.drawArrays(prim, 0, counts[k]);
  }
  // twinkling stars on a far dome, so they turn with the city
  function stars() {
    const h = L().hash, out = [];
    for (let i = 0; i < 140; i++) {
      const a = h(i + 1) * Math.PI * 2, e = 0.12 + h(i + 101) * 1.2, r = 45, br = 0.5 + h(i + 3) * 0.5;
      out.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r, 0, 0, 0, 0.82 * br, 0.86 * br, 1 * br, 0.4 + h(i + 5) * 0.6, -(2 + h(i + 7) * 4), 0.45, h(i + 11));
    }
    return new Float32Array(out);
  }

  function signature(s) {
    return s.buildings.map((b) => [b.id, b.style, b.color, b.status, b.lead ? 1 : 0, b.hall ? 1 : 0].join('|')).join('~') + `#${hoverId}#${selectedId}`;
  }

  /* ---------- a frame ---------- */
  function frame(t) {
    if (!gl || !W || !H || gl.isContextLost()) return;
    const s = getState();
    const nsig = signature(s);
    if (nsig !== sig || !mesh) {
      mesh = M().build(s, new Set([hoverId, selectedId].filter(Boolean)));
      upload('tri', mesh.tri); upload('lines', mesh.lines); sig = nsig;
    }
    camera();
    const still = motion.matches;
    upload('dyn', M().dynamic(mesh.info, t, still), gl.DYNAMIC_DRAW);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(loc.uVP, false, new Float32Array(view.VP));
    gl.uniform3fv(loc.uEye, view.eye);
    gl.uniform1f(loc.uT, still ? 0.3 : (t % 600000) / 1000);
    gl.uniform2f(loc.uFog, view.dist + view.R * 0.6, view.dist + view.R * 3.2);
    gl.uniform3f(loc.uFogCol, 0.16, 0.08, 0.42);
    gl.uniform1f(loc.uPt, 1);
    gl.uniform1f(loc.uLines, 0); gl.uniform1f(loc.uLinesF, 0);
    drawBuf('tri', gl.TRIANGLES); drawBuf('dyn', gl.TRIANGLES);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniform1f(loc.uLines, 1); gl.uniform1f(loc.uLinesF, 1);
    drawBuf('lines', gl.LINES);
    gl.uniform2f(loc.uFog, 1e5, 2e5);
    gl.uniform1f(loc.uPt, Math.max(1, dpr * 1.4));
    drawBuf('stars', gl.POINTS);
    gl.depthMask(true); gl.disable(gl.BLEND);
    drawOverlay(s, t, still);
  }

  /* ---------- the 2D layer: glows, work lines, name tags ---------- */
  function glow(c, p, r, color, a) {
    const { rgba } = L();
    const g = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
    g.addColorStop(0, rgba(color, a)); g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g; c.beginPath(); c.arc(p[0], p[1], r, 0, Math.PI * 2); c.fill();
  }
  function drawOverlay(s, t, still) {
    const c = octx, { STATUS_COLOR, drawLabel, rgba } = L();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const info = mesh.info, tops = new Map();
    info.lamps.forEach((l) => {
      const q = project(l.pos); if (!q) return;
      const flick = still || Math.floor(t / 400) % 2;
      const a = l.status === 'working' ? 0.95 : l.status === 'stuck' ? (flick ? 0.8 : 0.35) : 0.55;
      glow(c, q, clamp(q[2] * 0.12, 4, 22), l.color, a);
    });
    if (info.diamond) { const q = project([info.diamond.x, info.diamond.y, info.diamond.z]); if (q) glow(c, q, clamp(q[2] * 0.35, 10, 60), info.diamond.c, 0.45); }
    info.beacons.forEach(({ p, pos }) => {
      const q = project(pos); if (!q) return;
      tops.set(p.b.id, { q, pos, p });
      const b = p.b, sc = STATUS_COLOR[b.status] || STATUS_COLOR.idle, tint = b.status === 'idle' ? b.color : sc;
      const beat = still ? 0.6 : 0.5 + 0.5 * Math.sin(t / (b.status === 'stuck' ? 250 : 600) + p.x * 2 + p.y);
      const r = ((b.status === 'working' ? 6 : 4.5) + beat * 3) * clamp(q[2] / 70, 0.7, 1.5);
      glow(c, q, r * 3, tint, 0.9);
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(q[0], q[1], 2.4, 0, Math.PI * 2); c.fill();
    });
    // work lines from the manager to every building; they flow while it has handed that building work
    const lead = info.lead && tops.get(info.lead.id);
    if (lead) {
      tops.forEach((o, id) => {
        if (id === info.lead.id) return;
        const delegated = o.p.b.tasks.some((k) => !k.done && k.from && k.from === info.lead.name);
        const a = lead.pos, b = o.pos, lift = Math.max(a[2], b[2]) + 0.5 + Math.hypot(a[0] - b[0], a[1] - b[1]) * 0.15;
        const pts = [];
        for (let i = 0; i <= 16; i++) {
          const u = i / 16, m = 2 * u * (1 - u);
          const pt = project([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, (1 - u) * (1 - u) * a[2] + m * lift + u * u * b[2]]);
          if (pt) pts.push(pt);
        }
        if (pts.length < 2) return;
        c.save();
        c.setLineDash([5, 6]);
        c.lineDashOffset = delegated && !still ? -t / 40 : 0;
        c.strokeStyle = delegated ? rgba(o.p.b.color, 0.9) : 'rgba(220,230,255,0.3)';
        c.lineWidth = delegated ? 1.8 : 1.1;
        c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach((q) => c.lineTo(q[0], q[1])); c.stroke();
        c.restore();
      });
    }
    // name tags: the nearest keeps its spot, farther ones step up out of its way;
    // drawn far first so the nearest sits on top (and wins a tap)
    const near = [...tops.values()].sort((a, b) => dist2(a.pos) - dist2(b.pos)), taken = [];
    near.forEach((o) => {
      const sc = clamp(o.q[2], 55, 75);
      let at = [o.q[0], o.q[1]], r = drawLabel(c, o.p.b, at, sc, true);
      for (let i = 0; i < 5; i++) {
        const hit = taken.find((k) => r[0] < k[2] && r[2] > k[0] && r[1] < k[3] && r[3] > k[1]);
        if (!hit || at[1] - (r[3] - hit[1]) < 40) break;
        at = [at[0], at[1] - (r[3] - hit[1]) - 2];
        r = drawLabel(c, o.p.b, at, sc, true);
      }
      o.at = at; o.sc = sc; taken.push(r);
    });
    labels = near.slice().reverse().map((o) => {
      if (o.at[1] < o.q[1] - 1) {
        c.strokeStyle = 'rgba(220,230,255,0.35)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(o.q[0], o.q[1]); c.lineTo(o.at[0], o.at[1] - 4); c.stroke();
      }
      return { id: o.p.b.id, rect: drawLabel(c, o.p.b, o.at, o.sc) };
    }).reverse();
  }
  const dist2 = (p) => { const q = toGL(p); const d = sub(q, view.eye); return dot(d, d); };

  /* ---------- picking ---------- */
  function pick(ev) {
    if (!view || !mesh) return null;
    const r = canvas.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
    const byLabel = labels.find((l) => mx >= l.rect[0] && mx <= l.rect[2] && my >= l.rect[1] && my <= l.rect[3]);
    if (byLabel) return byLabel.id;
    // a ray from the eye through the pointer, tested against each block (plot + building + beacon)
    const nx = (mx / W) * 2 - 1, ny = 1 - (my / H) * 2;
    const px = nx / view.S + view.ox, py = ny / view.S + view.oy; // back to the unzoomed camera
    const dGL = nrm([0, 1, 2].map((i) => -view.z[i] + (view.x[i] * px * view.aspect + view.y[i] * py) / view.t));
    const o = [view.eye[0], view.eye[2], view.eye[1]], d = [dGL[0], dGL[2], dGL[1]];
    const hit = (lo, hi) => {
      let t0 = 0, t1 = Infinity;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return Infinity; continue; }
        let a = (lo[i] - o[i]) / d[i], b = (hi[i] - o[i]) / d[i];
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t0 > t1) return Infinity;
      }
      return t0;
    };
    // the building's own shape, its block and its beacon mast first; then a looser box round it
    let best = null, bestT = Infinity;
    const { beaconZ, roofZ } = L();
    mesh.info.placed.forEach((p) => {
      const f = p.b.style === 'stadium' ? 0.38 : p.f, bz = beaconZ(p);
      const t = Math.min(hit([p.x - f, p.y - f, 0], [p.x + f, p.y + f, roofZ(p)]), hit([p.x - 0.42, p.y - 0.42, 0], [p.x + 0.42, p.y + 0.42, 0.06]), hit([p.x - 0.07, p.y - 0.07, p.h], [p.x + 0.07, p.y + 0.07, bz + 0.1]));
      if (t < bestT) { bestT = t; best = p.b.id; }
    });
    if (best) return best;
    mesh.info.placed.forEach((p) => {
      const t = hit([p.x - 0.42, p.y - 0.42, 0], [p.x + 0.42, p.y + 0.42, L().beaconZ(p) + 0.1]);
      if (t < bestT) { bestT = t; best = p.b.id; }
    });
    return best;
  }

  /* ---------- input: mouse, touch, wheel ---------- */
  function poke() { if (!raf) start(); }
  function turn(dx, dy) { cam.tYaw += dx * 0.009; cam.tPitch = clamp(cam.tPitch + dy * 0.006, 0.18, 1.35); poke(); }
  // zoom in or out keeping the point under the pointer (screen x, y) where it is
  function zoomBy(f, sx, sy) {
    const z1 = cam.tZoom, z2 = clamp(z1 * f, 0.7, 3.5);
    if (view && sx != null) {
      const nx = (sx / W) * 2 - 1, ny = 1 - (sy / H) * 2, s = view.S / cam.zoom;
      cam.tPanX += nx / (s * z1) - nx / (s * z2); cam.tPanY += ny / (s * z1) - ny / (s * z2);
    }
    cam.tZoom = z2; poke();
  }
  const local = (x, y) => { const r = canvas.getBoundingClientRect(); return [x - r.left, y - r.top]; };
  function bindInput() {
    canvas.addEventListener('pointerdown', (ev) => {
      dragged = false;
      if (ev.pointerType === 'touch' || ev.button !== 0) return;
      drag = { x: ev.clientX, y: ev.clientY, sx: ev.clientX, sy: ev.clientY, t: performance.now() };
      cam.vYaw = 0;
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* not capturable */ }
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (ev.pointerType === 'touch') return;
      if (drag) {
        const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y, now = performance.now();
        if (Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) > 5) dragged = true;
        if (dragged) { turn(dx, dy); cam.vYaw = (dx * 0.009) / Math.max(0.008, (now - drag.t) / 1000); }
        drag.x = ev.clientX; drag.y = ev.clientY; drag.t = now;
        canvas.style.cursor = dragged ? 'grabbing' : canvas.style.cursor;
        return;
      }
      const id = pick(ev);
      if (id !== hoverId) { hoverId = id; poke(); }
      canvas.style.cursor = id ? 'pointer' : 'grab';
    });
    const end = () => { if (drag && performance.now() - drag.t > 80) cam.vYaw = 0; drag = null; canvas.style.cursor = hoverId ? 'pointer' : 'grab'; poke(); };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => { if (!drag && hoverId) { hoverId = null; poke(); } });
    canvas.addEventListener('click', (ev) => { if (dragged) { dragged = false; return; } const id = pick(ev); if (id) onPick(id); });
    canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const px = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaY;
      zoomBy(Math.exp(-clamp(px, -120, 120) * (ev.ctrlKey ? 0.01 : 0.0015)), ...local(ev.clientX, ev.clientY));
    }, { passive: false });

    // Touch: one finger across turns the city (up and down still scrolls the page),
    // two fingers pinch to zoom and slide up or down to tilt.
    const pts = (e) => [...e.touches].map((k) => [k.clientX, k.clientY]);
    canvas.addEventListener('touchstart', (e) => {
      const p = pts(e);
      cam.vYaw = 0;
      touch = { p, mode: p.length > 1 ? 'two' : 'wait', t: performance.now() };
      if (p.length > 1) dragged = true;
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      if (!touch) return;
      const p = pts(e), now = performance.now();
      if (p.length > 1) {
        if (touch.mode !== 'two' || touch.p.length < 2) { touch = { p, mode: 'two', t: now }; dragged = true; e.preventDefault(); return; }
        const d0 = Math.hypot(touch.p[0][0] - touch.p[1][0], touch.p[0][1] - touch.p[1][1]);
        const d1 = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
        const my0 = (touch.p[0][1] + touch.p[1][1]) / 2, my1 = (p[0][1] + p[1][1]) / 2;
        const mx0 = (touch.p[0][0] + touch.p[1][0]) / 2, mx1 = (p[0][0] + p[1][0]) / 2;
        if (d0 > 0 && d1 > 0) zoomBy(d1 / d0, ...local(mx1, my1));
        turn(mx1 - mx0, my1 - my0);
        e.preventDefault();
      } else if (touch.mode === 'wait') {
        const dx = p[0][0] - touch.p[0][0], dy = p[0][1] - touch.p[0][1];
        if (Math.hypot(dx, dy) < 6) return;
        touch.mode = Math.abs(dx) > Math.abs(dy) ? 'turn' : 'scroll';
        if (touch.mode === 'turn') { dragged = true; e.preventDefault(); }
      } else if (touch.mode === 'turn') {
        const dx = p[0][0] - touch.p[0][0];
        turn(dx, 0);
        cam.vYaw = (dx * 0.009) / Math.max(0.008, (now - touch.t) / 1000);
        e.preventDefault();
      }
      touch.p = p; touch.t = now;
    }, { passive: false });
    const tend = (e) => {
      if (!touch) return;
      if (e.touches.length) { touch = { p: pts(e), mode: e.touches.length > 1 ? 'two' : 'done', t: performance.now() }; return; }
      if (touch.mode !== 'turn' || performance.now() - touch.t > 80) cam.vYaw = 0;
      touch = null; poke();
    };
    canvas.addEventListener('touchend', tend);
    canvas.addEventListener('touchcancel', tend);
  }

  /* ---------- loop, size, controls ---------- */
  function tick(t) {
    raf = 0;
    const dt = Math.min(0.1, (t - (lastFrame || t)) / 1000);
    lastFrame = t;
    const moving = ease(dt) || !!drag || !!touch;
    if (document.hidden) return;
    // animate at ~30 fps (smooth 60 while the camera moves); with reduced motion only while moving
    if (moving || t - last >= 32) { last = t; frame(t); }
    if (moving || !motion.matches) raf = requestAnimationFrame(tick);
    else lastFrame = 0;
  }
  function start() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; lastFrame = 0;
    if (document.hidden) return;
    frame(performance.now());
    raf = requestAnimationFrame(tick);
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    [canvas, overlay].forEach((c) => { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
    if (gl && !gl.isContextLost()) frame(performance.now());
  }
  function controls(wrap) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'city-reset'; btn.title = 'Reset view';
    btn.setAttribute('aria-label', 'Reset the city view');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';
    btn.addEventListener('click', () => { cam.tYaw = DEFAULT.yaw + Math.round((cam.yaw - DEFAULT.yaw) / (Math.PI * 2)) * Math.PI * 2; cam.tPitch = DEFAULT.pitch; cam.tZoom = DEFAULT.zoom; cam.tPanX = 0; cam.tPanY = 0; cam.vYaw = 0; poke(); });
    const hint = document.createElement('p');
    hint.className = 'city-hint'; hint.setAttribute('aria-hidden', 'true');
    hint.textContent = window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? 'Swipe to turn · pinch to zoom · tap a building' : 'Drag to turn · scroll to zoom · click a building';
    wrap.append(btn, hint);
    setTimeout(() => hint.classList.add('gone'), 7000);
  }

  function flat(el) {
    mode = '2d';
    let c = el;
    if (gl) { c = el.cloneNode(false); el.replaceWith(c); gl = null; } // a canvas that had WebGL can't draw 2D
    if (overlay) { overlay.remove(); overlay = null; }
    canvas = c;
    c.dataset.mode = '2d';
    PC.city2d.mount(c, opts);
  }

  PC.city = {
    mount(el, o) {
      opts = o; getState = o.getState; onPick = o.onPick; canvas = el;
      try { gl = el.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'low-power' }) || el.getContext('experimental-webgl'); } catch (e) { gl = null; }
      if (!gl) { flat(el); return; }
      try { initGL(); } catch (e) { console.warn('3D city unavailable, using the flat city:', e && e.message); flat(el); return; }
      mode = '3d';
      el.dataset.mode = '3d';
      el.classList.add('is-3d');
      overlay = document.createElement('canvas');
      overlay.className = 'city-overlay'; overlay.setAttribute('aria-hidden', 'true');
      el.after(overlay);
      octx = overlay.getContext('2d');
      controls(el.parentElement);
      bindInput();
      el.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; });
      el.addEventListener('webglcontextrestored', () => { try { initGL(); start(); } catch (e) { /* stays blank until reload */ } });
      if (window.ResizeObserver) new ResizeObserver(resize).observe(el);
      window.addEventListener('resize', resize);
      document.addEventListener('visibilitychange', start);
      if (motion.addEventListener) motion.addEventListener('change', start);
      resize();
      start();
    },
    select(id) { if (mode === '2d') { PC.city2d.select(id); return; } selectedId = id; poke(); },
    redraw() { if (mode === '2d') { PC.city2d.redraw(); return; } poke(); },
    mode: () => mode,
    view: () => ({ yaw: cam.yaw, pitch: cam.pitch, zoom: cam.zoom, panX: cam.panX, panY: cam.panY }),
    // where a building's body is on screen, for tests
    where(id, part) {
      if (mode === '2d') return PC.city2d.where(id, part);
      if (!mesh) return null;
      if (part === 'mast') { const o = mesh.info.beacons.find((x) => x.p.b.id === id); return o ? project([o.p.x, o.p.y, o.pos[2] - 0.12]) : null; }
      if (part === 'label' || part === 'labelRect') { const l = labels.find((x) => x.id === id); return !l ? null : part === 'labelRect' ? l.rect : [(l.rect[0] + l.rect[2]) / 2, (l.rect[1] + l.rect[3]) / 2]; }
      const o = mesh.info.beacons.find((x) => x.p.b.id === id);
      return o ? project([o.p.x, o.p.y, L().roofZ(o.p)]) : null; // the middle of its roof
    },
  };
})();
