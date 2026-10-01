import React from "react";
import "@fontsource/montserrat/800.css";
import "@fontsource/montserrat/900.css";
import {
  AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile,
  useCurrentFrame, useVideoConfig, random,
} from "remotion";

// Problem → solution format: bold "stop doing this" hook, fast fail cuts,
// then the fix, the payoff and an action CTA. ~1s cuts, captions on every shot.
const NAVY = "#0f1b2d";
const YELLOW = "#f2b705";
const RED = "#ff3b3b";
const GREEN = "#2ee66b";
const FONT = "Montserrat, sans-serif";

const T = { hook: 45, fail1: 27, fail2: 27, fail3: 27, turn: 45, guides: 144, payoff: 105, priv: 81, cta: 99 };
export const TOTAL2 = Object.values(T).reduce((a, b) => a + b, 0);

// Big caption with a pop-in
const Cap: React.FC<{ children: React.ReactNode; top?: number; size?: number; bg?: string; color?: string; delay?: number; rot?: number }> = ({ children, top = 260, size = 84, bg = "white", color = "#111", delay = 0, rot = 0 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame: f - delay, fps, config: { damping: 11, stiffness: 220 } });
  return (
    <div style={{ position: "absolute", top, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <div style={{ maxWidth: 920, padding: "14px 30px", background: bg, color, fontFamily: FONT, fontWeight: 900, fontSize: size, lineHeight: 1.08, textAlign: "center", borderRadius: 18, transform: `scale(${sp}) rotate(${rot}deg)`, boxShadow: "0 10px 30px rgba(0,0,0,.35)" }}>
        {children}
      </div>
    </div>
  );
};

const Photo: React.FC<{ src: string; scale?: number; rotate?: number; blur?: number; pos?: string; shake?: number; dim?: number; zoomTo?: number }> = ({ src, scale = 1.1, rotate = 0, blur = 0, pos = "center", shake = 0, dim = 0.15, zoomTo }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const s = zoomTo ? interpolate(f, [0, durationInFrames], [scale, zoomTo]) : scale;
  const dx = shake ? (random(`x${f}`) - 0.5) * shake : 0;
  const dy = shake ? (random(`y${f}`) - 0.5) * shake : 0;
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {scale < 1 && <Img src={staticFile(src)} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", filter: "blur(30px) brightness(.5)", transform: "scale(1.2)" }} />}
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: pos, transform: `translate(${dx}px,${dy}px) scale(${s}) rotate(${rotate}deg)`, filter: blur ? `blur(${blur}px)` : undefined }} />
      <AbsoluteFill style={{ background: `rgba(0,0,0,${dim})` }} />
    </AbsoluteFill>
  );
};

const RecUI: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "absolute", top: 150, left: 70, display: "flex", alignItems: "center", gap: 14, fontFamily: FONT, fontWeight: 800, fontSize: 40, color: "white" }}>
      <div style={{ width: 26, height: 26, borderRadius: 13, background: RED, opacity: Math.floor(f / 8) % 2 ? 1 : 0.3 }} />
      REC 00:0{Math.floor(f / 30) + 3}
    </div>
  );
};

const Stamp: React.FC<{ ok?: boolean }> = ({ ok }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame: f - 3, fps, config: { damping: 9, stiffness: 260 } });
  return (
    <div style={{ position: "absolute", top: 820, left: 0, right: 0, textAlign: "center", fontSize: 300, transform: `scale(${1.6 - 0.6 * sp})`, opacity: sp, color: ok ? GREEN : RED, fontFamily: FONT, fontWeight: 900, textShadow: "0 0 40px rgba(0,0,0,.6)" }}>
      {ok ? "✓" : "✕"}
    </div>
  );
};

const Hook: React.FC = () => (
  <AbsoluteFill>
    <Photo src="match-front-foot-drive.jpg" scale={0.62} rotate={-9} blur={3} shake={26} dim={0.35} />
    <RecUI />
    <Cap top={330} size={88} bg={RED} color="white">STOP filming your nets like this</Cap>
  </AbsoluteFill>
);

const Fail: React.FC<{ src: string; label: string; scale?: number; rotate?: number; blur?: number; pos?: string; thumb?: boolean }> = ({ src, label, thumb, ...p }) => (
  <AbsoluteFill>
    <Photo src={src} shake={14} dim={0.3} {...p} />
    {thumb && (
      <div style={{ position: "absolute", left: -120, bottom: 120, width: 620, height: 900, borderRadius: "50%", background: "radial-gradient(ellipse at 60% 40%, #e6b48f 0%, #c98d66 55%, #8a5a3e 100%)", filter: "blur(28px)", transform: "rotate(25deg)" }} />
    )}
    <RecUI />
    <Stamp />
    <Cap top={330} size={80} bg="white" color={RED} rot={-2}>{label}</Cap>
  </AbsoluteFill>
);

const Turn: React.FC = () => {
  const f = useCurrentFrame();
  const flash = interpolate(f, [0, 5], [1, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: YELLOW }}>
      <Cap top={640} size={120} bg="transparent" color={NAVY}>Do THIS instead 👇</Cap>
      <AbsoluteFill style={{ background: "white", opacity: flash }} />
    </AbsoluteFill>
  );
};

