"use client";

/**
 * InteractiveHero3D — procedural 3D landing hero.
 *
 * Replaces the old video-backed hero (AmbientVideo) with a fully procedural
 * WebGL scene, so the landing page ships no media files and nothing can fail to
 * buffer on a venue network.
 *
 * Scene:
 *  - ReactorCore   — wireframe dodecahedron + inner crystal + 3 stator rings.
 *  - ParticleField — 384 additive points, deflected by the cursor.
 *  - Shockwaves    — click the core to emit an expanding ring (fixed pool).
 *
 * Perf follows the same contract as ChargingTwin3D:
 *  - the render loop reads refs, never React state, so a frame never re-renders;
 *  - no allocation inside useFrame (positions live in preallocated arrays);
 *  - DPR capped at 2, shadows off.
 *
 * This component must be mounted through next/dynamic with `ssr: false` —
 * three.js touches `window` at import time.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ShieldCheck, Gauge, Network, ArrowRight, Activity } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Contract                                                            */
/* ------------------------------------------------------------------ */

const CORE_CYAN = "#00F0FF";
const CORE_EMISSIVE = "#00FF66";
const CRYSTAL = "#05FFA1";

const PARTICLE_COUNT = 384;
const PARTICLE_SPREAD = 9;
const WAVE_POOL = 4; // concurrent shockwaves
/** Reactor sits right of centre so the left-aligned headline has clear space.
 *  On phones the copy is centred instead, so the offset collapses to 0. */
const CORE_X = 2.6;
const CORE_X_BREAKPOINT = 768;

/** Reads the canvas width and returns the horizontal offset for the reactor. */
function useCoreOffset(): number {
  const width = useThree((state) => state.size.width);
  return width < CORE_X_BREAKPOINT ? 0 : CORE_X;
}
const WAVE_LIFETIME = 1.5; // seconds

/* ------------------------------------------------------------------ */
/* Reactor core                                                        */
/* ------------------------------------------------------------------ */

interface CoreProps {
  hoverRef: React.MutableRefObject<boolean>;
  onCoreClick: () => void;
}

/**
 * Central pulsing wireframe dodecahedron with an inner luminous crystal and
 * three concentric stator rings. Ring spin accelerates toward 2.6x on hover.
 */
function ReactorCore({ hoverRef, onCoreClick }: CoreProps) {
  const shellRef = useRef<THREE.Mesh>(null);
  const crystalRef = useRef<THREE.Mesh>(null);
  const ringX = useRef<THREE.Mesh>(null);
  const ringY = useRef<THREE.Mesh>(null);
  const ringZ = useRef<THREE.Mesh>(null);

  // Eased hover factor — avoids a jerky speed jump when the cursor crosses.
  const spin = useRef(1);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const target = hoverRef.current ? 2.6 : 1;
    spin.current += (target - spin.current) * Math.min(1, delta * 4);
    const s = spin.current;

    if (shellRef.current) {
      shellRef.current.rotation.y += delta * 0.22 * s;
      shellRef.current.rotation.x += delta * 0.09 * s;
      // Breathing pulse — subtle, so it reads as "energised" not "wobbling".
      const pulse = 1 + Math.sin(t * 1.6) * 0.045;
      shellRef.current.scale.setScalar(pulse);
    }

    if (crystalRef.current) {
      const inner = 1 + Math.sin(t * 2.4 + 1.1) * 0.09;
      crystalRef.current.scale.setScalar(inner);
      crystalRef.current.rotation.y -= delta * 0.5 * s;
    }

    if (ringX.current) ringX.current.rotation.x += delta * 0.7 * s;
    if (ringY.current) ringY.current.rotation.y += delta * 0.55 * s;
    if (ringZ.current) ringZ.current.rotation.z += delta * 0.4 * s;
  });

  const handleOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      hoverRef.current = true;
      document.body.style.cursor = "pointer";
    },
    [hoverRef]
  );

  const handleOut = useCallback(() => {
    hoverRef.current = false;
    document.body.style.cursor = "auto";
  }, [hoverRef]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onCoreClick();
    },
    [onCoreClick]
  );

  return (
    <group
      onPointerOver={handleOver}
      onPointerOut={handleOut}
      onClick={handleClick}
    >
      {/* Outer wireframe shell */}
      <mesh ref={shellRef}>
        <dodecahedronGeometry args={[1.55, 0]} />
        <meshStandardMaterial
          color={CORE_CYAN}
          emissive={CORE_EMISSIVE}
          emissiveIntensity={0.55}
          wireframe
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Inner luminous crystal */}
      <mesh ref={crystalRef}>
        <icosahedronGeometry args={[0.62, 1]} />
        <meshStandardMaterial
          color={CRYSTAL}
          emissive={CRYSTAL}
          emissiveIntensity={0.9}
          roughness={0.2}
          metalness={0.1}
          toneMapped={false}
        />
      </mesh>

      {/* Three concentric stator rings, one per axis */}
      <mesh ref={ringX} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.25, 0.012, 8, 128]} />
        <meshStandardMaterial
          color={CORE_CYAN}
          emissive={CORE_CYAN}
          emissiveIntensity={1.4}
          transparent
          opacity={0.75}
        />
      </mesh>
      <mesh ref={ringY} rotation={[0, 0, Math.PI / 3]}>
        <torusGeometry args={[2.62, 0.01, 8, 128]} />
        <meshStandardMaterial
          color={CORE_EMISSIVE}
          emissive={CORE_EMISSIVE}
          emissiveIntensity={1.2}
          transparent
          opacity={0.6}
        />
      </mesh>
      <mesh ref={ringZ} rotation={[Math.PI / 5, Math.PI / 4, 0]}>
        <torusGeometry args={[3.0, 0.008, 8, 128]} />
        <meshStandardMaterial
          color={CRYSTAL}
          emissive={CRYSTAL}
          emissiveIntensity={1}
          transparent
          opacity={0.42}
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Particle swarm                                                      */
/* ------------------------------------------------------------------ */

