import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, random } from "remotion";

// Fully animated scene types (no photos): drawn phones, nets diagrams, stumps and kinetic text.
const NAVY = "#0f1b2d";
const YELLOW = "#f2b705";
const RED = "#ff3b3b";
const GREEN = "#2ee66b";
const OFF = "#eef3ec";
const TURF = "#1f7a4a";
const FONT = "Montserrat, sans-serif";

type S = {
  dur: number; text?: string; sub?: string; style?: string; size?: number; top?: number; bg?: string;
  words?: string[]; mode?: string; spots?: number[]; label?: string;
  a?: { mode: string; label: string }; b?: { mode: string; label: string };
};

const BGS: Record<string, [string, string]> = {
  navy: [NAVY, "white"], yellow: [YELLOW, NAVY], red: [RED, "white"], green: [GREEN, NAVY], turf: [TURF, "white"],
};

const useSp = (delay = 0, damping = 12, stiffness = 200) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - delay, fps, config: { damping, stiffness } });
};

// Slow moving diagonal stripes so a flat colour never looks static
export const AnimBg: React.FC<{ bg?: string }> = ({ bg = "navy" }) => {
  const f = useCurrentFrame();
  const [c, fg] = BGS[bg] ?? BGS.navy;
  const line = fg === "white" ? "rgba(255,255,255,.05)" : "rgba(15,27,45,.07)";
  return (
    <AbsoluteFill style={{ background: c, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: -400, transform: `rotate(-20deg) translateX(${(f * 3) % 160}px)`, backgroundImage: `repeating-linear-gradient(90deg, ${line} 0 60px, transparent 60px 160px)` }} />
    </AbsoluteFill>
  );
};

const Title: React.FC<{ text?: string; top?: number; size?: number; style?: string; delay?: number }> = ({ text, top = 220, size = 80, style = "white", delay = 0 }) => {
  const sp = useSp(delay, 11, 220);
  if (!text) return null;
  const pal: Record<string, [string, string]> = { white: ["white", "#111"], yellow: [YELLOW, NAVY], red: [RED, "white"], navy: [NAVY, "white"], green: [GREEN, NAVY] };
  const [b, c] = pal[style] ?? pal.white;
  return (
    <div style={{ position: "absolute", top, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <div style={{ maxWidth: 940, padding: "14px 30px", background: b, color: c, fontFamily: FONT, fontWeight: 900, fontSize: size, lineHeight: 1.08, textAlign: "center", borderRadius: 18, transform: `scale(${sp})`, boxShadow: "0 10px 30px rgba(0,0,0,.35)" }}>{text}</div>
    </div>
  );
};

// Little batter drawn in strokes; `swing` 0..1 moves the bat
const Batter: React.FC<{ x: number; y: number; h: number; swing?: number; color?: string }> = ({ x, y, h, swing = 0, color = OFF }) => {
  const k = h / 100;
  const bat = -40 + swing * 120;
  return (
    <g transform={`translate(${x},${y}) scale(${k})`} stroke={color} strokeWidth={7} strokeLinecap="round" fill="none">
      <circle cx={0} cy={-88} r={11} fill={color} />
      <line x1={0} y1={-76} x2={0} y2={-35} />
      <line x1={0} y1={-35} x2={-16} y2={0} />
      <line x1={0} y1={-35} x2={18} y2={0} />
      <line x1={0} y1={-66} x2={14} y2={-48} />
      <g transform={`translate(14,-48) rotate(${bat})`}><line x1={0} y1={0} x2={0} y2={46} stroke={YELLOW} strokeWidth={9} /></g>
    </g>
  );
};

// Phone drawn in SVG. mode: good | far | tilt | thumb | shake
export const Phone: React.FC<{ mode?: string; w?: number }> = ({ mode = "good", w = 420 }) => {
  const f = useCurrentFrame();
  const h = w * 1.9;
  const good = mode === "good";
  const sh = mode === "shake" ? 18 : 0;
  const dx = sh ? (random(`px${f}`) - 0.5) * sh : 0;
  const dy = sh ? (random(`py${f}`) - 0.5) * sh : 0;
  const rot = mode === "tilt" ? 24 : 0;
  const bh = mode === "far" ? 22 : 300;
  const swing = (Math.sin(f / 7) + 1) / 2;
  const blink = Math.floor(f / 8) % 2 ? 1 : 0.3;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ transform: `translate(${dx}px,${dy}px) rotate(${rot}deg)`, overflow: "visible" }}>
      <rect x={0} y={0} width={w} height={h} rx={w * 0.12} fill="#0a0f18" stroke={good ? YELLOW : "#6b7280"} strokeWidth={10} />
      <rect x={18} y={18} width={w - 36} height={h - 36} rx={w * 0.09} fill={good ? "#173a2a" : "#1d2430"} />
      <g filter={mode === "shake" ? "url(#bl)" : undefined}>
        <rect x={18} y={h * 0.62} width={w - 36} height={h * 0.38 - 18} fill={TURF} opacity={0.8} />
        <line x1={40} y1={h * 0.82} x2={w - 40} y2={h * 0.82} stroke="white" strokeWidth={4} opacity={0.8} />
        <Batter x={mode === "far" ? w * 0.7 : w / 2} y={mode === "far" ? h * 0.66 : h * 0.82} h={bh} swing={swing} />
      </g>
      <defs><filter id="bl"><feGaussianBlur stdDeviation={6} /></filter></defs>
      {good && [[40, 60], [w - 40, 60], [40, h - 60], [w - 40, h - 60]].map(([cx, cy], i) => (
        <path key={i} d={`M${cx} ${cy + (cy < h / 2 ? 40 : -40)} L${cx} ${cy} L${cx + (cx < w / 2 ? 40 : -40)} ${cy}`} stroke={OFF} strokeWidth={8} fill="none" />
      ))}
      <circle cx={w / 2 - 40} cy={70} r={12} fill={RED} opacity={blink} />
      <text x={w / 2 - 20} y={82} fill="white" fontFamily={FONT} fontWeight={800} fontSize={32}>REC</text>
      {mode === "thumb" && <ellipse cx={w * 0.25} cy={h * 0.6} rx={w * 0.42} ry={h * 0.3} fill="#c98d66" opacity={0.95} transform={`rotate(25 ${w * 0.25} ${h * 0.6})`} />}
    </svg>
  );
};

