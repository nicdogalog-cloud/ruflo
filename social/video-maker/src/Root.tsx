import React from "react";
import { Composition } from "remotion";
import { CreaseCamTrend, TOTAL } from "./CreaseCamTrend";
import { CreaseCamV2, TOTAL2 } from "./CreaseCamV2";
import { AppExplainer, EX_TOTAL } from "./AppExplainer";
import { House, HouseSpec, hFrames } from "./House";
import { SpecVideo, VideoSpec, FPS, frames } from "./Spec";
const demo: VideoSpec = { id: "demo", scenes: [{ type: "card", dur: 2, text: "Crease Cam" }, { type: "cta", dur: 2 }] };
export const Root: React.FC = () => (
  <>
    <Composition id="CreaseCamTrend" component={CreaseCamTrend} durationInFrames={TOTAL} fps={30} width={1080} height={1920} />
    <Composition id="CreaseCamV2" component={CreaseCamV2} durationInFrames={TOTAL2} fps={30} width={1080} height={1920} />
    <Composition id="AppExplainer" component={AppExplainer} durationInFrames={EX_TOTAL} fps={30} width={1080} height={1920} defaultProps={{}} />
    <Composition id="Spec" component={SpecVideo} durationInFrames={120} fps={FPS} width={1080} height={1920} defaultProps={demo}
      calculateMetadata={({ props }) => ({ durationInFrames: props.scenes.reduce((a, s) => a + frames(s), 0) })} />
    <Composition id="House" component={House} durationInFrames={120} fps={30} width={1080} height={1920} defaultProps={{ id: "h", scenes: [{ type: "end", dur: 2 }] } as HouseSpec}
      calculateMetadata={({ props }) => ({ durationInFrames: props.scenes.reduce((a, s) => a + hFrames(s), 0) })} />
  </>
);
