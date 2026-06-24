import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

import { useCombatStore, type VfxEvent } from './store.ts';

export function CombatVfx() {
  const vfx = useCombatStore((state) => state.vfx);
  const pruneVfx = useCombatStore((state) => state.pruneVfx);
  const lastPrune = useRef(0);

  useFrame((frame) => {
    if (frame.clock.elapsedTime - lastPrune.current > 0.5) {
      lastPrune.current = frame.clock.elapsedTime;
      pruneVfx(performance.now());
    }
  });

  return (
    <>
      {vfx.map((event) =>
        event.kind === 'spark' ? (
          <Spark key={event.id} event={event} />
        ) : event.kind === 'damage' ? (
          <DamageNumber key={event.id} event={event} />
        ) : event.kind === 'dust' ? (
          <DustPuff key={event.id} event={event} />
        ) : (
          <TelegraphRing key={event.id} event={event} />
        )
      )}
    </>
  );
}

function progressOf(event: VfxEvent): number {
  return Math.min(1, (performance.now() - event.startedAt) / (event.expiresAt - event.startedAt));
}

function Spark({ event }: { event: VfxEvent }) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    const t = progressOf(event);
    mesh.current?.scale.setScalar(0.25 + t * 1.1);
    if (material.current) material.current.opacity = 0.9 * (1 - t);
  });
  return (
    <mesh ref={mesh} position={[event.x, event.y, event.z]}>
      <icosahedronGeometry args={[0.3, 0]} />
      <meshBasicMaterial
        ref={material}
        color={event.color}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

function DamageNumber({ event }: { event: VfxEvent }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = progressOf(event);
    group.current?.position.set(event.x, event.y + 0.4 + t * 1.1, event.z);
  });
  return (
    <group ref={group} position={[event.x, event.y + 0.4, event.z]}>
      <Billboard>
        <Text
          fontSize={0.42}
          color={event.color}
          outlineWidth={0.04}
          outlineColor="#101421"
          anchorX="center"
          fontWeight="bold"
        >
          {event.text ?? ''}
        </Text>
      </Billboard>
    </group>
  );
}

function DustPuff({ event }: { event: VfxEvent }) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    const t = progressOf(event);
    mesh.current?.scale.setScalar(0.12 + t * 0.3);
    mesh.current?.position.set(event.x, event.y + t * 0.25, event.z);
    if (material.current) material.current.opacity = 0.35 * (1 - t);
  });
  return (
    <mesh ref={mesh} position={[event.x, event.y, event.z]}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshBasicMaterial ref={material} color={event.color} transparent depthWrite={false} />
    </mesh>
  );
}

function TelegraphRing({ event }: { event: VfxEvent }) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    const t = progressOf(event);
    mesh.current?.scale.setScalar(0.6 + t * 0.9);
    if (material.current) material.current.opacity = 0.55 * (1 - t * 0.4);
  });
  return (
    <mesh ref={mesh} position={[event.x, 0.06, event.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.85, 1.05, 28]} />
      <meshBasicMaterial ref={material} color={event.color} transparent depthWrite={false} />
    </mesh>
  );
}
