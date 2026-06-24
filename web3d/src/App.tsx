import './hud/hud.css';

import { useEffect } from 'react';

import { useLocalBrain } from './ai/local-llm.ts';
import { DownloadsIndicator } from './hud/DownloadsIndicator.tsx';
import { Hud } from './hud/Hud.tsx';
import { LoadScreen } from './hud/LoadScreen.tsx';
import { Onboarding } from './hud/Onboarding.tsx';
import { StartFlow } from './hud/StartFlow.tsx';
import { kokoroPreload } from './platform/kokoro.ts';
import { GameWorld } from './scene/GameWorld.tsx';
import { useUiStore } from './store/ui.ts';
import { useWorldStore } from './store/world.ts';

export function App() {
  const world = useWorldStore((state) => state.world);
  const loading = useWorldStore((state) => state.loading);
  const error = useWorldStore((state) => state.error);
  const init = useWorldStore((state) => state.init);
  const gamePhase = useUiStore((state) => state.gamePhase);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const disconnect = useWorldStore.getState().connectLive();
    return disconnect;
  }, []);

  // Preload the in-browser models at app start so they download in the background
  // during the title/start screen and are ready by the player's first conversation
  // — no first-use stall. Progress shows in the DownloadsIndicator. Both loaders
  // are idempotent. The brain needs WebGPU; Kokoro has a WASM fallback so it
  // always preloads (it self-disables to Web Speech if it can't load).
  useEffect(() => {
    void (async () => {
      const brain = useLocalBrain.getState();
      const caps = brain.caps ?? (await brain.detect());
      if (caps.webgpu && useLocalBrain.getState().status === 'idle')
        void useLocalBrain.getState().load();
    })();
    kokoroPreload();
  }, []);

  // Remove the inline HTML splash as soon as React has mounted — the
  // LoadScreen component takes over from here, giving a seamless handoff.
  useEffect(() => {
    const splash = document.getElementById('splash');
    if (splash) {
      splash.classList.add('splash-hide');
      const timer = setTimeout(() => splash.remove(), 320);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  if (loading && !world) {
    return <LoadScreen worldLoading={true} />;
  }

  if (!world) {
    return (
      <div className="screen-center">
        <div>{error ?? 'Could not reach the world server.'}</div>
        <div style={{ opacity: 0.6, fontSize: 13 }}>
          Is the simulation server running? (pnpm dev:server)
        </div>
        <button type="button" onClick={() => void init()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Overlay that fades out once 3-D assets finish loading */}
      <LoadScreen worldLoading={false} />
      <GameWorld world={world} />
      {gamePhase === 'playing' ? <Hud /> : null}
      <Onboarding />
      <StartFlow />
      <DownloadsIndicator />
    </div>
  );
}
