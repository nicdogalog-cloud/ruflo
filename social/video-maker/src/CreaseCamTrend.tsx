import React from "react";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/800.css";
import "@fontsource/montserrat/900.css";
import {
  AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile,
  useCurrentFrame, useVideoConfig, Easing,
} from "remotion";

const NAVY = "#0f1b2d";
const YELLOW = "#f2b705";
const WHITE = "#eef3ec";
const FONT = "Montserrat, sans-serif";

// Scene timings in frames @30fps (22s total)
const S = { hook: 150, coach: 105, guide: 135, angles: 120, private: 75, end: 75 };
export const TOTAL = Object.values(S).reduce((a, b) => a + b, 0);

const fadeIn = (f: number, d = 8) => interpolate(f, [0, d], [0, 1], { extrapolateRight: "clamp" });

const KenBurns: React.FC<{ src: string; from?: number; to?: number; dim?: number; pos?: string }> = ({ src, from = 1.05, to = 1.18, dim = 0.35, pos = "center" }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const s = interpolate(f, [0, durationInFrames], [from, to]);
  return (
    <AbsoluteFill style={{ backgroundColor: NAVY, overflow: "hidden" }}>
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: pos, transform: `scale(${s})` }} />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(15,27,45,${dim + 0.25}) 0%, rgba(15,27,45,${dim}) 45%, rgba(15,27,45,${dim + 0.4}) 100%)` }} />
    </AbsoluteFill>
  );
};

// Word-by-word caption in the TikTok trend style
const TrendCaption: React.FC = () => {
  const f = useCurrentFrame();
  const lines = [["you", "met", "me", "at", "a", "very"], ["crease", "cam", "time", "in", "my", "life"]];
  let i = 0;
  return (
    <div style={{ position: "absolute", top: 100, left: 30, right: 30, textAlign: "center", fontFamily: FONT, fontWeight: 800 }}>
      {lines.map((ln, li) => (
        <div key={li} style={{ fontSize: 66, lineHeight: 1.25, whiteSpace: "nowrap", color: "white", textShadow: "0 0 12px rgba(0,0,0,.8), 0 4px 0 #000" }}>
          {ln.map((w) => {
            const at = 6 + i++ * 5;
            const o = interpolate(f, [at, at + 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const hl = w === "crease" || w === "cam";
            return (
              <span key={w + at} style={{ opacity: o, color: hl ? YELLOW : "white", margin: "0 9px", display: "inline-block", transform: `translateY(${(1 - o) * 12}px)` }}>{w}</span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

const Headline: React.FC<{ text: string; top?: number; size?: number; color?: string; delay?: number }> = ({ text, top = 260, size = 92, color = WHITE, delay = 0 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame: f - delay, fps, config: { damping: 14 } });
  return (
    <div style={{ position: "absolute", top, left: 70, right: 70, textAlign: "center", fontFamily: FONT, fontWeight: 900, fontSize: size, lineHeight: 1.08, color, opacity: sp, transform: `translateY(${(1 - sp) * 40}px)`, textShadow: "0 4px 18px rgba(0,0,0,.55)" }}>
      {text}
    </div>
  );
};

const Sub: React.FC<{ text: string; top: number; delay?: number; size?: number; color?: string }> = ({ text, top, delay = 0, size = 50, color = WHITE }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "absolute", top, left: 80, right: 80, textAlign: "center", fontFamily: FONT, fontWeight: 600, fontSize: size, lineHeight: 1.25, color, opacity: fadeIn(f - delay, 10) }}>{text}</div>
  );
};

const Card: React.FC<{ src: string; top: number; delay?: number; width?: number }> = ({ src, top, delay = 0, width = 940 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame: f - delay, fps, config: { damping: 15 } });
  return (
    <Img src={staticFile(src)} style={{ position: "absolute", top, left: (1080 - width) / 2, width, borderRadius: 28, border: `6px solid ${YELLOW}`, boxShadow: "0 24px 60px rgba(0,0,0,.5)", opacity: sp, transform: `scale(${0.85 + 0.15 * sp})` }} />
  );
};

const Hook: React.FC = () => (
  <AbsoluteFill>
    <KenBurns src="nets-batter-front.jpg" from={1.0} to={1.12} dim={0.05} pos="center 70%" />
    <TrendCaption />
  </AbsoluteFill>
);

const Coach: React.FC = () => (
  <AbsoluteFill>
    <KenBurns src="match-front-foot-drive.jpg" from={1.25} to={1.4} dim={0.25} pos="62% center" />
    <Headline text="Film yourself like a coach" top={300} />
    <Sub text="Batting & bowling, filmed on your own phone 🏏📱" top={1500} delay={12} />
  </AbsoluteFill>
);

const Guide: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: NAVY }}>
    <Headline text="Not sure where to put your phone?" top={230} size={80} />
    <Card src="guide-all-spots.jpg" top={620} delay={10} />
    <Sub text="Guide cards show you the exact spot at the nets" top={1340} delay={25} size={52} color={YELLOW} />
  </AbsoluteFill>
);

const Angles: React.FC = () => {
  const f = useCurrentFrame();
  const cards = ["guide-1-bowling-side.jpg", "guide-2-bowling-front.jpg", "guide-3-batting-front.jpg", "guide-4-batting-side.jpg"];
  const per = 27;
  const idx = Math.min(cards.length - 1, Math.floor(f / per));
  return (
    <AbsoluteFill style={{ backgroundColor: NAVY }}>
      <Headline text="Batting. Bowling. Every angle." top={250} size={84} color={YELLOW} />
      {cards.map((c, i) => (
        <Sequence key={c} from={i * per} durationInFrames={i === cards.length - 1 ? 1000 : per} layout="none">
          <Card src={c} top={640} />
        </Sequence>
      ))}
      <div style={{ position: "absolute", top: 1480, width: "100%", textAlign: "center", fontFamily: FONT, fontWeight: 800, fontSize: 44, color: WHITE }}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} style={{ display: "inline-block", width: 26, height: 26, borderRadius: 13, margin: "0 12px", background: i === idx ? YELLOW : "rgba(238,243,236,.3)" }} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Private: React.FC = () => (
  <AbsoluteFill>
    <KenBurns src="wicketkeeper-crouch.jpg" from={1.3} to={1.4} dim={0.5} pos="40% center" />
    <Headline text="Your videos stay on your phone" top={520} size={88} />
    <Sub text="Free to start · Pro £3.99/month" top={1240} delay={14} size={58} color={YELLOW} />
  </AbsoluteFill>
);

const End: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame: f, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ backgroundColor: NAVY, alignItems: "center" }}>
      <Img src={staticFile("logo.png")} style={{ position: "absolute", top: 420, width: 640, height: 640, borderRadius: 40, transform: `scale(${0.8 + 0.2 * sp})`, opacity: sp }} />
      <Sub text="Coming soon" top={1170} delay={10} size={72} color={WHITE} />
      <Sub text="@creasecam" top={1280} delay={18} size={60} color={YELLOW} />
    </AbsoluteFill>
  );
};

export const CreaseCamTrend: React.FC = () => {
  const order: [React.FC, number][] = [[Hook, S.hook], [Coach, S.coach], [Guide, S.guide], [Angles, S.angles], [Private, S.private], [End, S.end]];
  let at = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: NAVY }}>
      {order.map(([C, d], i) => {
        const from = at;
        at += d;
        return (
          <Sequence key={i} from={from} durationInFrames={d}>
            <Fade d={d}><C /></Fade>
          </Sequence>
        );
      })}
      <Audio src={staticFile("beat.wav")} />
    </AbsoluteFill>
  );
};

const Fade: React.FC<{ d: number; children: React.ReactNode }> = ({ d, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 6, d - 6, d], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};