const Mark: React.FC<{ ok: boolean; delay?: number }> = ({ ok, delay = 6 }) => {
  const sp = useSp(delay, 9, 260);
  return <div style={{ width: 190, height: 190, borderRadius: 95, background: "white", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontWeight: 900, fontSize: 130, color: ok ? "#14a84a" : RED, transform: `scale(${1.6 - 0.6 * sp})`, opacity: sp, boxShadow: "0 10px 30px rgba(0,0,0,.35)" }}>{ok ? "✓" : "✕"}</div>;
};

// One phone in the middle, big caption, ✓ or ✕
export const PhoneScene: React.FC<{ s: S }> = ({ s }) => {
  const sp = useSp(0, 13, 180);
  const good = (s.mode ?? "good") === "good";
  return (
    <AbsoluteFill>
      <AnimBg bg={s.bg ?? (good ? "navy" : "red")} />
      <div style={{ position: "absolute", top: 520, left: 0, right: 0, display: "flex", justifyContent: "center", transform: `translateY(${(1 - sp) * 900}px)` }}>
        <Phone mode={s.mode} w={440} />
      </div>
      <div style={{ position: "absolute", top: 1380, right: 90 }}><Mark ok={good} delay={12} /></div>
      <Title text={s.text} top={s.top ?? 200} size={s.size ?? 80} style={s.style ?? (good ? "yellow" : "white")} />
    </AbsoluteFill>
  );
};

