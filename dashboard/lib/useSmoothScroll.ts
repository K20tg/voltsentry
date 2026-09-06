"use client";

import { useEffect, useRef } from "react";

export function useSmoothScroll(lerpFactor = 0.09) {
  const targetScrollY = useRef(0);
  const currentScrollY = useRef(0);
  const isRunning = useRef(false);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Initialize scroll positions
    currentScrollY.current = window.scrollY || window.pageYOffset;
    targetScrollY.current = currentScrollY.current;

    const handleWheel = (e: WheelEvent) => {
      // Allow normal scroll inside scrollable overflow panels (like threat timeline)
      const targetElement = e.target as HTMLElement | null;
      if (targetElement && targetElement.closest(".overflow-y-auto")) {
        return;
      }

      e.preventDefault();

      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      targetScrollY.current = Math.min(
        Math.max(targetScrollY.current + e.deltaY * 0.95, 0),
        maxScroll
      );

      if (!isRunning.current) {
        isRunning.current = true;
        animate();
      }
    };

    const animate = () => {
      const diff = targetScrollY.current - currentScrollY.current;
      currentScrollY.current += diff * lerpFactor;

      window.scrollTo(0, currentScrollY.current);

      if (Math.abs(diff) > 0.5) {
        rafId.current = requestAnimationFrame(animate);
      } else {
        isRunning.current = false;
      }
    };

    const handleSyncScroll = () => {
      if (!isRunning.current) {
        currentScrollY.current = window.scrollY || window.pageYOffset;
        targetScrollY.current = currentScrollY.current;
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("scroll", handleSyncScroll, { passive: true });

    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("scroll", handleSyncScroll);
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [lerpFactor]);
}
