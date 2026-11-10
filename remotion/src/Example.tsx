import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const Example = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const opacity = interpolate(
    frame,
    [0, 15, durationInFrames - 15, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#101010",
        color: "#ffffff",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <h1 style={{ fontSize: 96, opacity }}>Workflow Studio</h1>
    </AbsoluteFill>
  );
};
