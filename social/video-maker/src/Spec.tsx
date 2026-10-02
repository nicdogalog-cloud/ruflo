import React from "react";
import "@fontsource/montserrat/800.css";
import "@fontsource/montserrat/900.css";
import {
  AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile,
  useCurrentFrame, useVideoConfig, random,
} from "remotion";
import { PhoneScene, VsScene, PitchScene, StumpsScene, KineticScene, ListScene } from "./Anim";

// Data-driven Crease Cam short. Each video is a JSON spec (videos/*.json):
// a list of scenes, each with a type, a duration in seconds and its own props.
const NAVY = "#0f1b2d";
const YELLOW = "#f2b705";
const RED = "#ff3b3b";
const GREEN = "#2ee66b";
const FONT = "Montserrat, sans-serif";
const COLORS: Record<string, [string, string]> = {
  red: [RED, "white"], white: ["white", "#111"], yellow: [YELLOW, NAVY],
  navy: [NAVY, "white"], green: [GREEN, NAVY], clear: ["transparent", "white"],
};

export type Look = { scale?: number; rotate?: number; blur?: number; pos?: string; shake?: number; dim?: number; zoomTo?: number };
export type Scene = {
  type: "photo" | "card" | "guides" | "checks" | "split" | "cta" | "phone" | "vs" | "pitch" | "stumps" | "kinetic" | "list";
  dur: number; vo?: string;
  photo?: string; look?: Look; text?: string; sub?: string; style?: string;
  top?: number; size?: number; rec?: boolean; stamp?: "x" | "ok"; thumb?: boolean;
  bg?: string; items?: string[][]; guides?: number[]; caption?: string;
  a?: { photo: string; look?: Look; label: string }; b?: { photo: string; look?: Look; label: string };
  // animated types (src/Anim.tsx)
  words?: string[]; mode?: string; spots?: number[];
};
export type VideoSpec = { id: string; audio?: string; scenes: Scene[] };
export const FPS = 30;
export const frames = (s: Scene) => Math.round(s.dur * FPS);

