"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll-reveal via a single IntersectionObserver (no animation dependency).
 *
 * Attach the returned ref to a container; every descendant carrying the
 * `.story-reveal` class gets `data-visible="true"` toggled on as it scrolls
 * into view. The CSS (globals.css) does the actual fade/translate.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>() {
  const rootRef = useRef<T | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>(".story-reveal"));

    // Respect reduced motion / no-IO: reveal everything immediately.
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      targets.forEach((el) => el.setAttribute("data-visible", "true"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-visible", "true");
            observer.unobserve(entry.target); // reveal once, then stop watching
          }
        }
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return rootRef;
}