/**
 * Cursor-reactive glowing swarm. Base positions are fixed; each frame the
 * points are pushed away from the projected cursor so the field "parts" around
 * the pointer, then eased back.
 */
function ParticleField({ offsetX }: { offsetX: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  // Base lattice + per-particle drift phase. Allocated once.
  const { positions, base, phase } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const base = new Float32Array(PARTICLE_COUNT * 3);
    const phase = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      // Spherical shell distribution — denser near the core, sparse outward.
      const r = PARTICLE_SPREAD * Math.cbrt(Math.random()) * 0.5 + 2.2;
      const theta = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const sp = Math.sqrt(1 - u * u);

      base[i3] = r * sp * Math.cos(theta);
      base[i3 + 1] = r * u * 0.55; // flatten vertically — reads as a disc field
      base[i3 + 2] = r * sp * Math.sin(theta);

      positions[i3] = base[i3];
      positions[i3 + 1] = base[i3 + 1];
      positions[i3 + 2] = base[i3 + 2];

      phase[i] = Math.random() * Math.PI * 2;
    }
    return { positions, base, phase };
  }, []);

  useFrame(({ clock, pointer }) => {
    const pts = pointsRef.current;
    if (!pts) return;

    const attr = pts.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const t = clock.elapsedTime;

    // Cursor projected into the scene plane. Scaled to roughly match the
    // visible extent at the hero camera distance.
    const mx = pointer.x * 6.5 - offsetX;
    const my = pointer.y * 3.6;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      const bx = base[i3];
      const by = base[i3 + 1];
      const bz = base[i3 + 2];

      // Slow ambient drift so the field is never static.
      const drift = Math.sin(t * 0.5 + phase[i]) * 0.14;

      // Deflection: inverse-square-ish push away from the cursor.
      const dx = bx - mx;
      const dy = by - my;
      const d2 = dx * dx + dy * dy + 0.6;
      const push = 2.6 / d2;

      arr[i3] = bx + dx * push + drift;
      arr[i3 + 1] = by + dy * push + drift * 0.6;
      arr[i3 + 2] = bz + drift * 0.4;
    }

    attr.needsUpdate = true;
    pts.rotation.y = t * 0.028;
  });

  return (
    <points ref={pointsRef} position={[offsetX, 0, 0]}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={PARTICLE_COUNT}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.065}
        color={CRYSTAL}
        transparent
        opacity={0.85}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/* Shockwaves                                                          */
