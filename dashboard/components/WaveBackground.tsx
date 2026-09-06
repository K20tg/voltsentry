"use client";

import React, { useEffect, useRef } from "react";

// VoltSentry green/teal palette for the floating lines.
const LINE_COLORS = ["#0FFF50", "#34D399", "#14B8A6", "#0bcc40"];

interface WaveBackgroundProps {
  opacity?: number;
}

interface FloatingLine {
  x: number;
  y: number;
  len: number;
  angle: number; // radians — near-horizontal with slight drift
  vx: number;
  vy: number;
  alpha: number;
  width: number;
  color: string;
}

/**
 * Floating-lines background (inspired by Kexsio "bg-floatinglines"): a field of
 * thin straight line segments drifting slowly across a dark canvas and wrapping
 * at the edges. Deliberately low-glow — drawn with source-over and low alpha
 * rather than an additive `screen` blend.
 */
export function WaveBackground({ opacity = 0.5 }: WaveBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let lines: FloatingLine[] = [];
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const buildLines = () => {
      const w = canvas.width;
      const h = canvas.height;
      // Density scales with viewport area; capped so it stays subtle.
      const count = Math.min(48, Math.round((w * h) / (150000 * dpr)));
      lines = Array.from({ length: count }, () => {
        // Mostly shallow angles so the lines read as "floating" streaks.
        const angle = (Math.random() - 0.5) * 0.5; // ~±14°
        const speed = (0.15 + Math.random() * 0.45) * dpr;
        const dir = Math.random() < 0.5 ? -1 : 1;
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          len: (80 + Math.random() * 260) * dpr,
          angle,
          vx: Math.cos(angle) * speed * dir,
          vy: Math.sin(angle) * speed * dir + (Math.random() - 0.5) * 0.15 * dpr,
          alpha: 0.08 + Math.random() * 0.22,
          width: (0.6 + Math.random() * 1.1) * dpr,
          color: LINE_COLORS[Math.floor(Math.random() * LINE_COLORS.length)],
        };
      });
    };

    const updateDimensions = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      buildLines();
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = "#0a0e0d";
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "source-over";
      ctx.lineCap = "round";

      for (const line of lines) {
        line.x += line.vx;
        line.y += line.vy;

        // Wrap around the edges (account for line length so it re-enters smoothly).
        const margin = line.len;
        if (line.x < -margin) line.x = w + margin;
        if (line.x > w + margin) line.x = -margin;
        if (line.y < -margin) line.y = h + margin;
        if (line.y > h + margin) line.y = -margin;

        const x2 = line.x + Math.cos(line.angle) * line.len;
        const y2 = line.y + Math.sin(line.angle) * line.len;

        // Fade each line along its length for a soft floating feel.
        const grad = ctx.createLinearGradient(line.x, line.y, x2, y2);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(0.5, line.color);
        grad.addColorStop(1, "rgba(0,0,0,0)");

        ctx.strokeStyle = grad;
        ctx.globalAlpha = line.alpha * (opacity / 0.5);
        ctx.lineWidth = line.width;
        ctx.beginPath();
        ctx.moveTo(line.x, line.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", updateDimensions);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [opacity]);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full object-cover" />
      {/* Vignette to keep cards/text high-contrast over the lines. */}
      <div
        className="absolute inset-0 bg-slate-950 transition-opacity duration-500"
        style={{ opacity: 1 - opacity }}
      />
    </div>
  );
}