const Cap: React.FC<{ children: React.ReactNode; top?: number; size?: number; style?: string; delay?: number; rot?: number }> = ({ children, top = 300, size = 84, style = "white", delay = 0, rot = 0 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame: f - delay, fps, config: { damping: 11, stiffness: 220 } });
  const [bg, color] = COLORS[style] ?? COLORS.white;
  return (
    <div style={{ position: "absolute", top, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
      <div style={{ maxWidth: 940, padding: "14px 30px", background: bg, color, fontFamily: FONT, fontWeight: 900, fontSize: size, lineHeight: 1.08, textAlign: "center", borderRadius: 18, transform: `scale(${sp}) rotate(${rot}deg)`, boxShadow: bg === "transparent" ? undefined : "0 10px 30px rgba(0,0,0,.35)", textShadow: bg === "transparent" ? "0 4px 18px rgba(0,0,0,.5)" : undefined }}>
        {children}
      </div>
    </div>
  );
};

const Photo: React.FC<{ src: string } & Look> = ({ src, scale = 1.1, rotate = 0, blur = 0, pos = "center", shake = 0, dim = 0.15, zoomTo }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const s = zoomTo ? interpolate(f, [0, durationInFrames], [scale, zoomTo]) : scale;
  const dx = shake ? (random(`x${f}`) - 0.5) * shake : 0;
  const dy = shake ? (random(`y${f}`) - 0.5) * shake : 0;
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {s < 1 && <Img src={staticFile(src)} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", filter: "blur(30px) brightness(.5)", transform: "scale(1.2)" }} />}
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

const PhotoScene: React.FC<{ s: Scene }> = ({ s }) => (
  <AbsoluteFill>
    <Photo src={s.photo!} {...s.look} />
    {s.thumb && <div style={{ position: "absolute", left: -120, bottom: 120, width: 620, height: 900, borderRadius: "50%", background: "radial-gradient(ellipse at 60% 40%, #e6b48f 0%, #c98d66 55%, #8a5a3e 100%)", filter: "blur(28px)", transform: "rotate(25deg)" }} />}
    {s.rec && <RecUI />}
    {s.stamp && <Stamp ok={s.stamp === "ok"} />}
    {s.text && <Cap top={s.top ?? 300} size={s.size ?? 80} style={s.style ?? "white"} rot={s.stamp === "x" ? -2 : 0}>{s.text}</Cap>}
    {s.sub && <Cap top={1500} size={52} style="navy" delay={8}>{s.sub}</Cap>}
  </AbsoluteFill>
);

const CardScene: React.FC<{ s: Scene }> = ({ s }) => {
  const f = useCurrentFrame();
  const flash = interpolate(f, [0, 5], [1, 0], { extrapolateRight: "clamp" });
  const [bg, fg] = COLORS[s.bg ?? "yellow"] ?? COLORS.yellow;
  return (
    <AbsoluteFill style={{ background: bg }}>
      <div style={{ position: "absolute", top: s.top ?? 600, left: 0, right: 0 }}>
        <Cap top={0} size={s.size ?? 110} style="clear"><span style={{ color: fg, textShadow: "none" }}>{s.text}</span></Cap>
      </div>
      {s.sub && <Cap top={(s.top ?? 600) + 420} size={66} style={s.bg === "yellow" ? "navy" : "yellow"} delay={10}>{s.sub}</Cap>}
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

const GuidesScene: React.FC<{ s: Scene }> = ({ s }) => {
  const f = useCurrentFrame();
  const list = (s.guides ?? [1, 2, 3, 4]).map((n) => GUIDES[n - 1]);
  const per = Math.floor(frames(s) / list.length);
  return (
    <AbsoluteFill style={{ background: NAVY }}>
      {list.map(([src, label], i) => (
        <Sequence key={src} from={i * per} durationInFrames={per} layout="none">
          <GuideShot src={src} label={label} per={per} />
        </Sequence>
      ))}
      <div style={{ position: "absolute", top: 1560, left: 0, right: 0, textAlign: "center", fontFamily: FONT, fontWeight: 800, fontSize: 44, color: "white", padding: "0 60px" }}>
        {s.caption ?? "Exactly where the phone goes."}
      </div>
      <div style={{ position: "absolute", top: 1660, left: 0, right: 0, textAlign: "center" }}>
        {list.map((_, i) => (
          <span key={i} style={{ display: "inline-block", width: 24, height: 24, borderRadius: 12, margin: "0 10px", background: i === Math.min(list.length - 1, Math.floor(f / per)) ? YELLOW : "rgba(255,255,255,.3)" }} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

const GuideShot: React.FC<{ src: string; label: string; per: number }> = ({ src, label, per }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame: f, fps, config: { damping: 13, stiffness: 200 } });
  const zoom = interpolate(f, [0, per], [1, 1.08]);
  return (
    <>
      <Cap top={240} size={78} style="yellow">{label}</Cap>
      <div style={{ position: "absolute", top: 520, left: 40, width: 1000, height: 840, overflow: "hidden", borderRadius: 30, border: `6px solid ${YELLOW}`, transform: `translateX(${(1 - sp) * 600}px)` }}>
        <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` }} />
      </div>
    </>
  );
};

// Photo with a title and ticked lines appearing one by one. items: [mark, text], mark ✓ ✕ ! or a number
const ChecksScene: React.FC<{ s: Scene }> = ({ s }) => {
  const f = useCurrentFrame();
  const items = s.items ?? [];
  const gap = Math.max(10, Math.floor((frames(s) - 30) / Math.max(1, items.length)));
  const line = (d: number) => interpolate(f, [d, d + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const markColor = (m: string) => (m === "✕" ? RED : m === "!" ? YELLOW : GREEN);
  return (
    <AbsoluteFill>
      <Photo src={s.photo!} scale={1.0} zoomTo={1.1} dim={0.45} {...s.look} />
      {s.text && <Cap top={150} size={s.size ?? 64} style={s.style ?? "white"}>{s.text}</Cap>}
      <div style={{ position: "absolute", top: s.top ?? 1050, left: 80, right: 60, fontFamily: FONT, fontWeight: 900, fontSize: 60, lineHeight: 1.25, color: "white", textShadow: "0 3px 12px #000" }}>
        {items.map(([m, t], i) => (
          <div key={i} style={{ opacity: line(15 + i * gap), transform: `translateX(${(1 - line(15 + i * gap)) * -60}px)`, marginBottom: 18 }}>
            <span style={{ color: markColor(m) }}>{m}</span> {t}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// Before (top) vs after (bottom)
const SplitScene: React.FC<{ s: Scene }> = ({ s }) => {
  const f = useCurrentFrame();
  const half = Math.floor(frames(s) * 0.35);
  const show = interpolate(f, [half, half + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const Half: React.FC<{ p: NonNullable<Scene["a"]>; top: number; good: boolean; o: number }> = ({ p, top, good, o }) => (
    <div style={{ position: "absolute", top, left: 0, width: 1080, height: 960, overflow: "hidden", opacity: o }}>
      <AbsoluteFill><Photo src={p.photo} {...p.look} /></AbsoluteFill>
      <div style={{ position: "absolute", top: 40, left: 40, padding: "10px 26px", borderRadius: 14, background: good ? GREEN : RED, color: good ? NAVY : "white", fontFamily: FONT, fontWeight: 900, fontSize: 60 }}>
        {good ? "✓" : "✕"} {p.label}
      </div>
    </div>
  );
  return (
    <AbsoluteFill style={{ background: NAVY }}>
      <Half p={s.a!} top={0} good={false} o={1} />
      <Half p={s.b!} top={960} good o={show} />
      <div style={{ position: "absolute", top: 952, left: 0, width: 1080, height: 16, background: YELLOW }} />
    </AbsoluteFill>
  );
};

const CTAScene: React.FC<{ s: Scene }> = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame: f, fps, config: { damping: 12 } });
  const pulse = 1 + 0.04 * Math.sin(f / 4);
  return (
    <AbsoluteFill style={{ background: NAVY }}>
      <Img src={staticFile("logo.png")} style={{ position: "absolute", top: 300, left: 250, width: 580, height: 580, borderRadius: 40, transform: `scale(${0.7 + 0.3 * sp})` }} />
      <div style={{ position: "absolute", top: 980, left: 0, right: 0, textAlign: "center", fontFamily: FONT, fontWeight: 900, fontSize: 64, color: "white" }}>{s.text ?? "App coming soon"}</div>
      <div style={{ position: "absolute", top: 1120, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ padding: "26px 54px", background: YELLOW, color: NAVY, borderRadius: 60, fontFamily: FONT, fontWeight: 900, fontSize: 60, transform: `scale(${pulse})` }}>{s.sub ?? "Follow @creasecam07"}</div>
      </div>
    </AbsoluteFill>
  );
};

const RENDER: Record<Scene["type"], React.FC<{ s: Scene }>> = {
  photo: PhotoScene, card: CardScene, guides: GuidesScene, checks: ChecksScene, split: SplitScene, cta: CTAScene,
  phone: PhoneScene as React.FC<{ s: Scene }>, vs: VsScene as unknown as React.FC<{ s: Scene }>, pitch: PitchScene as React.FC<{ s: Scene }>,
  stumps: StumpsScene as React.FC<{ s: Scene }>, kinetic: KineticScene as React.FC<{ s: Scene }>, list: ListScene as React.FC<{ s: Scene }>,
};

export const SpecVideo: React.FC<VideoSpec> = ({ scenes, audio }) => {
  let at = 0;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {scenes.map((s, i) => {
        const from = at;
        const d = frames(s);
        at += d;
        const C = RENDER[s.type];
        return <Sequence key={i} from={from} durationInFrames={d}><C s={s} /></Sequence>;
      })}
      {audio && <Audio src={staticFile(audio)} />}
    </AbsoluteFill>
  );
};
