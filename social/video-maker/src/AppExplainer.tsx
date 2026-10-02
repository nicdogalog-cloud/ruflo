import React from "react";
import "@fontsource/montserrat/700.css";
import "@fontsource/montserrat/800.css";
import "@fontsource/montserrat/900.css";
import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

// "How the Crease Cam app works" explainer for the owner. Fully drawn, no photos.
const NAVY = "#0f1b2d";
const NAVY2 = "#18294a";
const YELLOW = "#f2b705";
const OFF = "#eef3ec";
const GREEN = "#2ee66b";
const RED = "#ff3b3b";
const TURF = "#1f7a4a";
const FONT = "Montserrat, sans-serif";

export const SCENES = [3.6, 4.6, 4.4, 5.6, 5.8, 5.2, 5.4, 6.0, 3.8];
export const EX_FPS = 30;
export const EX_TOTAL = SCENES.reduce((a, d) => a + Math.round(d * EX_FPS), 0);

const useSp = (delay = 0, damping = 12, stiffness = 180) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - delay, fps, config: { damping, stiffness } });
};

const Bg: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 40%, ${NAVY2} 0%, ${NAVY} 70%)`, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: -400, transform: `rotate(-20deg) translateX(${(f * 2) % 160}px)`, backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 60px, transparent 60px 160px)" }} />
    </AbsoluteFill>
  );
};

// Big caption. Words wrapped in *stars* are yellow.
const Caption: React.FC<{ text: string; top?: number; size?: number; delay?: number }> = ({ text, top = 150, size = 92, delay = 0 }) => {
  const sp = useSp(delay, 13, 200);
  const parts = text.split("*");
  return (
    <div style={{ position: "absolute", top, left: 60, right: 60, textAlign: "center", fontFamily: FONT, fontWeight: 900, fontSize: size, lineHeight: 1.08, color: OFF, transform: `translateY(${(1 - sp) * 60}px)`, opacity: sp, textShadow: "0 6px 24px rgba(0,0,0,.45)" }}>
      {parts.map((p, i) => <span key={i} style={{ color: i % 2 ? YELLOW : OFF }}>{p}</span>)}
    </div>
  );
};

const Sub: React.FC<{ text: string; top: number; delay?: number; size?: number; color?: string }> = ({ text, top, delay = 0, size = 52, color = OFF }) => {
  const sp = useSp(delay, 14, 200);
  return <div style={{ position: "absolute", top, left: 50, right: 50, textAlign: "center", fontFamily: FONT, fontWeight: 800, fontSize: size, color, opacity: sp, transform: `scale(${0.85 + 0.15 * sp})` }}>{text}</div>;
};

// Logo: yellow stumps + bails inside white camera-frame corners
const Logo: React.FC<{ size: number; draw?: number }> = ({ size, draw = 1 }) => {
  const c = interpolate(draw, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });
  const s = interpolate(draw, [0.3, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const L = 70 * c;
  const corner = (x: number, y: number, dx: number, dy: number) => (
    <path d={`M ${x} ${y + dy * L} L ${x} ${y} L ${x + dx * L} ${y}`} stroke={OFF} strokeWidth={16} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  );
  return (
    <svg width={size} height={size} viewBox="0 0 300 300">
      {corner(20, 20, 1, 1)}{corner(280, 20, -1, 1)}{corner(20, 280, 1, -1)}{corner(280, 280, -1, -1)}
      <g transform={`translate(150,250) scale(1,${s}) translate(-150,-250)`}>
        {[105, 150, 195].map((x) => <rect key={x} x={x - 10} y={80} width={20} height={170} rx={8} fill={YELLOW} />)}
      </g>
      <g opacity={s}>
        <rect x={98} y={62 - (1 - s) * 30} width={50} height={12} rx={6} fill={YELLOW} />
        <rect x={152} y={62 - (1 - s) * 30} width={50} height={12} rx={6} fill={YELLOW} />
      </g>
    </svg>
  );
};

const Wordmark: React.FC<{ size: number; delay?: number }> = ({ size, delay = 0 }) => {
  const sp = useSp(delay, 14);
  return <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: size, color: OFF, letterSpacing: size * 0.08, opacity: sp, transform: `translateY(${(1 - sp) * 30}px)` }}>CREASE <span style={{ color: YELLOW }}>CAM</span></div>;
};

// Phone shell; children render inside the screen
const Phone: React.FC<{ x: number; y: number; w: number; kind?: "iphone" | "android"; children?: React.ReactNode; rot?: number; scale?: number }> = ({ x, y, w, kind = "iphone", children, rot = 0, scale = 1 }) => {
  const h = w * 2.05;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: w * 0.13, background: "#05080f", border: `${w * 0.028}px solid #2a3550`, boxShadow: "0 30px 80px rgba(0,0,0,.55)", transform: `rotate(${rot}deg) scale(${scale})`, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: w * 0.025, borderRadius: w * 0.1, overflow: "hidden", background: NAVY }}>{children}</div>
      {kind === "iphone"
        ? <div style={{ position: "absolute", top: w * 0.05, left: "50%", width: w * 0.3, height: w * 0.07, marginLeft: -w * 0.15, borderRadius: 40, background: "#000" }} />
        : <div style={{ position: "absolute", top: w * 0.055, left: "50%", width: w * 0.06, height: w * 0.06, marginLeft: -w * 0.03, borderRadius: "50%", background: "#000" }} />}
    </div>
  );
};

