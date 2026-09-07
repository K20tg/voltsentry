"use client";

/**
 * ChargingTwin3D — 3D digital twin of the charging bay row.
 *
 * Renders one procedural cyberpunk stall per station in the fleet, driven live
 * off the same TelemetryEvent / ThreatEvent stream as the 2D grid. Nothing in
 * here fetches or owns data: it is a pure view over props, so the 2D dashboard
 * stays the source of truth (and the stable fallback).
 *
 * Perf notes, since this runs next to a live WebSocket at 1 Hz:
 *  - telemetry lands as props and is mirrored into refs; the render loop never
 *    reads React state and never triggers a re-render.
 *  - displayed SoC is eased toward the last sample so 1 Hz data looks
 *    continuous at 60 fps.
 *  - particle positions are written into one preallocated Float32Array per bay.
 *    No allocation inside useFrame.
 *  - shadows are off and DPR is capped; with 8 bays the cost is fill rate, not
 *    geometry.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import { TelemetryEvent, ThreatEvent } from "../lib/types";

/* ------------------------------------------------------------------ */
/* Contract                                                            */
/* ------------------------------------------------------------------ */

const ML_THRESHOLD = 0.65; // CONTEXT.md 5.B — pinned, must match the 2D view
const ATTACK_HOLD_MS = 8000; // how long a tier-1 hit keeps the cable pulsing red
const BAY_PITCH = 6.0; // world units between bay centres
const PARTICLES_PER_CABLE = 64;
const NOMINAL_KW = 120; // full-rate reference for particle speed

const COLOR_CLEAN = "#0FFF50";
const COLOR_ANOMALY = "#F59E0B";
const COLOR_ALARM = "#EF4444";
const COLOR_IDLE = "#334155";

export type BayState = "idle" | "clean" | "anomaly" | "attack" | "quarantined";

const STATE_COLOR: Record<BayState, string> = {
  idle: COLOR_IDLE,
  clean: COLOR_CLEAN,
  anomaly: COLOR_ANOMALY,
  attack: COLOR_ALARM,
  quarantined: COLOR_ALARM,
};

export interface ChargingTwin3DProps {
  stations: Record<string, TelemetryEvent>;
  threats: ThreatEvent[];
  stationIds: string[];
}

interface BayRuntime {
  powerKw: number;
  state: BayState;
}

/* ------------------------------------------------------------------ */
/* Threat recency                                                      */
/* ------------------------------------------------------------------ */

/**
 * Latest threat per station, tagged with *arrival* time rather than the event's
 * own `ts`. Fixture replay ships historical timestamps on a loop, so comparing
 * `threat.ts` to the wall clock would never mark anything as recent.
 */
function useLatestThreats(threats: ThreatEvent[]) {
  const seenRef = useRef<Record<string, { threat: ThreatEvent; seenAt: number }>>({});
  const [, tick] = useState(0);

  useEffect(() => {
    let changed = false;
    // threats is newest-first, so the first entry per station is the latest
    const handled = new Set<string>();
    for (const threat of threats) {
      if (handled.has(threat.station_id)) continue;
      handled.add(threat.station_id);
      const prev = seenRef.current[threat.station_id];
      if (!prev || prev.threat !== threat) {
        seenRef.current[threat.station_id] = { threat, seenAt: Date.now() };
        changed = true;
      }
    }
    if (changed) tick((n) => n + 1);
  }, [threats]);

  // expire the "under attack" pulse without needing a new event to arrive
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  return seenRef.current;
}

