import { Composition } from "remotion";
import { Example } from "./Example";

export const RemotionRoot = () => {
  return (
    <Composition
      id="Example"
      component={Example}
      durationInFrames={120}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
