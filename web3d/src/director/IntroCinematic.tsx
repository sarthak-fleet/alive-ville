import { useEffect, useRef, useState } from "react";

import { cameraState, playerPosition } from "../controls/runtime.ts";
import { useUiStore } from "../store/ui.ts";
import { useWorldStore } from "../store/world.ts";
import { introCameraPose, smoothstep } from "./intro-camera.ts";
import { useDirectorStore } from "./store.ts";

const INTRO_KEY_PREFIX = "aliveville:intro:";
const REDUCED_MOTION_STATIC_MS = 2_000;

/**
 * Opening cinematic — fires once per world per browser session.
 * Triggers after StartFlow closes (gamePhase === "playing") and world is loaded.
 *
 * Controls are locked during playback (director store introCinema flag).
 * Skippable via any key or click.
 * Respects prefers-reduced-motion: shows a static 2-second title card.
 */
export function IntroCinematic() {
  const gamePhase = useUiStore((state) => state.gamePhase);
  const world = useWorldStore((state) => state.world);
  const introCinema = useDirectorStore((state) => state.introCinema);
  const beginIntroCinema = useDirectorStore((state) => state.beginIntroCinema);
  const endIntroCinema = useDirectorStore((state) => state.endIntroCinema);

  // t ∈ [0,1] progress, stored in state so React can read it during render
  const [t, setT] = useState(0);
  const rafRef = useRef<number | null>(null);
  const hasTriggeredRef = useRef(false);

  // Trigger: once gamePhase hits "playing" and world is loaded, once per world per browser
  useEffect(() => {
    if (gamePhase !== "playing" || !world) return;
    if (hasTriggeredRef.current) return;

    const key = INTRO_KEY_PREFIX + world.id;
    if (localStorage.getItem(key)) return;

    hasTriggeredRef.current = true;
    localStorage.setItem(key, "1");
    beginIntroCinema(world.id);
  }, [gamePhase, world, beginIntroCinema]);

  // Drive camera override + state-based t for smooth animation
  useEffect(() => {
    if (!introCinema) {
      cameraState.override = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startedAt = introCinema.startedAt;
    const durationMs = reducedMotion ? REDUCED_MOTION_STATIC_MS : introCinema.durationMs;
    const endIntro = endIntroCinema;

    const tick = () => {
      const elapsed = performance.now() - startedAt;
      const progress = Math.min(1, elapsed / durationMs);
      setT(progress);

      if (!reducedMotion) {
        const pose = introCameraPose(progress, { x: playerPosition.x, y: playerPosition.y, z: playerPosition.z });
        cameraState.override = pose;
      }

      if (progress >= 1) {
        cameraState.override = null;
        endIntro();
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      cameraState.override = null;
    };
  }, [introCinema, endIntroCinema]);

  // Skip: any key or click ends the cinematic immediately
  useEffect(() => {
    if (!introCinema) return;
    const endIntro = endIntroCinema;

    const skip = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      cameraState.override = null;
      endIntro();
    };

    window.addEventListener("keydown", skip, { once: true });
    window.addEventListener("pointerdown", skip, { once: true });
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [introCinema, endIntroCinema]);

  if (!introCinema || !world) return null;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const title = world.story?.title ?? world.name;
  // Use premise as logline subtitle if available, else current objective, else default tagline
  const subtitle = world.story?.premise ?? world.story?.currentObjective ?? "The world is alive. It will not wait for you.";
  const objective = world.story?.currentObjective ?? null;

  if (reducedMotion) {
    return (
      <div className="intro-cinematic" aria-live="polite">
        <div className="intro-bar top" style={{ animation: "none" }} />
        <div className="intro-bar bottom" style={{ animation: "none" }} />
        <div className="intro-title-card" style={{ opacity: 1 }}>
          <div className="intro-title">{title}</div>
          <div className="intro-subtitle">{subtitle}</div>
        </div>
        {objective ? (
          <div className="intro-objective" style={{ opacity: 1, transform: "translateX(-50%)" }}>
            <span className="intro-objective-label">Objective</span>
            {objective}
          </div>
        ) : null}
      </div>
    );
  }

  // Title card: fade in [t=0.08..0.24], hold, fade out [t=0.55..0.72]
  const titleOpacity = Math.min(
    smoothstep((t - 0.08) / 0.16),
    1 - smoothstep((t - 0.55) / 0.17)
  );

  // Objective callout: slides in [t=0.55..0.70], fades out [t=0.82..0.96]
  const objectiveIn = smoothstep(Math.max(0, (t - 0.55) / 0.15));
  const objectiveOut = smoothstep(Math.max(0, (t - 0.82) / 0.14));
  const objectiveOpacity = Math.max(0, objectiveIn - objectiveOut);
  const objectiveTranslateY = (1 - smoothstep(objectiveIn)) * 28;

  return (
    <div className="intro-cinematic" aria-live="polite">
      {/* Letterbox bars */}
      <div className="intro-bar top" />
      <div className="intro-bar bottom" />

      {/* Title card */}
      <div className="intro-title-card" style={{ opacity: titleOpacity, pointerEvents: "none" }}>
        <div className="intro-title">{title}</div>
        <div className="intro-subtitle">{subtitle}</div>
      </div>

      {/* Objective callout — teaches the player where this info lives */}
      {objective ? (
        <div
          className="intro-objective"
          style={{
            opacity: objectiveOpacity,
            transform: `translateX(-50%) translateY(${objectiveTranslateY}px)`,
            pointerEvents: "none",
          }}
        >
          <span className="intro-objective-label">Objective</span>
          {objective}
        </div>
      ) : null}

      {/* Skip hint */}
      <div className="intro-skip">Any key to skip</div>
    </div>
  );
}