// Stick bowler. arm 0..1 rotates the bowling arm through delivery
const Bowler: React.FC<{ x: number; y: number; h: number; arm?: number; color?: string; dashed?: boolean; width?: number }> = ({ x, y, h, arm = 0.3, color = OFF, dashed = false, width = 7 }) => {
  const k = h / 100;
  const a = -150 + arm * 200; // bowling arm angle
  const da = dashed ? `${16 / k} ${12 / k}` : undefined;
  return (
    <g transform={`translate(${x},${y}) scale(${k})`} stroke={color} strokeWidth={width / k} strokeLinecap="round" fill="none" strokeDasharray={da}>
      <circle cx={6} cy={-90} r={10} fill={dashed ? "none" : color} />
      <line x1={4} y1={-79} x2={0} y2={-42} />
      <line x1={0} y1={-42} x2={-24} y2={0} />
      <line x1={0} y1={-42} x2={22} y2={-4} />
      <line x1={22} y1={-4} x2={34} y2={0} />
      {/* front arm (yellow line gets drawn on this one) */}
      <line x1={4} y1={-72} x2={34} y2={-96} />
      <g transform={`translate(2,-72) rotate(${a})`}><line x1={0} y1={0} x2={0} y2={-38} /></g>
    </g>
  );
};

const Stumps: React.FC<{ x: number; y: number; h: number; color?: string; dashed?: boolean }> = ({ x, y, h, color = OFF, dashed }) => (
  <g stroke={color} strokeWidth={h * 0.07} strokeLinecap="round" strokeDasharray={dashed ? "8 8" : undefined}>
    {[-1, 0, 1].map((i) => <line key={i} x1={x + i * h * 0.18} y1={y} x2={x + i * h * 0.18} y2={y - h} />)}
    <line x1={x - h * 0.2} y1={y - h - 6} x2={x + h * 0.2} y2={y - h - 6} />
  </g>
);

// Each scene springs in and pushes out at the end
const SceneWrap: React.FC<{ d: number; children: React.ReactNode }> = ({ d, children }) => {
  const f = useCurrentFrame();
  const inS = interpolate(f, [0, 8], [1.08, 1], { extrapolateRight: "clamp" });
  const outO = interpolate(f, [d - 5, d], [1, 0.0], { extrapolateLeft: "clamp" });
  const flash = interpolate(f, [0, 5], [0.35, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ transform: `scale(${inS})`, opacity: outO }}>
      <Bg />
      {children}
      <AbsoluteFill style={{ background: YELLOW, opacity: flash }} />
    </AbsoluteFill>
  );
};