/* ------------------------------------------------------------------ */

/**
 * Fixed pool of expanding rings. `trigger` is a monotonically increasing click
 * counter; each increment claims the oldest slot. No allocation per click.
 */
function Shockwaves({ trigger }: { trigger: React.MutableRefObject<number> }) {
  const groupRefs = useRef<(THREE.Mesh | null)[]>([]);
  // age[i] < 0 means the slot is idle.
  const age = useRef<Float32Array>(new Float32Array(WAVE_POOL).fill(-1));
  const seen = useRef(0);
  const next = useRef(0);

  useFrame((_, delta) => {
    // Claim a slot for any clicks since the last frame.
    if (trigger.current !== seen.current) {
      seen.current = trigger.current;
      age.current[next.current] = 0;
      next.current = (next.current + 1) % WAVE_POOL;
    }

    for (let i = 0; i < WAVE_POOL; i++) {
      const mesh = groupRefs.current[i];
      if (!mesh) continue;

      const a = age.current[i];
      if (a < 0) {
        mesh.visible = false;
        continue;
      }

      const nextAge = a + delta;
      if (nextAge >= WAVE_LIFETIME) {
        age.current[i] = -1;
        mesh.visible = false;
        continue;
      }
      age.current[i] = nextAge;

      const p = nextAge / WAVE_LIFETIME; // 0 -> 1
      mesh.visible = true;
      // Ease-out expansion, linear-ish opacity decay.
      const scale = 1.4 + (1 - Math.pow(1 - p, 3)) * 7.5;
      mesh.scale.setScalar(scale);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - p) * 0.7;
    }
  });

  return (
    <>
      {Array.from({ length: WAVE_POOL }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            groupRefs.current[i] = el;
          }}
          visible={false}
        >
          <ringGeometry args={[0.92, 1, 128]} />
          <meshBasicMaterial
            color={CORE_EMISSIVE}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}

/**
 * Everything that needs the responsive offset. Lives inside <Canvas> because
 * useThree is only valid within the r3f context.
 */
