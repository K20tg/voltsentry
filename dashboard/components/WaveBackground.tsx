"use client";

import React, { useEffect, useRef } from "react";

/**
 * WaveBackground — persistent, interactive cyber-grid backdrop.
 *
 * This is the *page-wide* ambient layer (fixed, behind everything). It replaces
 * the old floating-lines field, which painted an almost-black fill and read as a
 * void once you scrolled past the hero. Now it renders:
 *
 *   - a slowly drifting node field, denser near the cursor;
 *   - links between nearby nodes (a Delaunay-ish proximity mesh);
 *   - electric pulses that travel along links and brighten on cursor proximity;
 *   - a subtle parallax tie to scroll position so the field feels alive the
 *     whole way down the page.
 *
 * Pure canvas 2D — no WebGL context is spent here, leaving the budget for the
 * hero and twin. Node count is capped and links are only drawn within a radius,
 * so cost stays roughly linear in nodes even as the viewport grows.
 */

const EMERALD = "0, 255, 102"; // #00FF66
const CYAN = "0, 240, 255"; // #00F0FF

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: 0 | 1; // 0 emerald, 1 cyan
}

interface Pulse {
  a: number; // node index
  b: number; // node index
  t: number; // 0..1 along the edge
  speed: number;
  hue: 0 | 1;
}

interface WaveBackgroundProps {
  /** Overall visibility, 0..1. Higher = brighter grid, thinner vignette. */
  opacity?: number;
}

export function WaveBackground({ opacity = 0.6 }: WaveBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Live pointer + scroll, mirrored into refs so the loop never re-subscribes.
  const pointer = useRef({ x: -9999, y: -9999, active: false });
  const scroll = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let raf = 0;
    let nodes: Node[] = [];
    let pulses: Pulse[] = [];
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;

    const LINK_DIST = 150; // css px — max length of a drawn link
    const PULSE_CAP = 46;

    const build = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Density scales with area but is capped so big monitors stay cheap.
      const count = Math.min(120, Math.max(38, Math.round((w * h) / 22000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16,
        hue: (Math.random() < 0.35 ? 1 : 0) as 0 | 1,
      }));
      pulses = [];
    };

    build();
    window.addEventListener("resize", build);

    const spawnPulse = () => {
      if (pulses.length >= PULSE_CAP || nodes.length < 2) return;
      const a = (Math.random() * nodes.length) | 0;
      // Pick a nearby node as the other end so pulses ride real links.
      let b = -1;
      let bestD = LINK_DIST * LINK_DIST;
      for (let i = 0; i < nodes.length; i++) {
        if (i === a) continue;
        const dx = nodes[i].x - nodes[a].x;
        const dy = nodes[i].y - nodes[a].y;
        const d = dx * dx + dy * dy;
        if (d < bestD && Math.random() < 0.5) {
          bestD = d;
          b = i;
        }
      }
      if (b === -1) return;
      pulses.push({
        a,
        b,
        t: 0,
        speed: 0.006 + Math.random() * 0.012,
        hue: nodes[a].hue,
      });
    };

    let lastSpawn = 0;

    const render = (now: number) => {
      ctx.clearRect(0, 0, w, h);

      const px = pointer.current.x;
      const py = pointer.current.y;
      const pActive = pointer.current.active;
      const parY = scroll.current * 0.04; // gentle parallax drift with scroll

      // ── advance + draw nodes ──
      for (const n of nodes) {
        if (!reduceMotion) {
          n.x += n.vx;
          n.y += n.vy;
          // Cursor gravity — nodes ease toward the pointer, so the mesh
          // visibly gathers where you point.
          if (pActive) {
            const dx = px - n.x;
            const dy = py - n.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 260 * 260 && d2 > 1) {
              const f = 0.16 / Math.sqrt(d2);
              n.vx += dx * f * 0.02;
              n.vy += dy * f * 0.02;
            }
          }
          // friction + gentle clamp so they never rocket off
          n.vx *= 0.985;
          n.vy *= 0.985;
        }
        // wrap
        if (n.x < -20) n.x = w + 20;
        if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20;
        if (n.y > h + 20) n.y = -20;

        const drawY = n.y + parY;
        const rgb = n.hue ? CYAN : EMERALD;
        const near =
          pActive &&
          Math.hypot(px - n.x, py - drawY) < 170
            ? 1
            : 0;
        ctx.beginPath();
        ctx.arc(n.x, drawY, near ? 2.2 : 1.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb}, ${near ? 0.9 : 0.5})`;
        ctx.fill();
      }

      // ── links ──
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist > LINK_DIST) continue;
          const fade = 1 - dist / LINK_DIST;
          // brighten links whose midpoint is near the cursor
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2 + parY;
          const near = pActive ? Math.max(0, 1 - Math.hypot(px - mx, py - my) / 220) : 0;
          const alpha = fade * (0.1 + near * 0.5);
          if (alpha < 0.02) continue;
          const rgb = a.hue && b.hue ? CYAN : EMERALD;
          ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y + parY);
          ctx.lineTo(b.x, b.y + parY);
          ctx.stroke();
        }
      }

      // ── pulses along edges ──
      if (!reduceMotion && now - lastSpawn > 130) {
        spawnPulse();
        lastSpawn = now;
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.t += reduceMotion ? 0 : p.speed;
        if (p.t >= 1 || p.a >= nodes.length || p.b >= nodes.length) {
          pulses.splice(i, 1);
          continue;
        }
        const a = nodes[p.a];
        const b = nodes[p.b];
        const x = a.x + (b.x - a.x) * p.t;
        const y = a.y + (b.y - a.y) * p.t + parY;
        const rgb = p.hue ? CYAN : EMERALD;
        // glow head
        const grd = ctx.createRadialGradient(x, y, 0, x, y, 6);
        grd.addColorStop(0, `rgba(${rgb}, 0.9)`);
        grd.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", build);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Pointer + scroll listeners live outside the render effect so the animation
  // loop is never torn down when they fire.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = e.clientX;
      pointer.current.y = e.clientY;
      pointer.current.active = true;
    };
    const onLeave = () => {
      pointer.current.active = false;
    };
    const onScroll = () => {
      scroll.current = window.scrollY;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Vignette is thin now (the grid is the point). It darkens the far edges just
  // enough to keep foreground cards and text high-contrast.
  const vignette = Math.max(0, Math.min(0.55, 1 - opacity));

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      {/* base wash — obsidian, never pure black, so the grid always has a bed */}
      <div className="absolute inset-0 bg-[#050B18]" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* radial vignette to seat foreground content */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(2,6,23,0.92) 100%)",
          opacity: 0.6 + vignette,
        }}
      />
    </div>
  );
}
