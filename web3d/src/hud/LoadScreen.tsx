import { useProgress } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";

interface Props {
  /** True while the world API fetch or initial 3-D asset load is in progress. */
  worldLoading: boolean;
}

const PHASES = ["waking the world…", "loading characters…", "entering aliveville…"] as const;

function phaseFor(progress: number): number {
  if (progress >= 80) return 2;
  if (progress >= 30) return 1;
  return 0;
}

/**
 * Full-screen loading overlay that replaces the inline HTML splash seamlessly.
 * Removed via a 300 ms fade once `worldLoading` is false and drei assets are ready.
 */
export function LoadScreen({ worldLoading }: Props) {
  const { progress, active } = useProgress();
  const phase = phaseFor(progress);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start fade-out when the world is loaded and drei has no active items
  useEffect(() => {
    if (!worldLoading && !active) {
      // Short grace period so the final frame renders before we fade
      timerRef.current = setTimeout(() => {
        setVisible(false);
        // Remove the inline splash too (it may still be in the DOM)
        const splash = document.getElementById("splash");
        if (splash) splash.remove();
      }, 300);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [worldLoading, active]);

  if (!visible) return null;

  return (
    <div
      className="screen-center"
      style={{
        zIndex: 9998,
        transition: "opacity 0.3s ease",
        opacity: visible ? 1 : 0,
      }}
    >
      <div style={{ fontSize: 13, opacity: 0.65 }}>{PHASES[phase]}</div>
      {progress > 0 && progress < 100 ? (
        <div
          style={{
            width: 120,
            height: 2,
            background: "rgba(255,255,255,0.12)",
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              background: "rgba(120,170,255,0.7)",
              transition: "width 0.4s ease",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