const GUIDES: [string, string][] = [
  ["guide-1-bowling-side.jpg", "Bowling · side on"],
  ["guide-2-bowling-front.jpg", "Bowling · front on"],
  ["guide-3-batting-front.jpg", "Batting · front on"],
  ["guide-4-batting-side.jpg", "Batting · side on"],
];

const Guides: React.FC = () => {
  const f = useCurrentFrame();
  const per = 36;
  return (
    <AbsoluteFill style={{ background: NAVY }}>
      {GUIDES.map(([src, label], i) => (
        <Sequence key={src} from={i * per} durationInFrames={per} layout="none">
          <GuideShot src={src} label={label} n={i + 1} />
        </Sequence>
      ))}
      <div style={{ position: "absolute", top: 1560, left: 0, right: 0, textAlign: "center", fontFamily: FONT, fontWeight: 800, fontSize: 42, color: "white", padding: "0 60px" }}>
        Exactly where the phone goes. Every angle.
      </div>
      <div style={{ position: "absolute", top: 1650, left: 0, right: 0, textAlign: "center" }}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} style={{ display: "inline-block", width: 24, height: 24, borderRadius: 12, margin: "0 10px", background: i === Math.floor(f / per) ? YELLOW : "rgba(255,255,255,.3)" }} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

const GuideShot: React.FC<{ src: string; label: string; n: number }> = ({ src, label, n }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame: f, fps, config: { damping: 13, stiffness: 200 } });
  const zoom = interpolate(f, [0, 36], [1, 1.08]);
  return (
    <>
      <Cap top={240} size={78} bg={YELLOW} color={NAVY}>{`${n}. ${label}`}</Cap>
      <div style={{ position: "absolute", top: 520, left: 40, width: 1000, height: 840, overflow: "hidden", borderRadius: 30, border: `6px solid ${YELLOW}`, transform: `translateX(${(1 - sp) * 600}px)` }}>
        <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` }} />
      </div>
    </>
  );
};

const Payoff: React.FC = () => {
  const f = useCurrentFrame();
  const line = (d: number) => interpolate(f, [d, d + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Photo src="nets-batter-front.jpg" scale={1.0} zoomTo={1.12} dim={0.15} pos="center 70%" />
      <svg width={1080} height={1920} style={{ position: "absolute" }}>
        <circle cx={420} cy={560} r={115 * line(8)} stroke={GREEN} strokeWidth={8} fill="none" />
      </svg>
      <Cap top={140} size={62} bg="white" color="#111">Now you can actually see what you're doing wrong</Cap>
      <div style={{ position: "absolute", top: 1380, left: 90, fontFamily: FONT, fontWeight: 900, fontSize: 58, color: "white", textShadow: "0 3px 12px #000" }}>
        <div style={{ opacity: line(30) }}><span style={{ color: GREEN }}>✓</span> Head still</div>
        <div style={{ opacity: line(48) }}><span style={{ color: GREEN }}>✓</span> Bat straight</div>
        <div style={{ opacity: line(66) }}><span style={{ color: YELLOW }}>!</span> Front foot to the ball</div>
      </div>
    </AbsoluteFill>
  );
};

const Private: React.FC = () => (
  <AbsoluteFill style={{ background: NAVY }}>
    <Cap top={560} size={96} bg="transparent" color="white">Free to start.</Cap>
    <Cap top={820} size={74} bg={YELLOW} color={NAVY} delay={10}>Your videos never leave your phone 🔒</Cap>
  </AbsoluteFill>
);

const CTA: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame: f, fps, config: { damping: 12 } });
  const pulse = 1 + 0.04 * Math.sin(f / 4);
  return (
    <AbsoluteFill style={{ background: NAVY }}>
      <Img src={staticFile("logo.png")} style={{ position: "absolute", top: 300, left: 250, width: 580, height: 580, borderRadius: 40, transform: `scale(${0.7 + 0.3 * sp})` }} />
      <div style={{ position: "absolute", top: 980, left: 0, right: 0, textAlign: "center", fontFamily: FONT, fontWeight: 900, fontSize: 64, color: "white" }}>App coming soon</div>
      <div style={{ position: "absolute", top: 1120, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ padding: "26px 54px", background: YELLOW, color: NAVY, borderRadius: 60, fontFamily: FONT, fontWeight: 900, fontSize: 64, transform: `scale(${pulse})` }}>Follow @creasecam</div>
      </div>
    </AbsoluteFill>
  );
};

export const CreaseCamV2: React.FC = () => {
  const order: [React.ReactNode, number][] = [
    [<Hook />, T.hook],
    [<Fail src="match-front-foot-drive.jpg" label="Too far away" scale={0.55} pos="center" />, T.fail1],
    [<Fail src="nets-batter-front.jpg" label="Wrong angle" rotate={24} scale={1.5} pos="center 90%" />, T.fail2],
    [<Fail src="wicketkeeper-crouch.jpg" label="Thumb in the shot" scale={1.3} blur={2} thumb />, T.fail3],
    [<Turn />, T.turn],
    [<Guides />, T.guides],
    [<Payoff />, T.payoff],
    [<Private />, T.priv],
    [<CTA />, T.cta],
  ];
  let at = 0;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {order.map(([node, d], i) => {
        const from = at;
        at += d;
        return <Sequence key={i} from={from} durationInFrames={d}>{node}</Sequence>;
      })}
      <Audio src={staticFile("beat2.wav")} />
    </AbsoluteFill>
  );
};
