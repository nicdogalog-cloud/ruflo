import React from "react";
import { Composition } from "remotion";
import { CreaseCamTrend, TOTAL } from "./CreaseCamTrend";
export const Root: React.FC = () => (
  <Composition id="CreaseCamTrend" component={CreaseCamTrend} durationInFrames={TOTAL} fps={30} width={1080} height={1920} />
);