// Two phones side by side: a (wrong) vs b (right)
export const VsScene: React.FC<{ s: S }> = ({ s }) => {
  const f = useCurrentFrame();
  const sa = useSp(0);
  const sb = useSp(Math.round(s.dur * 30 * 0.35));
  const Col: React.FC<{ p: { mode: string; label: string }; ok: boolean; o: number }> = ({ p, ok, o }) => (
    <div style={{ width: 500, display: "flex", flexDirection: "column", alignItems: "center", opacity: o, transform: `scale(${0.6 + 0.4 * o})` }}>
      <div style={{ padding: "10px 24px", borderRadius: 14, background: ok ? GREEN : RED, color: ok ? NAVY : "white", fontFamily: FONT, fontWeight: 900, fontSize: 50, marginBottom: 40 }}>{ok ? "✓" : "✕"} {p.label}</div>
      <Phone mode={p.mode} w={330} />
    </div>
  );
  return (
    <AbsoluteFill>
      <AnimBg bg={s.bg ?? "navy"} />
      <Title text={s.text} top={170} size={s.size ?? 72} style={s.style ?? "white"} />
      <div style={{ position: "absolute", top: 520, left: 40, right: 40, display: "flex", justifyContent: "space-between" }}>
        <Col p={s.a!} ok={false} o={sa} />
        <Col p={s.b!} ok o={sb} />
      </div>
      <div style={{ position: "absolute", top: 560, left: 532, width: 16, height: 1000, background: YELLOW, opacity: interpolate(f, [0, 10], [0, 1], { extrapolateRight: "clamp" }) }} />
    </AbsoluteFill>
  );
};

// Top-down nets lane with pulsing phone spots (1 bowl side, 2 bowl front, 3 bat front, 4 bat side)
const SPOTS: Record<number, [number, number, string]> = {
  1: [270, 440, "Bowling side on"], 2: [540, 1480, "Bowling front on"],
  3: [540, 270, "Batting front on"], 4: [810, 1300, "Batting side on"],
};
export const PitchScene: React.FC<{ s: S }> = ({ s }) => {
  const f = useCurrentFrame();
  const total = Math.round(s.dur * 30);
  const spots = s.spots ?? [1, 2, 3, 4];
  const per = Math.max(1, Math.floor((total - 10) / spots.length));
  const ballY = interpolate(f % 40, [0, 40], [420, 1330]);
  const lane = useSp(0, 14, 160);
  return (
    <AbsoluteFill>
      <AnimBg bg="navy" />
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        <g transform={`translate(540 860) scale(${lane}) translate(-540 -860)`}>
          <rect x={360} y={360} width={360} height={1040} rx={10} fill={TURF} stroke="rgba(255,255,255,.35)" strokeWidth={6} strokeDasharray="18 12" />
          <rect x={440} y={380} width={200} height={1000} fill="#c9b27a" opacity={0.55} />
          {[440, 1300].map((y) => <line key={y} x1={380} y1={y} x2={700} y2={y} stroke="white" strokeWidth={6} />)}
          {[400, 1340].map((y) => [520, 540, 560].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r={7} fill={OFF} />))}
          <circle cx={545} cy={ballY} r={14} fill={RED} />
          <Batter x={540} y={1360} h={110} swing={(Math.sin(f / 6) + 1) / 2} />
        </g>
        {spots.map((n, i) => {
          const [x, y] = SPOTS[n];
          const on = f >= 8 + i * per;
          const k = on ? 1 + 0.15 * Math.sin((f - i * per) / 4) : 0;
          return (
            <g key={n} transform={`translate(${x} ${y}) scale(${k})`}>
              <circle r={60} fill={YELLOW} opacity={0.25} />
              <rect x={-24} y={-42} width={48} height={84} rx={10} fill={NAVY} stroke={YELLOW} strokeWidth={6} />
              <circle cy={-26} r={5} fill={RED} />
            </g>
          );
        })}
      </svg>
      <Title text={s.text} top={s.top ?? 150} size={s.size ?? 70} style={s.style ?? "yellow"} />
      <div style={{ position: "absolute", top: 1600, left: 0, right: 0, textAlign: "center", fontFamily: FONT, fontWeight: 900, fontSize: 60, color: "white" }}>
        {SPOTS[spots[Math.min(spots.length - 1, Math.floor(Math.max(0, f - 8) / per))]][2]}
      </div>
      {s.sub && <div style={{ position: "absolute", top: 1690, left: 60, right: 60, textAlign: "center", fontFamily: FONT, fontWeight: 800, fontSize: 44, color: YELLOW }}>{s.sub}</div>}
    </AbsoluteFill>
  );
};