// ---------------- scenes ----------------
const S1: React.FC = () => {
  const f = useCurrentFrame();
  const draw = interpolate(f, [4, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <div style={{ position: "absolute", top: 330, left: 0, right: 0, display: "flex", justifyContent: "center" }}><Logo size={440} draw={draw} /></div>
      <div style={{ position: "absolute", top: 800, left: 0, right: 0, display: "flex", justifyContent: "center" }}><Wordmark size={84} delay={18} /></div>
      <Caption text={"How the *Crease Cam* app works"} top={1080} size={104} delay={30} />
    </>
  );
};

const S2: React.FC = () => {
  const a = useSp(4); const b = useSp(10); const c = useSp(26);
  const f = useCurrentFrame();
  const flow = (f * 6) % 120;
  const screen = (label: string) => (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20 }}>
      <Logo size={150} />
      <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 30, color: OFF }}>CREASE <span style={{ color: YELLOW }}>CAM</span></div>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 26, color: "#9fb0c8" }}>{label}</div>
    </AbsoluteFill>
  );
  return (
    <>
      <Caption text={"*One app.* iPhone + Android"} top={140} size={92} />
      <div style={{ position: "absolute", left: 340, top: 410, width: 400, height: 150, borderRadius: 30, background: YELLOW, transform: `scale(${c})`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, fontWeight: 900, fontSize: 52, color: NAVY, boxShadow: "0 16px 40px rgba(0,0,0,.4)" }}>{"{ }"} Expo</div>
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }} opacity={c}>
        {[[440, 280], [640, 800]].map(([x1, x2], i) => (
          <path key={i} d={`M ${x1} 565 C ${x1} 640, ${x2} 640, ${x2} 720`} stroke={YELLOW} strokeWidth={10} fill="none" strokeDasharray="20 20" strokeDashoffset={-flow} />
        ))}
      </svg>
      <div style={{ transform: `translateX(${(1 - a) * -500}px)` }}><Phone x={120} y={740} w={330} kind="iphone">{screen("iPhone")}</Phone></div>
      <div style={{ transform: `translateX(${(1 - b) * 500}px)` }}><Phone x={630} y={740} w={330} kind="android">{screen("Android")}</Phone></div>
      <Sub text="Built once with Expo" top={1490} delay={30} size={64} color={YELLOW} />
    </>
  );
};

