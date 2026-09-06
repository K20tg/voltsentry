"use client";

import React, { useEffect, useRef } from "react";

const KEXSIO_COLORS = ["#5227FF", "#FF9FFC", "#B497CF", "#22D3EE"];

export function WaveBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let phase = 0;

    const updateDimensions = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      // Dark background fill
      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, width, height);

      // Create multi-stop Kexsio gradient
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0.0, KEXSIO_COLORS[0]); // #5227FF
      gradient.addColorStop(0.35, KEXSIO_COLORS[1]); // #FF9FFC
      gradient.addColorStop(0.7, KEXSIO_COLORS[2]); // #B497CF
      gradient.addColorStop(1.0, KEXSIO_COLORS[3]); // #22D3EE

      ctx.save();
      ctx.globalCompositeOperation = "screen";

      // Draw 6 wave lines across the canvas
      const numWaves = 6;
      for (let w = 0; w < numWaves; w++) {
        ctx.beginPath();
        const baseOffsetY = height * (0.35 + w * 0.1);
        const waveAmplitude = (35 + w * 15) * (height / 1000);
        const waveFrequency = 0.0015 + w * 0.0004;
        const wavePhase = phase * (0.8 + w * 0.2) + w * 1.5;

        for (let x = 0; x <= width; x += 4) {
          const y =
            baseOffsetY +
            Math.sin(x * waveFrequency + wavePhase) * waveAmplitude +
            Math.cos(x * 0.002 - wavePhase * 0.5) * (waveAmplitude * 0.5);

          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.strokeStyle = gradient;
        ctx.lineWidth = (2.5 + w * 0.5) * (width / 1920);
        ctx.globalAlpha = 0.35 - w * 0.04;
        ctx.stroke();
      }

      ctx.restore();

      phase += 0.012;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", updateDimensions);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full object-cover" />
      {/* Dark overlay vignette to ensure high contrast text & cards */}
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px]" />
    </div>
  );
}