// Ball flies in, stumps rattle and bails fly: a hook or a punchline
export const StumpsScene: React.FC<{ s: S }> = ({ s }) => {
  const f = useCurrentFrame();
  const hit = 14;
  const bx = interpolate(f, [0, hit], [-200, 520], { extrapolateRight: "clamp" });
  const by = interpolate(f, [0, hit], [700, 1230], { extrapolateRight: "clamp" });
  const t = Math.max(0, f - hit);
  const shake = t > 0 && t < 10 ? (random(`s${f}`) - 0.5) * 30 : 0;
  return (
    <AbsoluteFill>
      <AnimBg bg={s.bg ?? "navy"} />
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        <rect x={0} y={1420} width={1080} height={500} fill={TURF} />
        <g transform={`translate(${shake} 0)`}>
          {[440, 540, 640].map((x, i) => <rect key={x} x={x - 14} y={1000} width={28} height={420} rx={8} fill={OFF} transform={t ? `rotate(${(i - 1) * Math.min(t, 6) * 2} ${x} 1420)` : undefined} />)}
        </g>
        {[[470, -1], [610, 1]].map(([x, d]) => (
          <rect key={x} x={x - 50 + d * t * 14} y={990 - t * 22 + t * t * 0.9} width={100} height={18} rx={9} fill={YELLOW} transform={`rotate(${d * t * 25} ${x + d * t * 14} ${1000 - t * 22 + t * t * 0.9})`} />
        ))}
        {f < hit + 2 && <circle cx={bx} cy={by} r={26} fill={RED} />}
      </svg>
      <Title text={s.text} top={s.top ?? 260} size={s.size ?? 92} style={s.style ?? "yellow"} delay={hit - 4} />
      {s.sub && <Title text={s.sub} top={1560} size={54} style="navy" delay={hit + 6} />}
    </AbsoluteFill>
  );
};

// Words slam in one at a time; a word in *stars* is highlighted
export const KineticScene: React.FC<{ s: S }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = s.words ?? (s.text ?? "").split(" ");
  const gap = Math.max(4, Math.floor((s.dur * 30 * 0.6) / words.length));
  const [, fg] = BGS[s.bg ?? "yellow"] ?? BGS.yellow;
  return (
    <AbsoluteFill>
      <AnimBg bg={s.bg ?? "yellow"} />
      <div style={{ position: "absolute", top: s.top ?? 520, left: 70, right: 70, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "10px 28px" }}>
        {words.map((w, i) => {
          const sp = spring({ frame: f - i * gap, fps, config: { damping: 10, stiffness: 260 } });
          const hi = w.startsWith("*");
          return (
            <span key={i} style={{ fontFamily: FONT, fontWeight: 900, fontSize: s.size ?? 130, lineHeight: 1.05, color: hi ? (fg === "white" ? YELLOW : RED) : fg, transform: `scale(${sp}) translateY(${(1 - sp) * 80}px)`, opacity: Math.min(1, sp * 2) }}>{w.replace(/\*/g, "")}</span>
          );
        })}
      </div>
      {s.sub && <Title text={s.sub} top={1500} size={56} style={fg === "white" ? "yellow" : "navy"} delay={words.length * gap} />}
    </AbsoluteFill>
  );
};

// Animated checklist on a plain background (no photo)
export const ListScene: React.FC<{ s: S & { items?: string[][] } }> = ({ s }) => {
  const f = useCurrentFrame();
  const items = s.items ?? [];
  const gap = Math.max(10, Math.floor((s.dur * 30 - 30) / Math.max(1, items.length)));
  const ln = (d: number) => interpolate(f, [d, d + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const col = (m: string) => (m === "✕" ? RED : m === "!" ? YELLOW : GREEN);
  return (
    <AbsoluteFill>
      <AnimBg bg={s.bg ?? "navy"} />
      <Title text={s.text} top={200} size={s.size ?? 70} style={s.style ?? "yellow"} />
      <div style={{ position: "absolute", top: s.top ?? 640, left: 80, right: 60, fontFamily: FONT, fontWeight: 900, fontSize: 78, lineHeight: 1.2, color: "white" }}>
        {items.map(([m, t], i) => (
          <div key={i} style={{ display: "flex", gap: 26, alignItems: "flex-start", opacity: ln(12 + i * gap), transform: `translateX(${(1 - ln(12 + i * gap)) * -80}px)`, marginBottom: 46 }}>
            <span style={{ minWidth: 100, height: 100, borderRadius: 50, background: col(m), color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 52 }}>{m}</span>
            <span>{t}</span>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