const DRILLS = ["Bowling – side view", "Bowling – front view", "Batting – front view", "Batting – side view"];
const S3: React.FC = () => {
  const f = useCurrentFrame();
  const ph = useSp(0);
  const tap = interpolate(f, [40, 52], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fingerY = interpolate(f, [20, 44], [1500, 760], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ring = interpolate(f, [44, 62], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <Caption text={"Pick a *drill*"} top={150} size={110} />
      <div style={{ transform: `translateY(${(1 - ph) * 900}px)` }}>
        <Phone x={190} y={380} w={700}>
          <div style={{ padding: "110px 40px 0", fontFamily: FONT }}>
            <div style={{ fontWeight: 900, fontSize: 52, color: OFF, marginBottom: 34 }}>Choose a drill</div>
            {DRILLS.map((d, i) => {
              const sp = spring({ frame: f - 6 - i * 4, fps: 30, config: { damping: 14 } });
              const sel = i === 0 && tap > 0;
              return (
                <div key={d} style={{ marginBottom: 24, padding: "30px 30px", borderRadius: 24, fontWeight: 800, fontSize: 40, background: sel ? YELLOW : "#1c2c48", color: sel ? NAVY : OFF, transform: `translateX(${(1 - sp) * 300}px) scale(${sel ? 1 + 0.05 * Math.sin(tap * Math.PI) : 1})`, opacity: sp, display: "flex", justifyContent: "space-between", alignItems: "center", border: sel ? "none" : "2px solid #2b3d60" }}>
                  <span>{d}</span><span style={{ fontSize: 44 }}>{sel ? "✓" : "›"}</span>
                </div>
              );
            })}
          </div>
        </Phone>
      </div>
      {/* tap ring + fingertip */}
      <div style={{ position: "absolute", left: 700 - 60 * ring, top: 670 - 60 * ring, width: 120 * ring + 40, height: 120 * ring + 40, borderRadius: "50%", border: `6px solid ${OFF}`, opacity: (1 - ring) * (ring > 0 ? 1 : 0) }} />
      <div style={{ position: "absolute", left: 690, top: fingerY - 70, width: 70, height: 70, borderRadius: "50%", background: "rgba(238,243,236,.85)", boxShadow: "0 0 0 10px rgba(238,243,236,.25)", opacity: interpolate(f, [16, 22, 70, 80], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }} />
    </>
  );
};

const S4: React.FC = () => {
  const f = useCurrentFrame();
  const ph = useSp(0);
  const slide = interpolate(f, [12, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ease = 1 - Math.pow(1 - slide, 3);
  const locked = f > 72;
  const rec = f > 100;
  const recT = Math.max(0, (f - 100) / 30);
  const pulse = 1 + 0.08 * Math.sin(f / 3);
  return (
    <>
      <Caption text={"Line up the *guide*, hit *record*"} top={120} size={86} />
      <div style={{ transform: `scale(${0.8 + 0.2 * ph})`, opacity: ph }}>
        <Phone x={170} y={400} w={740}>
          <AbsoluteFill style={{ background: `linear-gradient(#26406b 0%, #2c4d7a 45%, ${TURF} 45%, #18603a 100%)` }} />
          <svg width={690} height={1470} viewBox="0 0 690 1470" style={{ position: "absolute", inset: 0 }}>
            {/* pitch strip */}
            <polygon points="260,700 430,700 620,1470 70,1470" fill="#c9b27a" opacity={0.55} />
            {/* see-through guide card */}
            <g opacity={0.6}>
              <Stumps x={520} y={1060} h={250} color={YELLOW} dashed />
              <Bowler x={250} y={1150} h={430} arm={0.25} color={YELLOW} dashed width={10} />
            </g>
            {/* the real stumps + player sliding into the guide */}
            <g transform={`translate(${(1 - ease) * 160},${(1 - ease) * -90})`}>
              <Stumps x={520} y={1060} h={250} color={OFF} />
            </g>
            <g transform={`translate(${(1 - ease) * -150},${(1 - ease) * 60})`}>
              <Bowler x={250} y={1150} h={430} arm={0.25 + (rec ? 0.15 * Math.sin(f / 6) : 0)} color={OFF} width={16} />
            </g>
            {/* camera frame corners */}
            {[[40, 120, 1, 1], [650, 120, -1, 1], [40, 1300, 1, -1], [650, 1300, -1, -1]].map(([x, y, dx, dy], i) => (
              <path key={i} d={`M ${x} ${y + dy * 60} L ${x} ${y} L ${x + dx * 60} ${y}`} stroke={OFF} strokeWidth={8} fill="none" />
            ))}
          </svg>
          <div style={{ position: "absolute", top: 120, left: 0, right: 0, textAlign: "center" }}>
            <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 34, padding: "12px 26px", borderRadius: 40, background: locked ? GREEN : "rgba(0,0,0,.55)", color: locked ? NAVY : OFF }}>
              {locked ? "✓ Lined up" : "Bowling – side view"}
            </span>
          </div>
          {rec && <div style={{ position: "absolute", top: 200, left: 0, right: 0, textAlign: "center", fontFamily: FONT, fontWeight: 900, fontSize: 40, color: RED }}>● REC 00:0{Math.floor(recT)}</div>}
          <div style={{ position: "absolute", bottom: 60, left: "50%", width: 140, height: 140, marginLeft: -70, borderRadius: "50%", border: `10px solid ${OFF}`, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${locked && !rec ? pulse : 1})` }}>
            <div style={{ width: rec ? 56 : 100, height: rec ? 56 : 100, borderRadius: rec ? 12 : "50%", background: RED }} />
          </div>
        </Phone>
      </div>
    </>
  );
};

const S5: React.FC = () => {
  const f = useCurrentFrame();
  const ph = useSp(0);
  // slow-mo stepping: arm moves in visible frame steps
  const step = Math.min(6, Math.floor(f / 9));
  const arm = 0.1 + step * 0.07;
  const line = interpolate(f, [60, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ang = interpolate(f, [88, 110], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // front arm on screen: bowler at (250,1150) h=560 -> k=5.6; shoulder (4,-72), hand (34,-96)
  const k = 4.3, bx = 250, by = 1100;
  const sx = bx + 4 * k, sy = by - 72 * k, hx = bx + 34 * k, hy = by - 96 * k;
  const ex = sx + (hx - sx) * 1.35 * line, ey = sy + (hy - sy) * 1.35 * line;
  return (
    <>
      <Caption text={"Watch back in *slow-mo*"} top={120} size={90} />
      <div style={{ transform: `scale(${0.8 + 0.2 * ph})`, opacity: ph }}>
        <Phone x={200} y={360} w={680}>
          <AbsoluteFill style={{ background: `linear-gradient(#26406b 0%, #2c4d7a 45%, ${TURF} 45%, #18603a 100%)` }} />
          <svg width={690} height={1470} viewBox="0 0 690 1470" style={{ position: "absolute", inset: 0 }}>
            <polygon points="260,700 430,700 620,1470 70,1470" fill="#c9b27a" opacity={0.55} />
            <Stumps x={520} y={1030} h={250} color={OFF} />
            <Bowler x={bx} y={by} h={430} arm={arm} color={OFF} width={16} />
            {/* drawn line along front arm + horizontal reference */}
            <line x1={sx} y1={sy} x2={sx + 260 * Math.min(1, line * 1.5)} y2={sy} stroke={OFF} strokeWidth={5} strokeDasharray="14 10" opacity={0.8} />
            <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={YELLOW} strokeWidth={12} strokeLinecap="round" />
            <circle cx={sx} cy={sy} r={14} fill={YELLOW} opacity={line > 0 ? 1 : 0} />
            {ang > 0 && <path d={`M ${sx + 120} ${sy} A 120 120 0 0 0 ${sx + 120 * Math.cos(Math.atan2(hy - sy, hx - sx) * ang)} ${sy + 120 * Math.sin(Math.atan2(hy - sy, hx - sx) * ang)}`} stroke={YELLOW} strokeWidth={7} fill="none" />}
          </svg>
          {ang > 0.5 && <div style={{ position: "absolute", left: 225, top: 830, whiteSpace: "nowrap", padding: "8px 20px", borderRadius: 18, background: YELLOW, color: NAVY, fontFamily: FONT, fontWeight: 900, fontSize: 38 }}>Front arm 39°</div>}
          <div style={{ position: "absolute", top: 120, left: 40, padding: "10px 22px", borderRadius: 30, background: "rgba(0,0,0,.6)", color: YELLOW, fontFamily: FONT, fontWeight: 900, fontSize: 40 }}>0.25×</div>
          {/* scrubber */}
          <div style={{ position: "absolute", bottom: 70, left: 40, right: 40 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT, fontWeight: 800, fontSize: 36, color: OFF, marginBottom: 20 }}>
              <span>◀ frame</span><span>{`Frame ${42 + step}`}</span><span>frame ▶</span>
            </div>
            <div style={{ height: 50, borderRadius: 12, background: "rgba(0,0,0,.5)", display: "flex", gap: 6, padding: 8 }}>
              {Array.from({ length: 18 }).map((_, i) => <div key={i} style={{ flex: 1, borderRadius: 4, background: i === 5 + step ? YELLOW : "rgba(238,243,236,.3)" }} />)}
            </div>
          </div>
        </Phone>
      </div>
      <Sub text="Frame by frame. Draw lines." top={1785} delay={20} size={58} color={YELLOW} />
    </>
  );
};

const S6: React.FC = () => {
  const f = useCurrentFrame();
  const ph = useSp(0);
  const cross = interpolate(f, [28, 42], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const arrowY = interpolate(f, [0, 26], [0, -60], { extrapolateRight: "clamp" });
  const items = ["Private", "Safe for under-18s", "Nothing uploaded"];
  return (
    <>
      <Caption text={"Videos *stay on your phone*"} top={130} size={92} />
      <div style={{ transform: `scale(${ph})` }}>
        <Phone x={140} y={500} w={360}>
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
            <svg width={220} height={260} viewBox="0 0 220 260">
              <path d="M110 10 L200 45 V120 C200 185 160 225 110 250 C60 225 20 185 20 120 V45 Z" fill={YELLOW} />
              <rect x={70} y={115} width={80} height={65} rx={10} fill={NAVY} />
              <path d="M85 115 V95 a25 25 0 0 1 50 0 V115" stroke={NAVY} strokeWidth={14} fill="none" />
            </svg>
          </AbsoluteFill>
        </Phone>
      </div>
      {/* cloud with blocked upload */}
      <svg width={420} height={340} viewBox="0 0 420 340" style={{ position: "absolute", left: 580, top: 560, opacity: ph }}>
        <path d="M100 200 a70 70 0 0 1 20 -135 a90 90 0 0 1 170 20 a60 60 0 0 1 20 115 Z" fill="none" stroke="#7d8fae" strokeWidth={14} />
        <g transform={`translate(0,${arrowY})`} opacity={1 - cross * 0.5}>
          <line x1={210} y1={320} x2={210} y2={220} stroke={OFF} strokeWidth={16} strokeLinecap="round" />
          <path d="M170 255 L210 215 L250 255" stroke={OFF} strokeWidth={16} fill="none" strokeLinecap="round" />
        </g>
        <circle cx={210} cy={210} r={110 * cross} fill="none" stroke={RED} strokeWidth={18} />
        <line x1={210 - 78 * cross} y1={210 - 78 * cross} x2={210 + 78 * cross} y2={210 + 78 * cross} stroke={RED} strokeWidth={18} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", top: 1330, left: 120, right: 60 }}>
        {items.map((t, i) => {
          const sp = spring({ frame: f - 40 - i * 10, fps: 30, config: { damping: 13 } });
          return (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 30, marginBottom: 34, opacity: sp, transform: `translateX(${(1 - sp) * -200}px)`, fontFamily: FONT, fontWeight: 900, fontSize: 64, color: OFF }}>
              <div style={{ width: 76, height: 76, borderRadius: "50%", background: GREEN, color: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>✓</div>{t}
            </div>
          );
        })}
      </div>
    </>
  );
};

const S7: React.FC = () => {
  const f = useCurrentFrame();
  const cards: [string, string, boolean][] = [["Free", "to start", false], ["£3.99", "a month", false], ["£39.99", "a year", true]];
  return (
    <>
      <Caption text={"Simple *pricing*"} top={150} size={110} />
      {cards.map(([p, l, best], i) => {
        const sp = spring({ frame: f - 6 - i * 8, fps: 30, config: { damping: 12 } });
        return (
          <div key={p} style={{ position: "absolute", left: 140, right: 140, top: 420 + i * 330, height: 280, borderRadius: 40, background: best ? YELLOW : "#1c2c48", border: best ? "none" : "3px solid #2f4470", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 60px", transform: `scale(${sp})`, boxShadow: "0 20px 50px rgba(0,0,0,.4)", fontFamily: FONT }}>
            <div style={{ fontWeight: 900, fontSize: 120, color: best ? NAVY : OFF }}>{p}</div>
            <div style={{ fontWeight: 800, fontSize: 50, color: best ? NAVY : "#b8c6db", textAlign: "right" }}>{l}</div>
          </div>
        );
      })}
      <Sub text="Paid through the App Store or Google Play" top={1470} delay={30} size={52} />
    </>
  );
};

const STEPS = ["Test version", "Club pilot", "Payments", "App stores"];
const S8: React.FC = () => {
  const f = useCurrentFrame();
  const fill = interpolate(f, [8, 140], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const top = 430, gap = 300;
  return (
    <>
      <Caption text={"The *plan*"} top={150} size={120} />
      <div style={{ position: "absolute", left: 238, top: top + 70, width: 14, height: gap * 3, background: "#2b3d60", borderRadius: 7 }} />
      <div style={{ position: "absolute", left: 238, top: top + 70, width: 14, height: gap * 3 * fill, background: YELLOW, borderRadius: 7 }} />
      {STEPS.map((t, i) => {
        const sp = spring({ frame: f - 6 - i * 30, fps: 30, config: { damping: 12 } });
        const on = sp > 0.5;
        return (
          <div key={t} style={{ position: "absolute", left: 170, top: top + i * gap, display: "flex", alignItems: "center", gap: 50, fontFamily: FONT }}>
            <div style={{ width: 150, height: 150, borderRadius: "50%", background: on ? YELLOW : "#1c2c48", color: on ? NAVY : OFF, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 80, transform: `scale(${0.6 + 0.4 * sp})`, boxShadow: on ? "0 0 40px rgba(242,183,5,.45)" : "none" }}>{i + 1}</div>
            <div style={{ fontWeight: 900, fontSize: 80, color: OFF, opacity: sp, transform: `translateX(${(1 - sp) * 80}px)` }}>{t}</div>
          </div>
        );
      })}
    </>
  );
};

const S9: React.FC = () => {
  const f = useCurrentFrame();
  const draw = interpolate(f, [0, 26], [0, 1], { extrapolateRight: "clamp" });
  const pulse = 1 + 0.035 * Math.sin(f / 4);
  const sp = useSp(26);
  return (
    <>
      <div style={{ position: "absolute", top: 380, left: 0, right: 0, display: "flex", justifyContent: "center" }}><Logo size={500} draw={draw} /></div>
      <div style={{ position: "absolute", top: 920, left: 0, right: 0, display: "flex", justifyContent: "center" }}><Wordmark size={96} delay={14} /></div>
      <div style={{ position: "absolute", top: 1170, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ padding: "30px 70px", background: YELLOW, color: NAVY, borderRadius: 80, fontFamily: FONT, fontWeight: 900, fontSize: 80, transform: `scale(${sp * pulse})` }}>Coming soon</div>
      </div>
    </>
  );
};

const LIST = [S1, S2, S3, S4, S5, S6, S7, S8, S9];

export const AppExplainer: React.FC<{ audio?: string }> = ({ audio }) => {
  let at = 0;
  return (
    <AbsoluteFill style={{ background: NAVY }}>
      {LIST.map((C, i) => {
        const d = Math.round(SCENES[i] * EX_FPS);
        const from = at; at += d;
        return <Sequence key={i} from={from} durationInFrames={d}><SceneWrap d={d}><C /></SceneWrap></Sequence>;
      })}
      {audio && <Audio src={staticFile(audio)} />}
    </AbsoluteFill>
  );
};
