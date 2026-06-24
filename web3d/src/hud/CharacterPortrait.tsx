import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useRef } from 'react';
import type * as THREE from 'three';

import type { Npc } from '../../../src/types.ts';
import { RiggedCharacter } from '../characters/RiggedCharacter.tsx';
import type { ActorVisual } from '../mapping/visuals.ts';

/** slow turntable of the character's actual in-game model */
function Turntable({ visual, npc }: { visual: ActorVisual; npc: Npc | null }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.6;
  });
  const personaText = npc
    ? `${npc.name} ${npc.role ?? ''} ${npc.description ?? ''}`
    : 'wanderer outsider';
  return (
    <group ref={group} position={[0, -0.92, 0]}>
      <RiggedCharacter
        visual={visual}
        appearance={npc?.appearance}
        seedId={npc?.id ?? 'wanderer'}
        personaText={personaText}
      />
    </group>
  );
}

export function CharacterPortrait({ visual, npc }: { visual: ActorVisual; npc: Npc | null }) {
  return (
    <div className="char-portrait">
      <Canvas dpr={[1, 1.5]} camera={{ fov: 32, position: [0, 0.18, 3.1], near: 0.1, far: 20 }}>
        <ambientLight intensity={0.75} />
        <directionalLight position={[2.5, 3, 2]} intensity={2.2} color="#fff1dd" />
        <directionalLight position={[-2.5, 1.5, -2]} intensity={0.8} color="#9cc0e8" />
        <Suspense fallback={null}>
          <Turntable key={npc?.id ?? 'wanderer'} visual={visual} npc={npc} />
        </Suspense>
      </Canvas>
    </div>
  );
}
