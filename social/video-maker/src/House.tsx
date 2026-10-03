import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame } from "remotion";
import { NAVY, YELLOW, OFF, GREEN, RED, TURF, FONT, useSp, Caption, Sub, Logo, Wordmark, Phone, Bowler, Stumps, SceneWrap } from "./AppExplainer";

// House style (from the app explainer), driven by a JSON spec: videos/*.json with "composition": "House".
// Explainers and "in the nets" stories. Every scene is drawn; no photos.
export type HScene = {
  type: "logo" | "nets" | "think" | "drill" | "guide" | "slowmo" | "tracks" | "spots" | "privacy" | "pricing" | "end" | "steps";
  dur: number; vo?: string;
  text?: string; sub?: string; actor?: "batter" | "bowler"; outcome?: "edge" | "middle" | "beaten";
  pick?: number; label?: string; items?: string[]; fault?: string; good?: boolean; spots?: number[]; drill?: string;
};
export type HouseSpec = { id: string; audio?: string; scenes: HScene[] };
export const hFrames = (s: HScene) => Math.round(s.dur * 30);

const STEEL = "#7d8fae";

// Side-on batter facing left. swing 0..1 (backlift -> follow-through); lean moves the head toward off side
export const Batter: React.FC<{ x: number; y: number; h: number; swing?: number; lean?: number; color?: string; width?: number; dashed?: boolean }> = ({ x, y, h, swing = 0, lean = 0, color = OFF, width = 7, dashed }) => {
  const k = h / 100;
  const a = -150 + swing * 300;
  const hx = -8 + lean * 22;
  return (
    <g transform={`translate(${x},${y}) scale(${k})`} stroke={color} strokeWidth={width / k} strokeLinecap="round" fill="none" strokeDasharray={dashed ? `${16 / k} ${12 / k}` : undefined}>
      <circle cx={hx} cy={-90} r={10} fill={dashed ? "none" : color} />
      <line x1={hx + 2} y1={-79} x2={0} y2={-44} />
      <line x1={0} y1={-44} x2={-26} y2={-14} /><line x1={-26} y1={-14} x2={-30} y2={0} />
      <line x1={0} y1={-44} x2={16} y2={0} />
      <line x1={hx + 1} y1={-72} x2={-6} y2={-58} />
      <g transform={`translate(-6,-58) rotate(${a})`}><line x1={0} y1={0} x2={0} y2={44} stroke={YELLOW} strokeWidth={10 / k} strokeDasharray={undefined} /></g>
    </g>
  );
};

