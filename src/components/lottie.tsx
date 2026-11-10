"use client";

import { useSyncExternalStore } from "react";
import { Lottie } from "lottie-react";

function subscribeMotion(callback: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const serverMotion = () => true;

export function LogoIntro({ size = 96 }: { size?: number }) {
  const reduced = useSyncExternalStore(subscribeMotion, reducedMotion, serverMotion);
  return (
    <span className="openmotion-animation" style={{ width: size, height: size }} aria-hidden="true">
      <Lottie key={reduced ? "static" : "animated"} src="/lootieopenmotion.json" autoplay={!reduced} loop={!reduced} style={{ width: "100%", height: "100%" }} />
    </span>
  );
}
