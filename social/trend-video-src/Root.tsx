import React from "react";
import { Composition } from "remotion";
import { CreaseCamTrend, TOTAL } from "./CreaseCamTrend";
import { CreaseCamV2, TOTAL2 } from "./CreaseCamV2";
export const Root: React.FC = () => (
  <>
    <Composition id="CreaseCamTrend" component={CreaseCamTrend} durationInFrames={TOTAL} fps={30} width={1080} height={1920} />
    <Composition id="CreaseCamV2" component={CreaseCamV2} durationInFrames={TOTAL2} fps={30} width={1080} height={1920} />
  </>
);
