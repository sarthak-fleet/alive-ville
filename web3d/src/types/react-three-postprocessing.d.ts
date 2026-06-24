// Local typings for @react-three/postprocessing: its shipped .d.ts uses
// extensionless relative re-exports, which moduleResolution NodeNext cannot
// resolve, leaving the module typed as empty. Mapped here via tsconfig paths.
import type { ReactElement, ReactNode, RefObject } from 'react';

export interface EffectComposerProps {
  children?: ReactNode;
  enabled?: boolean;
  multisampling?: number;
  autoClear?: boolean;
  stencilBuffer?: boolean;
  depthBuffer?: boolean;
  resolutionScale?: number;
}

export function EffectComposer(
  props: EffectComposerProps & { ref?: RefObject<unknown> }
): ReactElement;

export interface BloomProps {
  intensity?: number;
  luminanceThreshold?: number;
  luminanceSmoothing?: number;
  mipmapBlur?: boolean;
  radius?: number;
  levels?: number;
}

export function Bloom(props: BloomProps): ReactElement;

export interface VignetteProps {
  offset?: number;
  darkness?: number;
  eskil?: boolean;
}

export function Vignette(props: VignetteProps): ReactElement;

export function FXAA(props: Record<string, never>): ReactElement;

export function ToneMapping(props: { mode?: number }): ReactElement;