function deriveState(
  telemetry: TelemetryEvent | undefined,
  latest: { threat: ThreatEvent; seenAt: number } | undefined
): BayState {
  if (!telemetry) return "idle";
  // Live status is the source of truth. Once reset reconnects the station, fresh
  // telemetry arrives as Charging and the bay must return to green.
  if (telemetry.status === "Quarantined") return "quarantined";

  const isRecent = latest ? Date.now() - latest.seenAt < ATTACK_HOLD_MS : false;
  // Bridge only the brief window between the quarantine threat and telemetry
  // flipping to Quarantined — recency-gated, or a stale threat would pin the bay
  // red forever and reset would look like a no-op.
  if (isRecent && latest?.threat.action_taken === "quarantined") return "quarantined";
  if (isRecent && latest?.threat.tier === 1) return "attack";
  if (telemetry.ml_score > ML_THRESHOLD) return "anomaly";
  if (isRecent && latest?.threat.tier === 2) return "anomaly";
  if (telemetry.status === "Offline") return "idle";
  return "clean";
}

/* ------------------------------------------------------------------ */
/* Cable + particle stream                                             */
/* ------------------------------------------------------------------ */

/** Droop from the kiosk cable gland down to the car's charge flap. */
function useCableCurve() {
  return useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-2.72, 1.5, 0.3),
        new THREE.Vector3(-2.1, 0.78, 0.92),
        new THREE.Vector3(-1.35, 0.52, 1.16),
        new THREE.Vector3(-0.75, 0.86, 1.16),
        new THREE.Vector3(-0.42, 1.0, 1.1),
      ]),
    []
  );
}

function EnergyFlow({
  curve,
  runtime,
}: {
  curve: THREE.CatmullRomCurve3;
  runtime: React.MutableRefObject<BayRuntime>;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const progress = useRef(0);
  const scratch = useMemo(() => new THREE.Vector3(), []);
  const color = useMemo(() => new THREE.Color(), []);

  const offsets = useMemo(
    () => Float32Array.from({ length: PARTICLES_PER_CABLE }, (_, i) => i / PARTICLES_PER_CABLE),
    []
  );

  // Seeded so the first frame is a stream, not a clump at the origin.
  const positions = useMemo(() => {
    const array = new Float32Array(PARTICLES_PER_CABLE * 3);
    const vector = new THREE.Vector3();
    for (let i = 0; i < PARTICLES_PER_CABLE; i++) {
      curve.getPoint(offsets[i], vector);
      array[i * 3] = vector.x;
      array[i * 3 + 1] = vector.y;
      array[i * 3 + 2] = vector.z;
    }
    return array;
  }, [curve, offsets]);

  useFrame((_, delta) => {
    const points = pointsRef.current;
    const material = materialRef.current;
    if (!points || !material) return;

    const { powerKw, state } = runtime.current;

    // Quarantine severs the link: flow stops dead and the stream disappears.
    if (state === "quarantined") {
      points.visible = false;
      return;
    }
    points.visible = true;

    // Speed tracks real delivered power, so the CV taper above 80% SoC slows
    // the stream on its own — no special-casing needed.
    const speed = Math.max(0.02, Math.min(powerKw / NOMINAL_KW, 1.6)) * 0.32;
    progress.current = (progress.current + delta * speed) % 1;

    const attribute = points.geometry.attributes.position as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let i = 0; i < PARTICLES_PER_CABLE; i++) {
      const t = (offsets[i] + progress.current) % 1;
      curve.getPoint(t, scratch);
      array[i * 3] = scratch.x;
      array[i * 3 + 1] = scratch.y;
      array[i * 3 + 2] = scratch.z;
    }
    attribute.needsUpdate = true;

    color.set(STATE_COLOR[state]);
    material.color.copy(color);
    // Fatter under a spoof: the physical draw is real even though the meter is
    // lying about it.
    material.size = state === "attack" ? 0.13 : 0.09;
    material.opacity = state === "idle" ? 0.15 : 0.95;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={materialRef}
        size={0.09}
        sizeAttenuation
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        color={COLOR_CLEAN}
      />
    </points>
  );
}

function Cable({
  curve,
  runtime,
}: {
  curve: THREE.CatmullRomCurve3;
  runtime: React.MutableRefObject<BayRuntime>;
}) {
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 40, 0.045, 8, false), [curve]);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const color = useMemo(() => new THREE.Color(), []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock }) => {
    const material = materialRef.current;
    if (!material) return;
    const { state } = runtime.current;

    if (state === "attack" || state === "quarantined") {
      // Pulse red — the cable is carrying (or just carried) hostile load.
      const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 8);
      color.set(COLOR_ALARM);
      material.emissive.copy(color);
      material.emissiveIntensity = 0.4 + pulse * 1.4;
    } else {
      color.set(state === "anomaly" ? COLOR_ANOMALY : COLOR_CLEAN);
      material.emissive.copy(color);
      material.emissiveIntensity = state === "idle" ? 0.05 : 0.28;
    }
  });

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial ref={materialRef} color="#0b1220" roughness={0.55} metalness={0.2} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Kiosk                                                               */
/* ------------------------------------------------------------------ */