// Side view of a net lane: bowler left, batter + stumps right, ball flies in
const NetsScene: React.FC<{ s: HScene }> = ({ s }) => {
  const f = useCurrentFrame();
  const bowler = s.actor === "bowler";
  const loop = 54;
  const t = f % loop;
  const run = interpolate(t, [0, 14], [0, 1], { extrapolateRight: "clamp" });
  const fly = interpolate(t, [14, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const after = interpolate(t, [34, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bx0 = 260, by0 = 930, bx1 = 760, by1 = 1150;
  let ballX = bx0 + (bx1 - bx0) * fly;
  let ballY = by0 + (by1 - by0) * fly - Math.sin(fly * Math.PI) * 40;
  const out = s.outcome ?? "middle";
  if (t >= 34) {
    if (out === "edge") { ballX = bx1 + after * 260; ballY = by1 - after * 420; }
    else if (out === "middle") { ballX = bx1 - after * 700; ballY = by1 - after * 120; }
    else { ballX = bx1 + after * 120; ballY = by1 + after * 40; }
  }
  const swing = interpolate(t, [24, 38], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const flash = out !== "middle" && t > 34 && t < 46;
  return (
    <>
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        <rect x={60} y={600} width={960} height={700} rx={20} fill="#0b1626" stroke={STEEL} strokeWidth={6} />
        {Array.from({ length: 24 }).map((_, i) => <line key={`v${i}`} x1={60 + i * 40} y1={600} x2={60 + i * 40} y2={1300} stroke="rgba(125,143,174,.18)" strokeWidth={3} />)}
        {Array.from({ length: 18 }).map((_, i) => <line key={`h${i}`} x1={60} y1={600 + i * 40} x2={1020} y2={600 + i * 40} stroke="rgba(125,143,174,.18)" strokeWidth={3} />)}
        <rect x={60} y={1230} width={960} height={70} fill={TURF} />
        <rect x={160} y={1230} width={760} height={18} fill="#c9b27a" opacity={0.7} />
        <Stumps x={880} y={1236} h={170} color={OFF} />
        {bowler
          ? <Bowler x={200 + run * 60} y={1236} h={330} arm={interpolate(t, [6, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} color={OFF} width={12} />
          : <Bowler x={200} y={1236} h={300} arm={0.6} color={STEEL} width={10} />}
        {bowler
          ? <Batter x={810} y={1236} h={300} swing={swing * 0.6} color={STEEL} width={10} />
          : <Batter x={800} y={1236} h={340} swing={swing} lean={s.good ? 0 : 0.9} color={OFF} width={12} />}
        {t >= 12 && <circle cx={ballX} cy={ballY} r={16} fill={RED} />}
      </svg>
      {flash && <div style={{ position: "absolute", top: 1360, left: 0, right: 0, textAlign: "center", fontFamily: FONT, fontWeight: 900, fontSize: 84, color: bowler ? GREEN : RED }}>{out === "edge" ? "EDGED 😩" : bowler ? "BEAT THE BAT 🎯" : "BEATEN 😩"}</div>}
      {out === "middle" && t > 36 && <div style={{ position: "absolute", top: 1360, left: 0, right: 0, textAlign: "center", fontFamily: FONT, fontWeight: 900, fontSize: 90, color: GREEN }}>MIDDLED ✓</div>}
      {s.text && <Caption text={s.text} top={170} size={86} />}
      {s.sub && <Sub text={s.sub} top={1560} delay={12} size={56} color={YELLOW} />}
    </>
  );
};

// Player with a thought bubble
const ThinkScene: React.FC<{ s: HScene }> = ({ s }) => {
  const f = useCurrentFrame();
  const sp = useSp(6, 11, 200);
  return (
    <>
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        <rect x={0} y={1500} width={1080} height={420} fill={TURF} opacity={0.6} />
        {s.actor === "bowler"
          ? <Bowler x={420} y={1500} h={620} arm={0.15} color={OFF} width={18} />
          : <Batter x={460} y={1500} h={620} swing={0.5 + 0.03 * Math.sin(f / 6)} color={OFF} width={18} />}
        {[[560, 820, 22], [610, 760, 32]].map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r * sp} fill={OFF} />)}
      </svg>
      <div style={{ position: "absolute", top: 380, left: 360, right: 60, padding: "40px 46px", borderRadius: 60, background: OFF, color: NAVY, fontFamily: FONT, fontWeight: 900, fontSize: 70, lineHeight: 1.1, transform: `scale(${sp})`, transformOrigin: "20% 100%" }}>{s.label}</div>
      {s.text && <Caption text={s.text} top={150} size={80} />}
    </>
  );
};

const DRILLS = ["Bowling – side view", "Bowling – front view", "Batting – front view", "Batting – side view"];
const DrillScene: React.FC<{ s: HScene }> = ({ s }) => {
  const f = useCurrentFrame();
  const ph = useSp(0);
  const pick = (s.pick ?? 1) - 1;
  const tap = interpolate(f, [30, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <Caption text={s.text ?? "Pick a *drill*"} top={150} size={100} />
      <div style={{ transform: `translateY(${(1 - ph) * 900}px)` }}>
        <Phone x={190} y={400} w={700}>
          <div style={{ padding: "110px 40px 0", fontFamily: FONT }}>
            <div style={{ fontWeight: 900, fontSize: 52, color: OFF, marginBottom: 34 }}>Choose a drill</div>
            {DRILLS.map((d, i) => {
              const sp = spring({ frame: f - 4 - i * 4, fps: 30, config: { damping: 14 } });
              const sel = i === pick && tap > 0;
              return (
                <div key={d} style={{ marginBottom: 24, padding: "30px", borderRadius: 24, fontWeight: 800, fontSize: 40, background: sel ? YELLOW : "#1c2c48", color: sel ? NAVY : OFF, transform: `translateX(${(1 - sp) * 300}px)`, opacity: sp, display: "flex", justifyContent: "space-between", border: sel ? "none" : "2px solid #2b3d60" }}>
                  <span>{d}</span><span>{sel ? "✓" : "›"}</span>
                </div>
              );
            })}
          </div>
        </Phone>
      </div>
    </>
  );
};

// Camera with see-through guide; the player slides into it, then records
const GuideScene: React.FC<{ s: HScene }> = ({ s }) => {
  const f = useCurrentFrame();
  const ph = useSp(0);
  const slide = interpolate(f, [8, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const e = 1 - Math.pow(1 - slide, 3);
  const locked = f > 52; const rec = f > 70;
  const bat = s.actor === "batter";
  const Fig = (p: { color: string; dashed?: boolean; width: number }) => bat
    ? <Batter x={380} y={1150} h={460} swing={rec ? 0.2 + 0.2 * Math.sin(f / 6) : 0.1} {...p} />
    : <Bowler x={250} y={1150} h={430} arm={0.25} {...p} />;
  return (
    <>
      <Caption text={s.text ?? "Line up the *guide*"} top={120} size={84} />
      <div style={{ transform: `scale(${0.8 + 0.2 * ph})`, opacity: ph }}>
        <Phone x={170} y={400} w={740}>
          <AbsoluteFill style={{ background: `linear-gradient(#26406b 0%, #2c4d7a 45%, ${TURF} 45%, #18603a 100%)` }} />
          <svg width={690} height={1470} viewBox="0 0 690 1470" style={{ position: "absolute", inset: 0 }}>
            <polygon points="260,700 430,700 620,1470 70,1470" fill="#c9b27a" opacity={0.55} />
            <g opacity={0.6}><Stumps x={bat ? 560 : 520} y={1060} h={250} color={YELLOW} dashed /><Fig color={YELLOW} dashed width={10} /></g>
            <g transform={`translate(${(1 - e) * 160},${(1 - e) * -90})`}><Stumps x={bat ? 560 : 520} y={1060} h={250} color={OFF} /></g>
            <g transform={`translate(${(1 - e) * -150},${(1 - e) * 60})`}><Fig color={OFF} width={16} /></g>
          </svg>
          <div style={{ position: "absolute", top: 120, left: 0, right: 0, textAlign: "center" }}>
            <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 34, padding: "12px 26px", borderRadius: 40, background: locked ? GREEN : "rgba(0,0,0,.55)", color: locked ? NAVY : OFF }}>{locked ? "✓ Lined up" : (s.drill ?? (bat ? "Batting – side view" : "Bowling – side view"))}</span>
          </div>
          {rec && <div style={{ position: "absolute", top: 200, left: 0, right: 0, textAlign: "center", fontFamily: FONT, fontWeight: 900, fontSize: 40, color: RED }}>● REC</div>}
        </Phone>
      </div>
      {s.sub && <Sub text={s.sub} top={270} delay={14} size={50} color={YELLOW} />}
    </>
  );
};

// Slow-mo review with a drawn line that shows the fault (or the fix when good)
const SlowmoScene: React.FC<{ s: HScene }> = ({ s }) => {
  const f = useCurrentFrame();
  const ph = useSp(0);
  const step = Math.min(6, Math.floor(f / 8));
  const line = interpolate(f, [30, 54], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tag = f > 56;
  const bat = s.actor !== "bowler";
  const good = !!s.good;
  const col = good ? GREEN : YELLOW;
  const k = 4.6, x = 360, y = 1150;
  const foot = s.fault === "foot";
  const lean = good || foot ? 0 : 0.9;
  const headX = x + (-8 + lean * 22) * k, headY = y - 90 * k, footX = x - 30 * k;
  return (
    <>
      <Caption text={s.text ?? "Watch back in *slow-mo*"} top={120} size={86} />
      <div style={{ transform: `scale(${0.8 + 0.2 * ph})`, opacity: ph }}>
        <Phone x={200} y={360} w={680}>
          <AbsoluteFill style={{ background: `linear-gradient(#26406b 0%, #2c4d7a 45%, ${TURF} 45%, #18603a 100%)` }} />
          <svg width={690} height={1470} viewBox="0 0 690 1470" style={{ position: "absolute", inset: 0 }}>
            <polygon points="260,700 430,700 620,1470 70,1470" fill="#c9b27a" opacity={0.55} />
            {bat ? <>
              <Stumps x={560} y={1060} h={250} color={OFF} />
              <Batter x={x} y={y} h={460} swing={0.15 + step * 0.06} lean={lean} color={OFF} width={16} />
              {foot ? <>
                {/* where the front foot should land vs where it did */}
                <ellipse cx={good ? footX : footX - 150} cy={y + 6} rx={70 * line} ry={26 * line} fill="none" stroke={good ? GREEN : YELLOW} strokeWidth={8} strokeDasharray="16 10" />
                {!good && line > 0.6 && <path d={`M ${footX - 10} ${y - 60} L ${footX - 130} ${y - 60} M ${footX - 105} ${y - 80} L ${footX - 132} ${y - 60} L ${footX - 105} ${y - 40}`} stroke={RED} strokeWidth={10} fill="none" strokeLinecap="round" />}
                <circle cx={footX} cy={y - 4} r={34 * line} fill="none" stroke={good ? GREEN : RED} strokeWidth={8} />
              </> : <>
                <line x1={footX} y1={y} x2={footX} y2={y - (y - headY + 60) * line} stroke={col} strokeWidth={10} strokeDasharray="22 14" />
                {!good && line > 0.9 && <path d={`M ${footX + 10} ${headY} L ${headX - 20} ${headY}`} stroke={RED} strokeWidth={12} markerEnd="" />}
                <circle cx={headX} cy={headY} r={70 * line} fill="none" stroke={good ? GREEN : RED} strokeWidth={8} />
              </>}
            </> : <>
              <Stumps x={520} y={1030} h={250} color={OFF} />
              <Bowler x={250} y={1100} h={430} arm={0.1 + step * 0.07} color={OFF} width={16} />
              {s.fault === "follow" ? <>
                {/* follow-through: dashed arc where the momentum should carry; red bar where it stops */}
                <path d="M 400 1085 Q 500 930 620 1085" fill="none" stroke={good ? GREEN : YELLOW} strokeWidth={10} strokeDasharray="20 14" opacity={line} />
                {good && line > 0.9 && <path d="M 592 1050 L 622 1088 L 576 1092" fill="none" stroke={GREEN} strokeWidth={10} strokeLinecap="round" />}
                {!good && line > 0.6 && <><line x1={430} y1={960} x2={430} y2={1110} stroke={RED} strokeWidth={16} strokeLinecap="round" /><circle cx={400} cy={1096} r={34 * line} fill="none" stroke={RED} strokeWidth={8} /></>}
              </> : <line x1={250 + 4 * 4.3} y1={1100 - 72 * 4.3} x2={250 + 4 * 4.3 + (good ? 180 : 140) * line} y2={1100 - 72 * 4.3 + (good ? -150 : 40) * line} stroke={col} strokeWidth={12} strokeLinecap="round" />}
            </>}
          </svg>
          {tag && <div style={{ position: "absolute", left: 40, right: 40, top: bat ? 860 : 300, textAlign: "center" }}><span style={{ padding: "10px 24px", borderRadius: 18, background: good ? GREEN : RED, color: good ? NAVY : "white", fontFamily: FONT, fontWeight: 900, fontSize: 44 }}>{s.label}</span></div>}
          <div style={{ position: "absolute", top: 120, left: 40, padding: "10px 22px", borderRadius: 30, background: "rgba(0,0,0,.6)", color: YELLOW, fontFamily: FONT, fontWeight: 900, fontSize: 40 }}>0.25×</div>
          <div style={{ position: "absolute", bottom: 70, left: 40, right: 40, height: 50, borderRadius: 12, background: "rgba(0,0,0,.5)", display: "flex", gap: 6, padding: 8 }}>
            {Array.from({ length: 18 }).map((_, i) => <div key={i} style={{ flex: 1, borderRadius: 4, background: i === 5 + step ? YELLOW : "rgba(238,243,236,.3)" }} />)}
          </div>
        </Phone>
      </div>
      {s.sub && <Sub text={s.sub} top={1790} delay={18} size={54} color={YELLOW} />}
    </>
  );
};

// Top-down lane: where the balls landed. good = tight on the stumps, else sprayed down leg
const TracksScene: React.FC<{ s: HScene }> = ({ s }) => {
  const f = useCurrentFrame();
  const good = !!s.good;
  const pts = good ? [[540, 1180], [552, 1150], [528, 1200], [546, 1170], [536, 1140], [556, 1190]] : [[660, 1150], [430, 1210], [700, 1100], [620, 1240], [690, 1190], [400, 1120]];
  return (
    <>
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        <rect x={340} y={420} width={400} height={1100} rx={14} fill={TURF} stroke="rgba(255,255,255,.3)" strokeWidth={6} strokeDasharray="18 12" />
        <rect x={430} y={440} width={220} height={1060} fill="#c9b27a" opacity={0.55} />
        {[480, 1440].map((yy) => <line key={yy} x1={360} y1={yy} x2={720} y2={yy} stroke="white" strokeWidth={6} />)}
        {[440, 1480].map((yy) => [520, 540, 560].map((xx) => <circle key={`${xx}${yy}`} cx={xx} cy={yy} r={8} fill={OFF} />))}
        {pts.map(([px, py], i) => {
          const d = 6 + i * 9;
          const p = interpolate(f, [d, d + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          if (p <= 0) return null;
          return <g key={i}>
            <line x1={540} y1={500} x2={540 + (px - 540) * p} y2={500 + (py - 500) * p} stroke={good ? GREEN : RED} strokeWidth={5} opacity={0.6} />
            <circle cx={540 + (px - 540) * p} cy={500 + (py - 500) * p} r={20} fill={good ? GREEN : RED} />
          </g>;
        })}
      </svg>
      {s.text && <Caption text={s.text} top={150} size={84} />}
      {s.sub && <Sub text={s.sub} top={1600} delay={20} size={58} color={good ? GREEN : YELLOW} />}
    </>
  );
};

// Top-down lane with the 4 guide-card phone spots popping in
const SPOTS: Record<number, [number, number, string]> = { 1: [260, 520, "Bowling side"], 2: [540, 1560, "Bowling front"], 3: [540, 380, "Batting front"], 4: [820, 1400, "Batting side"] };
const SpotsScene: React.FC<{ s: HScene }> = ({ s }) => {
  const f = useCurrentFrame();
  const list = s.spots ?? [1, 2, 3, 4];
  return (
    <>
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        <rect x={360} y={450} width={360} height={1050} rx={14} fill={TURF} stroke="rgba(255,255,255,.3)" strokeWidth={6} strokeDasharray="18 12" />
        <rect x={440} y={470} width={200} height={1010} fill="#c9b27a" opacity={0.55} />
        {[510, 1420].map((yy) => <line key={yy} x1={380} y1={yy} x2={700} y2={yy} stroke="white" strokeWidth={6} />)}
        {list.map((n, i) => {
          const [px, py] = SPOTS[n];
          const sp = spring({ frame: f - 8 - i * 12, fps: 30, config: { damping: 10 } });
          return <g key={n} transform={`translate(${px} ${py}) scale(${sp})`}>
            <circle r={70} fill={YELLOW} opacity={0.25 + 0.1 * Math.sin(f / 4)} />
            <rect x={-28} y={-48} width={56} height={96} rx={12} fill={NAVY} stroke={YELLOW} strokeWidth={7} />
            <circle cy={-30} r={6} fill={RED} />
          </g>;
        })}
      </svg>
      {list.map((n, i) => {
        const [px, py, l] = SPOTS[n];
        const sp = spring({ frame: f - 14 - i * 12, fps: 30, config: { damping: 14 } });
        const left = px < 540 ? 30 : px > 540 ? 760 : 610;
        return <div key={n} style={{ position: "absolute", left, top: px === 540 ? py - 26 : py + 70, width: px === 540 ? 380 : 300, textAlign: px === 540 ? "left" : "center", fontFamily: FONT, fontWeight: 900, fontSize: 40, color: OFF, opacity: sp }}>{l}</div>;
      })}
      {s.text && <Caption text={s.text} top={150} size={84} />}
    </>
  );
};

const PrivacyScene: React.FC<{ s: HScene }> = ({ s }) => {
  const f = useCurrentFrame();
  const ph = useSp(0);
  const items = ["Private", "Nothing uploaded", "Safe for under-18s"];
  return (
    <>
      <Caption text={s.text ?? "Videos *stay on your phone*"} top={140} size={90} />
      <div style={{ position: "absolute", top: 470, left: 0, right: 0, display: "flex", justifyContent: "center", transform: `scale(${ph})` }}>
        <svg width={360} height={420} viewBox="0 0 220 260">
          <path d="M110 10 L200 45 V120 C200 185 160 225 110 250 C60 225 20 185 20 120 V45 Z" fill={YELLOW} />
          <rect x={70} y={115} width={80} height={65} rx={10} fill={NAVY} />
          <path d="M85 115 V95 a25 25 0 0 1 50 0 V115" stroke={NAVY} strokeWidth={14} fill="none" />
        </svg>
      </div>
      <div style={{ position: "absolute", top: 1030, left: 140, right: 60 }}>
        {items.map((t, i) => {
          const sp = spring({ frame: f - 14 - i * 9, fps: 30, config: { damping: 13 } });
          return <div key={t} style={{ display: "flex", alignItems: "center", gap: 30, marginBottom: 40, opacity: sp, transform: `translateX(${(1 - sp) * -200}px)`, fontFamily: FONT, fontWeight: 900, fontSize: 66, color: OFF }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: GREEN, color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 50 }}>✓</div>{t}
          </div>;
        })}
      </div>
    </>
  );
};

const PricingScene: React.FC<{ s: HScene }> = ({ s }) => {
  const f = useCurrentFrame();
  const cards: [string, string, boolean][] = [["Free", "to start", true], ["£3.99", "a month", false], ["£39.99", "a year", false]];
  return (
    <>
      <Caption text={s.text ?? "*Free* to start"} top={150} size={104} />
      {cards.map(([p, l, hi], i) => {
        const sp = spring({ frame: f - 6 - i * 7, fps: 30, config: { damping: 12 } });
        return <div key={p} style={{ position: "absolute", left: 140, right: 140, top: 430 + i * 320, height: 270, borderRadius: 40, background: hi ? YELLOW : "#1c2c48", border: hi ? "none" : "3px solid #2f4470", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 60px", transform: `scale(${sp})`, fontFamily: FONT }}>
          <div style={{ fontWeight: 900, fontSize: 116, color: hi ? NAVY : OFF }}>{p}</div>
          <div style={{ fontWeight: 800, fontSize: 50, color: hi ? NAVY : "#b8c6db" }}>{l}</div>
        </div>;
      })}
    </>
  );
};

const LogoScene: React.FC<{ s: HScene }> = ({ s }) => {
  const f = useCurrentFrame();
  const draw = interpolate(f, [2, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <div style={{ position: "absolute", top: 330, left: 0, right: 0, display: "flex", justifyContent: "center" }}><Logo size={420} draw={draw} /></div>
      <div style={{ position: "absolute", top: 780, left: 0, right: 0, display: "flex", justifyContent: "center" }}><Wordmark size={80} delay={12} /></div>
      {s.text && <Caption text={s.text} top={1050} size={100} delay={18} />}
    </>
  );
};

const EndScene: React.FC<{ s: HScene }> = ({ s }) => {
  const f = useCurrentFrame();
  const draw = interpolate(f, [0, 22], [0, 1], { extrapolateRight: "clamp" });
  const sp = useSp(18);
  const pulse = 1 + 0.035 * Math.sin(f / 4);
  return (
    <>
      <div style={{ position: "absolute", top: 330, left: 0, right: 0, display: "flex", justifyContent: "center" }}><Logo size={460} draw={draw} /></div>
      <div style={{ position: "absolute", top: 830, left: 0, right: 0, display: "flex", justifyContent: "center" }}><Wordmark size={90} delay={10} /></div>
      <Sub text={s.text ?? "App coming soon"} top={1030} delay={14} size={64} />
      <div style={{ position: "absolute", top: 1170, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ padding: "28px 60px", background: YELLOW, color: NAVY, borderRadius: 80, fontFamily: FONT, fontWeight: 900, fontSize: 66, transform: `scale(${sp * pulse})` }}>{s.sub ?? "Follow @creasecam07"}</div>
      </div>
    </>
  );
};

// Numbered step cards popping in one after another (items[]); the first `pick` cards only if set
const StepsScene: React.FC<{ s: HScene }> = ({ s }) => {
  const f = useCurrentFrame();
  const items = s.items ?? [];
  const gap = Math.max(6, Math.floor((s.dur * 30 * 0.55) / Math.max(1, items.length)));
  return (
    <>
      {s.text && <Caption text={s.text} top={170} size={96} />}
      {items.map((t, i) => {
        const sp = spring({ frame: f - 6 - i * gap, fps: 30, config: { damping: 11, stiffness: 190 } });
        const hi = s.pick === i + 1;
        return (
          <div key={i} style={{ position: "absolute", left: 90, right: 90, top: 520 + i * 330, height: 270, borderRadius: 40, background: hi ? YELLOW : "#1c2c48", border: hi ? "none" : "3px solid #2f4470", display: "flex", alignItems: "center", gap: 46, padding: "0 50px", transform: `translateX(${(1 - sp) * (i % 2 ? 700 : -700)}px)`, boxShadow: "0 20px 50px rgba(0,0,0,.4)", fontFamily: FONT }}>
            <div style={{ minWidth: 150, height: 150, borderRadius: "50%", background: hi ? NAVY : YELLOW, color: hi ? YELLOW : NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 90 }}>{i + 1}</div>
            <div style={{ fontWeight: 900, fontSize: 68, lineHeight: 1.05, color: hi ? NAVY : OFF }}>{t}</div>
          </div>
        );
      })}
      {s.sub && <Sub text={s.sub} top={1560} delay={gap * items.length + 6} size={58} color={YELLOW} />}
    </>
  );
};

const RENDER: Record<HScene["type"], React.FC<{ s: HScene }>> = {
  logo: LogoScene, nets: NetsScene, think: ThinkScene, drill: DrillScene, guide: GuideScene, slowmo: SlowmoScene,
  tracks: TracksScene, spots: SpotsScene, privacy: PrivacyScene, pricing: PricingScene, end: EndScene, steps: StepsScene,
};

export const House: React.FC<HouseSpec> = ({ scenes, audio }) => {
  let at = 0;
  return (
    <AbsoluteFill style={{ background: NAVY }}>
      {scenes.map((s, i) => {
        const d = hFrames(s); const from = at; at += d;
        const C = RENDER[s.type];
        return <Sequence key={i} from={from} durationInFrames={d}><SceneWrap d={d}><C s={s} /></SceneWrap></Sequence>;
      })}
      {audio && <Audio src={staticFile(audio)} />}
    </AbsoluteFill>
  );
};