function Scene({
  hoverRef,
  onCoreClick,
  clickCount,
}: {
  hoverRef: React.MutableRefObject<boolean>;
  onCoreClick: () => void;
  clickCount: React.MutableRefObject<number>;
}) {
  const offsetX = useCoreOffset();
  return (
    <>
      <ParticleField offsetX={offsetX} />
      <group position={[offsetX, 0, 0]}>
        <ReactorCore hoverRef={hoverRef} onCoreClick={onCoreClick} />
        <Shockwaves trigger={clickCount} />
      </group>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Camera rig                                                          */
/* ------------------------------------------------------------------ */

/** Smooth cursor parallax — the camera tilts toward the pointer and re-aims. */
function ParallaxRig() {
  useFrame(({ camera, pointer }, delta) => {
    const k = Math.min(1, delta * 2.2);
    camera.position.x += (pointer.x * 1.5 - camera.position.x) * k;
    camera.position.y += (pointer.y * 0.9 + 0.35 - camera.position.y) * k;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* HUD + public component                                              */
/* ------------------------------------------------------------------ */

export interface InteractiveHero3DProps {
  /** Enter the NOC security console. */
  onLaunchNoc: () => void;
  /** Open the fleet network topology view. */
  onOpenTopology: () => void;
}

export default function InteractiveHero3D({
  onLaunchNoc,
  onOpenTopology,
}: InteractiveHero3DProps) {
  const hoverRef = useRef(false);
  const clickCount = useRef(0);
  // Drives the HUD "discharge" flash only — the 3D side reads the ref.
  const [pulses, setPulses] = useState(0);

  const handleCoreClick = useCallback(() => {
    clickCount.current += 1;
    setPulses((n) => n + 1);
  }, []);

  return (
    <section className="relative h-[86vh] min-h-[560px] w-full overflow-hidden rounded-2xl border border-volt-line bg-volt-bg">
      {/* ── WebGL layer ── */}
      <div className="absolute inset-0">
        <Canvas
          camera={{ position: [0, 0.35, 9.5], fov: 45 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true }}
        >
          <ambientLight intensity={0.35} />
          <pointLight position={[6, 5, 6]} intensity={28} color={CORE_CYAN} />
          <pointLight position={[-6, -3, -4]} intensity={18} color={CORE_EMISSIVE} />

          <ParallaxRig />
          <Scene hoverRef={hoverRef} onCoreClick={handleCoreClick} clickCount={clickCount} />
        </Canvas>
      </div>

      {/* Vignette so HUD text stays legible over the swarm */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(75% 60% at 50% 50%, transparent 40%, rgba(11,15,23,0.72) 100%)",
        }}
      />

      {/* On phones the reactor sits behind the copy, so darken it further
          there to keep the paragraph legible. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-volt-bg/45 sm:hidden"
      />

      {/* ── HUD overlay ── */}
      <div className="pointer-events-none relative z-10 flex h-full flex-col justify-between p-6 sm:p-10">
        {/* Eyebrow */}
        <div className="flex justify-center sm:justify-start">
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-volt-green/40 bg-black/60 px-3.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-volt-green backdrop-blur-sm sm:text-[11px]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt-green opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-volt-green" />
            </span>
            <span>Defense Level 4 Active</span>
            <span className="text-volt-line-strong">|</span>
            <span className="text-state-active">Latency &lt; 9 µs</span>
          </div>
        </div>

        {/* Headline block */}
        <div className="max-w-4xl text-center sm:text-left">
          <h1 className="font-display text-[2.1rem] font-black leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Autonomous Protection for
            <br className="hidden sm:block" />{" "}
            <span className="bg-gradient-to-r from-[#00F0FF] via-[#05FFA1] to-[#00FF66] bg-clip-text text-transparent">
              Critical EV Power Grids
            </span>
          </h1>

          <p className="mt-4 max-w-xl text-sm leading-relaxed text-volt-muted sm:text-base">
            An inline OCPP 1.6-J security proxy that inspects every frame between
            your charge points and the CSMS — quarantining compromised stations
            before they reach the backend or destabilise the transformer.
          </p>

          {/* CTAs */}
          <div className="pointer-events-auto mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <button
              onClick={onLaunchNoc}
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-volt-green px-6 py-3.5 font-mono text-xs font-extrabold uppercase tracking-wider text-slate-950 transition-all hover:bg-[#05FFA1] hover:shadow-[0_0_28px_-6px_rgba(5,255,161,0.7)]"
            >
              <ShieldCheck className="h-4 w-4" />
              Launch SCADA Console
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>

            <button
              onClick={onOpenTopology}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-volt-line-strong bg-black/50 px-6 py-3.5 font-mono text-xs font-extrabold uppercase tracking-wider text-volt-text backdrop-blur-sm transition-all hover:border-state-active/60 hover:text-state-active"
            >
              <Network className="h-4 w-4" />
              Fleet Topology
            </button>
          </div>

          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.15em] text-volt-muted/70">
            Tip: click the reactor core to discharge
            {pulses > 0 ? ` · ${pulses} emitted` : ""}
          </p>
        </div>

        {/* Bottom telemetry strip */}
        <div className="pointer-events-auto grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <TelemetryTile
            icon={<Gauge className="h-3.5 w-3.5" />}
            label="Tier-1 Scan"
            value="~9 µs"
            hint="mean / frame"
          />
          <TelemetryTile
            icon={<Activity className="h-3.5 w-3.5" />}
            label="Tier-2 Model"
            value="Armed"
            hint="isolation forest"
          />
          <TelemetryTile
            icon={<Network className="h-3.5 w-3.5" />}
            label="Protocol"
            value="OCPP 1.6-J"
            hint="websocket relay"
          />
          <TelemetryTile
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            label="Rules Active"
            value="R1 – R6"
            hint="deterministic tier"
          />
        </div>
      </div>
    </section>
  );
}

function TelemetryTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="glass-panel-futuristic rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-volt-muted">
        <span className="text-state-active">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 font-mono text-sm font-bold tabular-nums text-white">
        {value}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-volt-muted/70">
        {hint}
      </div>
    </div>
  );
}