function LedStrip({
  position,
  scale,
  runtime,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  runtime: React.MutableRefObject<BayRuntime>;
}) {
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }) => {
    const material = materialRef.current;
    if (!material) return;
    const { state } = runtime.current;
    color.set(STATE_COLOR[state]);
    material.color.copy(color);

    if (state === "attack" || state === "quarantined") {
      // Hard square wave: reads as an alarm, not a breathing glow.
      material.opacity = Math.sin(clock.elapsedTime * 11) > 0 ? 1 : 0.12;
    } else if (state === "anomaly") {
      material.opacity = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 3.2));
    } else {
      material.opacity = state === "idle" ? 0.25 : 0.95;
    }
  });

  return (
    <mesh position={position} scale={scale}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial ref={materialRef} transparent toneMapped={false} color={COLOR_CLEAN} />
    </mesh>
  );
}

function Kiosk({
  telemetry,
  stationId,
  state,
  runtime,
}: {
  telemetry: TelemetryEvent | undefined;
  stationId: string;
  state: BayState;
  runtime: React.MutableRefObject<BayRuntime>;
}) {
  const accent = STATE_COLOR[state];

  return (
    <group position={[-2.3, 0, 0]}>
      {/* plinth */}
      <mesh position={[0, 0.09, 0]}>
        <boxGeometry args={[1.25, 0.18, 1.0]} />
        <meshStandardMaterial color="#111827" roughness={0.9} metalness={0.1} />
      </mesh>

      {/* body */}
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[1.0, 2.3, 0.8]} />
        <meshStandardMaterial color="#33445e" roughness={0.42} metalness={0.55} flatShading />
      </mesh>

      {/* angled head */}
      <mesh position={[0, 2.42, 0.06]} rotation={[-0.28, 0, 0]}>
        <boxGeometry args={[1.0, 0.36, 0.82]} />
        <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.7} flatShading />
      </mesh>

      {/* screen bezel */}
      <mesh position={[0, 1.62, 0.405]}>
        <boxGeometry args={[0.84, 0.66, 0.02]} />
        <meshStandardMaterial color="#020617" emissive={accent} emissiveIntensity={0.14} />
      </mesh>

      {/* LED accent frame around the kiosk face */}
      <LedStrip position={[0, 2.22, 0.41]} scale={[0.92, 0.05, 0.03]} runtime={runtime} />
      <LedStrip position={[0, 0.28, 0.41]} scale={[0.92, 0.05, 0.03]} runtime={runtime} />
      <LedStrip position={[-0.46, 1.25, 0.41]} scale={[0.05, 1.98, 0.03]} runtime={runtime} />
      <LedStrip position={[0.46, 1.25, 0.41]} scale={[0.05, 1.98, 0.03]} runtime={runtime} />

      {/* cable gland */}
      <mesh position={[-0.42, 1.5, 0.3]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.07, 0.07, 0.16, 10]} />
        <meshStandardMaterial color="#0b1220" roughness={0.8} />
      </mesh>

      {/* live readout, projected into 3D space */}
      <Html
        transform
        occlude={false}
        position={[0, 1.62, 0.42]}
        scale={0.16}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div
          style={{
            width: 210,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            color: accent,
            textAlign: "center",
            lineHeight: 1.2,
            textShadow: "0 0 12px " + accent,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 2, opacity: 0.85 }}>
            {stationId}
          </div>
          <div style={{ fontSize: 46, fontWeight: 900 }}>
            {telemetry ? telemetry.power_kw.toFixed(1) : "--"}
            <span style={{ fontSize: 18 }}> kW</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, opacity: 0.9 }}>
            SoC {telemetry ? telemetry.soc.toFixed(0) : "--"}%
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: 1.5,
              marginTop: 4,
              opacity: 0.95,
            }}
          >
            {telemetry ? telemetry.status.toUpperCase() : "NO LINK"}
          </div>
          {telemetry && telemetry.ml_score > 0 && (
            <div style={{ fontSize: 14, opacity: 0.75, marginTop: 2 }}>
              ML {telemetry.ml_score.toFixed(2)}
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Vehicle                                                             */
/* ------------------------------------------------------------------ */

const PACK_LENGTH = 3.3;

function BatteryChassis({ socRef }: { socRef: React.MutableRefObject<number> }) {
  const fillRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const shown = useRef(0);

  useFrame((_, delta) => {
    const fill = fillRef.current;
    if (!fill) return;
    // Ease toward the last sample so 1 Hz telemetry reads as a smooth climb.
    shown.current += (socRef.current - shown.current) * Math.min(1, delta * 2.5);
    const fraction = Math.max(0.001, Math.min(shown.current / 100, 1));

    fill.scale.z = fraction;
    // Grow from the rear of the pack rather than from its centre.
    fill.position.z = -PACK_LENGTH / 2 + (PACK_LENGTH * fraction) / 2;

    if (materialRef.current) {
      materialRef.current.emissiveIntensity = 0.9 + 0.5 * fraction;
    }
  });

  return (
    <group position={[0.6, 0.5, 0]}>
      {/* translucent pack shell */}
      <mesh>
        <boxGeometry args={[1.8, 0.34, PACK_LENGTH]} />
        <meshStandardMaterial
          color="#0b1220"
          transparent
          opacity={0.28}
          roughness={0.15}
          metalness={0.1}
          depthWrite={false}
        />
      </mesh>

      {/* glowing charge level */}
      <mesh ref={fillRef}>
        <boxGeometry args={[1.66, 0.24, PACK_LENGTH]} />
        <meshStandardMaterial
          ref={materialRef}
          color={COLOR_CLEAN}
          emissive={COLOR_CLEAN}
          emissiveIntensity={1.1}
          transparent
          opacity={0.55}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function Wheel({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.42, 0.42, 0.26, 14]} />
      <meshStandardMaterial color="#161d2b" roughness={0.95} flatShading />
    </mesh>
  );
}

function Vehicle({ socRef }: { socRef: React.MutableRefObject<number> }) {
  return (
    <group>
      {/* lower body */}
      <mesh position={[0.6, 0.95, 0]}>
        <boxGeometry args={[2.0, 0.62, 4.2]} />
        <meshStandardMaterial color="#41556f" roughness={0.32} metalness={0.6} flatShading />
      </mesh>

      {/* shoulder taper */}
      <mesh position={[0.6, 1.32, -0.15]}>
        <boxGeometry args={[1.82, 0.22, 3.3]} />
        <meshStandardMaterial color="#52688a" roughness={0.3} metalness={0.6} flatShading />
      </mesh>

      {/* greenhouse */}
      <mesh position={[0.6, 1.62, -0.2]}>
        <boxGeometry args={[1.6, 0.44, 2.0]} />
        <meshStandardMaterial
          color="#0ea5e9"
          transparent
          opacity={0.42}
          roughness={0.05}
          metalness={0.9}
          flatShading
        />
      </mesh>

      {/* nose light bar */}
      <mesh position={[0.6, 1.02, 2.11]}>
        <boxGeometry args={[1.7, 0.08, 0.04]} />
        <meshBasicMaterial color="#38bdf8" toneMapped={false} />
      </mesh>

      <Wheel position={[-0.42, 0.42, 1.4]} />
      <Wheel position={[1.62, 0.42, 1.4]} />
      <Wheel position={[-0.42, 0.42, -1.4]} />
      <Wheel position={[1.62, 0.42, -1.4]} />

      {/* charge flap where the cable lands */}
      <mesh position={[-0.42, 1.0, 1.1]}>
        <boxGeometry args={[0.04, 0.22, 0.22]} />
        <meshStandardMaterial color="#0b1220" emissive={COLOR_CLEAN} emissiveIntensity={0.5} />
      </mesh>

      <BatteryChassis socRef={socRef} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Quarantine shield                                                   */
/* ------------------------------------------------------------------ */

function QuarantineShield({ runtime }: { runtime: React.MutableRefObject<BayRuntime> }) {
  const groupRef = useRef<THREE.Group>(null);
  const shellRef = useRef<THREE.MeshBasicMaterial>(null);
  const wireRef = useRef<THREE.MeshBasicMaterial>(null);
  const growth = useRef(0);

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const active = runtime.current.state === "quarantined";

    // Snap up fast, fade out slower — containment should feel decisive.
    const target = active ? 1 : 0;
    growth.current += (target - growth.current) * Math.min(1, delta * (active ? 9 : 4));

    if (growth.current < 0.01) {
      group.visible = false;
      return;
    }
    group.visible = true;
    group.scale.setScalar(0.6 + growth.current * 0.4);
    group.rotation.y += delta * 0.35;

    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 5);
    if (shellRef.current) shellRef.current.opacity = growth.current * (0.08 + pulse * 0.1);
    if (wireRef.current) wireRef.current.opacity = growth.current * (0.35 + pulse * 0.35);
  });

  return (
    <group ref={groupRef} position={[0.1, 0.05, 0]} visible={false}>
      <mesh>
        <sphereGeometry args={[3.2, 20, 14]} />
        <meshBasicMaterial
          ref={shellRef}
          color={COLOR_ALARM}
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[3.22, 16, 10]} />
        <meshBasicMaterial
          ref={wireRef}
          color={COLOR_ALARM}
          wireframe
          transparent
          opacity={0.5}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Bay                                                                 */
/* ------------------------------------------------------------------ */

function Bay({
  stationId,
  telemetry,
  state,
  index,
  count,
}: {
  stationId: string;
  telemetry: TelemetryEvent | undefined;
  state: BayState;
  index: number;
  count: number;
}) {
  const curve = useCableCurve();

  // Mirror props into refs so the animation loop never reads React state.
  const runtime = useRef<BayRuntime>({ powerKw: 0, state: "idle" });
  const socRef = useRef(0);
  runtime.current.powerKw = telemetry?.power_kw ?? 0;
  runtime.current.state = state;
  socRef.current = telemetry?.soc ?? 0;

  const accent = STATE_COLOR[state];
  const x = (index - (count - 1) / 2) * BAY_PITCH;

  return (
    <group position={[x, 0, 0]}>
      {/* bay pad */}
      <mesh position={[0.2, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5.4, 6.4]} />
        <meshStandardMaterial color="#0a0f1a" roughness={1} />
      </mesh>

      {/* painted bay outline, tinted by state so the row scans at a glance */}
      <mesh position={[0.2, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.55, 2.68, 4, 1, Math.PI / 4]} />
        <meshBasicMaterial color={accent} transparent opacity={0.45} toneMapped={false} />
      </mesh>

      <Kiosk telemetry={telemetry} stationId={stationId} state={state} runtime={runtime} />
      <Vehicle socRef={socRef} />
      <Cable curve={curve} runtime={runtime} />
      <EnergyFlow curve={curve} runtime={runtime} />
      <QuarantineShield runtime={runtime} />

      {/* per-bay accent fill light */}
      <pointLight
        position={[0, 2.6, 1.4]}
        distance={7}
        intensity={state === "idle" ? 3 : 9}
        color={accent}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

function Scene({ stations, threats, stationIds }: ChargingTwin3DProps) {
  const latest = useLatestThreats(threats);

  return (
    <>
      <color attach="background" args={["#020617"]} />
      <fog attach="fog" args={["#020617", 28, 90]} />

      {/* Key/fill/rim. The bodywork is dark slate on a near-black forecourt, so
          without the rim light from behind the cars read as silhouettes. */}
      <ambientLight intensity={0.6} />
      <hemisphereLight args={["#2b5f8f", "#050a14", 0.9]} />
      <directionalLight position={[10, 16, 14]} intensity={1.15} />
      <directionalLight position={[-8, 6, -12]} intensity={0.5} color="#38bdf8" />

      {/* forecourt */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[160, 70]} />
        <meshStandardMaterial color="#05080f" roughness={1} />
      </mesh>
      <gridHelper args={[160, 80, "#0f2d3d", "#0a1a24"]} position={[0, 0.005, 0]} />

      {stationIds.map((stationId, index) => (
        <Bay
          key={stationId}
          stationId={stationId}
          telemetry={stations[stationId]}
          state={deriveState(stations[stationId], latest[stationId])}
          index={index}
          count={stationIds.length}
        />
      ))}

      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableDamping
        dampingFactor={0.08}
        minDistance={6}
        maxDistance={80}
        maxPolarAngle={Math.PI / 2 - 0.05}
        target={[0, 1.6, 0]}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Public component                                                    */
/* ------------------------------------------------------------------ */

export default function ChargingTwin3D({ stations, threats, stationIds }: ChargingTwin3DProps) {
  const latest = useLatestThreats(threats);

  const counts = useMemo(() => {
    let quarantined = 0;
    let flagged = 0;
    for (const stationId of stationIds) {
      const state = deriveState(stations[stationId], latest[stationId]);
      if (state === "quarantined") quarantined++;
      else if (state === "anomaly" || state === "attack") flagged++;
    }
    return { quarantined, flagged };
  }, [stations, stationIds, latest]);

  return (
    <div className="relative w-full h-[540px] rounded-2xl overflow-hidden border border-white/10 bg-slate-950">
      <Canvas
        dpr={[1, 1.75]}
        shadows={false}
        // preserveDrawingBuffer keeps the frame readable after compositing so the
        // canvas survives screenshots and screen capture during the demo.
        gl={{ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true }}
        camera={{ position: [-23, 10, 28], fov: 45, near: 0.1, far: 220 }}
      >
        <Scene stations={stations} threats={threats} stationIds={stationIds} />
      </Canvas>

      {/* 2D chrome over the canvas — legend and live counts */}
      <div className="pointer-events-none absolute top-4 left-4 space-y-2 font-mono text-[11px]">
        <div className="px-3 py-1.5 rounded-lg bg-black/70 border border-white/15 text-slate-200 font-bold tracking-wider">
          DIGITAL TWIN — {stationIds.length} BAYS
        </div>
        <div className="px-3 py-2 rounded-lg bg-black/70 border border-white/15 space-y-1">
          <LegendRow color={COLOR_CLEAN} label="CLEAN CHARGING" />
          <LegendRow color={COLOR_ANOMALY} label={`ML ANOMALY > ${ML_THRESHOLD}`} />
          <LegendRow color={COLOR_ALARM} label="TIER-1 / QUARANTINE" />
        </div>
        {(counts.quarantined > 0 || counts.flagged > 0) && (
          <div className="px-3 py-1.5 rounded-lg bg-rose-500/20 border border-rose-500/50 text-rose-200 font-bold">
            {counts.quarantined} QUARANTINED · {counts.flagged} FLAGGED
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 px-3 py-1.5 rounded-lg bg-black/70 border border-white/15 font-mono text-[10px] text-slate-400">
        DRAG TO ORBIT · SCROLL TO ZOOM · RIGHT-DRAG TO PAN
      </div>
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center space-x-2 text-slate-300">
      <span
        className="w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
      />
      <span>{label}</span>
    </div>
  );
}
