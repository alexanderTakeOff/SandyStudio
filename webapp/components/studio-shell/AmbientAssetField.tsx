// ──────────────────────────────────────────────────────────────────────────────
// components/studio-shell/AmbientAssetField.tsx
// V1 ambient background per uiux.md §14.
//   - subtle abstract floating nodes;
//   - very thin lines between nearby nodes;
//   - slight parallax on cursor;
//   - very slow drift;
//   - pointer-events disabled (no navigation);
//   - paused when tab hidden;
//   - frozen when ambient=reduced or prefers-reduced-motion;
//   - hidden entirely when ambient=off.
// Hard ceilings come from CSS vars (--ambient-* in app/globals.css).
// ──────────────────────────────────────────────────────────────────────────────

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppearance } from '@/components/providers/AppearanceProvider';

const NODE_COUNT = 36;
const CONNECTION_DISTANCE = 2.2;
const FIELD_SIZE = { x: 14, y: 8, z: 4 };

interface NodeData {
  basePos: THREE.Vector3;
  phase: number;
  speed: number;
  size: number;
}

function generateNodes(seed = 1): NodeData[] {
  // Deterministic pseudo-random so SSR and client render the same layout.
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  return Array.from({ length: NODE_COUNT }, () => ({
    basePos: new THREE.Vector3(
      (rand() - 0.5) * FIELD_SIZE.x,
      (rand() - 0.5) * FIELD_SIZE.y,
      (rand() - 0.5) * FIELD_SIZE.z,
    ),
    phase: rand() * Math.PI * 2,
    speed: 0.04 + rand() * 0.05,
    size: 0.04 + rand() * 0.05,
  }));
}

function readAmbientLimits() {
  if (typeof window === 'undefined') {
    return { node: 0.34, line: 0.10, glow: 0.22, motion: 0.35, parallax: 0.25 };
  }
  const cs = getComputedStyle(document.documentElement);
  const num = (name: string, fallback: number) => {
    const v = parseFloat(cs.getPropertyValue(name));
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    node:     num('--ambient-node-opacity', 0.34),
    line:     num('--ambient-line-opacity', 0.10),
    glow:     num('--ambient-glow-strength', 0.22),
    motion:   num('--ambient-motion-intensity', 0.35),
    parallax: num('--ambient-parallax-intensity', 0.25),
  };
}

function readAccentColor(): THREE.Color {
  if (typeof window === 'undefined') return new THREE.Color('#3B82F6');
  const cs = getComputedStyle(document.documentElement);
  const raw = cs.getPropertyValue('--accent-primary').trim() || '#3B82F6';
  return new THREE.Color(raw);
}

interface FieldProps {
  motionEnabled: boolean;
  parallaxEnabled: boolean;
}

function Field({ motionEnabled, parallaxEnabled }: FieldProps) {
  const { viewport } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const mouse = useRef({ x: 0, y: 0 });

  const nodes = useMemo(() => generateNodes(7), []);
  const limits = useMemo(() => readAmbientLimits(), []);
  const accent = useMemo(() => readAccentColor(), []);

  // Geometry + material for nodes.
  const pointsGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(NODE_COUNT * 3);
    const sizes = new Float32Array(NODE_COUNT);
    nodes.forEach((n, i) => {
      positions[i * 3] = n.basePos.x;
      positions[i * 3 + 1] = n.basePos.y;
      positions[i * 3 + 2] = n.basePos.z;
      sizes[i] = n.size;
    });
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    return g;
  }, [nodes]);

  // Geometry for line segments (recomputed each frame from current node positions).
  const lineGeometry = useMemo(() => new THREE.BufferGeometry(), []);

  // Track cursor for parallax (very gentle — capped to a couple of px equivalent).
  useEffect(() => {
    if (!parallaxEnabled) return;
    const onMove = (e: PointerEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -((e.clientY / window.innerHeight) * 2 - 1);
      mouse.current.x = x;
      mouse.current.y = y;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [parallaxEnabled]);

  // Pause when tab hidden.
  const visibleRef = useRef(true);
  useEffect(() => {
    const onVis = () => {
      visibleRef.current = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useFrame((state, delta) => {
    if (!visibleRef.current) return;

    const t = state.clock.elapsedTime;
    const positionAttr = pointsGeometry.getAttribute('position') as THREE.BufferAttribute;

    // Update node positions with very slow drift.
    if (motionEnabled) {
      nodes.forEach((n, i) => {
        const drift = limits.motion * 0.6;
        const dx = Math.sin(t * n.speed + n.phase) * drift;
        const dy = Math.cos(t * n.speed * 0.7 + n.phase) * drift;
        positionAttr.setXYZ(i, n.basePos.x + dx, n.basePos.y + dy, n.basePos.z);
      });
      positionAttr.needsUpdate = true;
    }

    // Connection lines — recompute each frame (cheap at 36 nodes).
    const linePositions: number[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const ax = positionAttr.getX(i);
      const ay = positionAttr.getY(i);
      const az = positionAttr.getZ(i);
      for (let j = i + 1; j < nodes.length; j++) {
        const bx = positionAttr.getX(j);
        const by = positionAttr.getY(j);
        const bz = positionAttr.getZ(j);
        const dx = ax - bx;
        const dy = ay - by;
        const dz = az - bz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < CONNECTION_DISTANCE) {
          linePositions.push(ax, ay, az, bx, by, bz);
        }
      }
    }
    lineGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(linePositions, 3),
    );
    lineGeometry.attributes.position.needsUpdate = true;

    // Parallax — gentle group offset (ceiling: ~1% of viewport).
    if (parallaxEnabled && groupRef.current) {
      const target = {
        x: mouse.current.x * limits.parallax * 0.4,
        y: mouse.current.y * limits.parallax * 0.4,
      };
      groupRef.current.position.x += (target.x - groupRef.current.position.x) * Math.min(1, delta * 1.4);
      groupRef.current.position.y += (target.y - groupRef.current.position.y) * Math.min(1, delta * 1.4);
    }
  });

  // Adapt to viewport (keep field roughly within visible area).
  useEffect(() => {
    if (!groupRef.current) return;
    const scale = Math.min(viewport.width / FIELD_SIZE.x, viewport.height / FIELD_SIZE.y) * 0.65;
    groupRef.current.scale.setScalar(Math.max(0.4, scale));
  }, [viewport.width, viewport.height]);

  return (
    <group ref={groupRef}>
      <points ref={pointsRef} geometry={pointsGeometry}>
        <pointsMaterial
          size={0.10}
          color={accent}
          transparent
          opacity={limits.node}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
      <lineSegments ref={linesRef} geometry={lineGeometry}>
        <lineBasicMaterial
          color={accent}
          transparent
          opacity={limits.line}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}

export function AmbientAssetField() {
  const { ambient } = useAppearance();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Render nothing client-side until mounted to avoid hydration mismatch from
  // viewport-dependent geometry.
  if (!mounted || ambient === 'off') return null;

  const motionEnabled = ambient === 'on';
  const parallaxEnabled = ambient === 'on';

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{ contain: 'strict' }}
    >
      <Canvas
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 8], fov: 55 }}
        dpr={[1, 1.5]}
        frameloop={motionEnabled ? 'always' : 'demand'}
      >
        <Field motionEnabled={motionEnabled} parallaxEnabled={parallaxEnabled} />
      </Canvas>
    </div>
  );
}
