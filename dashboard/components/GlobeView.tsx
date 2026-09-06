"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * VoltSentry — dark-mode 3D interactive globe of global EV charging hubs.
 *
 * Data: OpenChargeMap POI API (https://api.openchargemap.io/v3/poi/).
 * Render: globe.gl (three-globe under the hood), night-earth texture, glowing
 * brand-green (#0FFF50) markers, auto-rotate + drag/zoom, hover tooltips.
 *
 * globe.gl touches `window`/WebGL, so it is dynamically imported inside the
 * effect — this keeps the component safe under Next.js server rendering.
 */

const OCM_ENDPOINT = "https://api.openchargemap.io/v3/poi/";
const MARKER_COLOR = "#0FFF50"; // brand EV-green (diverged from the cyan template)
const EARTH_NIGHT = "//unpkg.com/three-globe/example/img/earth-night.jpg";

export interface ChargePoint {
  lat: number;
  lng: number;
  name: string;
  location: string;
  powerKw: number | null;
  connectors: number;
}

type LoadState = "loading" | "ready" | "error";

// Offline/no-key fallback so the demo never renders an empty globe. A dozen
// well-known metro EV hubs — clearly labelled as sample data in the UI.
const FALLBACK_POINTS: ChargePoint[] = [
  { lat: 37.7749, lng: -122.4194, name: "SF Bay Supercharge Hub", location: "San Francisco, USA", powerKw: 250, connectors: 12 },
  { lat: 34.0522, lng: -118.2437, name: "LA Metro Charge Park", location: "Los Angeles, USA", powerKw: 150, connectors: 8 },
  { lat: 40.7128, lng: -74.006, name: "Manhattan Fast Grid", location: "New York, USA", powerKw: 180, connectors: 10 },
  { lat: 51.5074, lng: -0.1278, name: "London Central Chargepoint", location: "London, UK", powerKw: 120, connectors: 6 },
  { lat: 48.8566, lng: 2.3522, name: "Paris Réseau Rapide", location: "Paris, France", powerKw: 175, connectors: 9 },
  { lat: 52.52, lng: 13.405, name: "Berlin Ladehub", location: "Berlin, Germany", powerKw: 300, connectors: 14 },
  { lat: 59.3293, lng: 18.0686, name: "Stockholm Snabbladd", location: "Stockholm, Sweden", powerKw: 200, connectors: 8 },
  { lat: 35.6762, lng: 139.6503, name: "Tokyo Rapid EV Bay", location: "Tokyo, Japan", powerKw: 90, connectors: 6 },
  { lat: 22.3193, lng: 114.1694, name: "Hong Kong Harbour Charge", location: "Hong Kong", powerKw: 120, connectors: 7 },
  { lat: 1.3521, lng: 103.8198, name: "Singapore Grid Node", location: "Singapore", powerKw: 150, connectors: 10 },
  { lat: 28.6139, lng: 77.209, name: "Delhi EV Corridor", location: "New Delhi, India", powerKw: 60, connectors: 5 },
  { lat: 19.076, lng: 72.8777, name: "Mumbai Coastal Charge", location: "Mumbai, India", powerKw: 60, connectors: 4 },
  { lat: -33.8688, lng: 151.2093, name: "Sydney Fast Charge", location: "Sydney, Australia", powerKw: 175, connectors: 8 },
  { lat: -23.5505, lng: -46.6333, name: "São Paulo Carga Rápida", location: "São Paulo, Brazil", powerKw: 100, connectors: 6 },
];

function mapPoi(poi: any): ChargePoint | null {
  const addr = poi?.AddressInfo;
  if (!addr || typeof addr.Latitude !== "number" || typeof addr.Longitude !== "number") {
    return null;
  }
  const connections: any[] = Array.isArray(poi.Connections) ? poi.Connections : [];
  const powerKw = connections.reduce<number | null>((max, c) => {
    const p = typeof c?.PowerKW === "number" ? c.PowerKW : null;
    if (p === null) return max;
    return max === null ? p : Math.max(max, p);
  }, null);
  const locationParts = [addr.Town, addr.StateOrProvince, addr.Country?.Title].filter(Boolean);
  return {
    lat: addr.Latitude,
    lng: addr.Longitude,
    name: addr.Title || "EV Charging Hub",
    location: locationParts.join(", ") || "Unknown location",
    powerKw,
    connectors: typeof poi.NumberOfPoints === "number" ? poi.NumberOfPoints : connections.length,
  };
}

function tooltipHtml(d: ChargePoint): string {
  const power = d.powerKw != null ? `${d.powerKw} kW` : "power n/a";
  return `
    <div style="
      background:rgba(16,22,20,0.94);
      border:1px solid rgba(15,255,80,0.4);
      border-radius:10px; padding:10px 12px; max-width:240px;
      box-shadow:0 8px 26px rgba(0,0,0,0.6);
      font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">
      <div style="color:#0FFF50;font-weight:800;font-size:12px;margin-bottom:3px;">${escapeHtml(d.name)}</div>
      <div style="color:#e6f2ec;font-size:11px;">${escapeHtml(d.location)}</div>
      <div style="color:#8aa39a;font-size:10px;margin-top:5px;letter-spacing:0.04em;">
        ⚡ ${power} · ${d.connectors} connector${d.connectors === 1 ? "" : "s"}
      </div>
    </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

export function GlobeView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [count, setCount] = useState(0);
  const [usedFallback, setUsedFallback] = useState(false);

  useEffect(() => {
    let globe: any = null;
    let disposed = false;
    let ro: ResizeObserver | null = null;

    async function init() {
      const el = containerRef.current;
      if (!el) return;

      // 1) Fetch charge points (with graceful fallback) BEFORE building the globe.
      let points: ChargePoint[] = [];
      let fellBack = false;
      try {
        const key = process.env.NEXT_PUBLIC_OPENCHARGEMAP_API_KEY;
        if (!key) throw new Error("no-api-key");
        const params = new URLSearchParams({
          output: "json",
          maxresults: "500",
          compact: "true",
          verbose: "false",
          key,
        });
        const res = await fetch(`${OCM_ENDPOINT}?${params.toString()}`, {
          headers: { "X-API-Key": key },
        });
        if (!res.ok) throw new Error(`OCM HTTP ${res.status}`);
        const json = await res.json();
        points = (Array.isArray(json) ? json : []).map(mapPoi).filter(Boolean) as ChargePoint[];
        if (points.length === 0) throw new Error("empty-dataset");
      } catch (err) {
        console.warn("[GlobeView] OpenChargeMap fetch failed, using sample data:", err);
        points = FALLBACK_POINTS;
        fellBack = true;
      }
      if (disposed) return;

      // 2) Build the globe (dynamic import keeps three/WebGL out of SSR).
      const Globe = (await import("globe.gl")).default;
      if (disposed || !containerRef.current) return;

      globe = new Globe(containerRef.current)
        .backgroundColor("#050811")
        .globeImageUrl(EARTH_NIGHT)
        .showAtmosphere(true)
        .atmosphereColor(MARKER_COLOR)
        .atmosphereAltitude(0.12)
        .pointsData(points)
        .pointLat((d: any) => d.lat)
        .pointLng((d: any) => d.lng)
        .pointColor(() => MARKER_COLOR)
        .pointAltitude((d: any) => 0.01 + Math.min((d.powerKw ?? 40) / 350, 0.12))
        .pointRadius(0.28)
        .pointsMerge(false)
        .pointLabel((d: any) => tooltipHtml(d))
        .width(containerRef.current.clientWidth)
        .height(containerRef.current.clientHeight);

      // Auto-rotate + interaction defaults.
      const controls = globe.controls();
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.6;
      controls.enableZoom = true;
      globe.pointOfView({ lat: 20, lng: 0, altitude: 2.4 }, 0);

      setCount(points.length);
      setUsedFallback(fellBack);
      setState(fellBack ? "error" : "ready");

      // 3) Keep the canvas sized to its container.
      const resize = () => {
        if (!globe || !containerRef.current) return;
        globe.width(containerRef.current.clientWidth);
        globe.height(containerRef.current.clientHeight);
      };
      window.addEventListener("resize", resize);
      ro = new ResizeObserver(resize);
      ro.observe(containerRef.current);

      // stash for cleanup
      (init as any)._resize = resize;
    }

    init();

    return () => {
      disposed = true;
      if (ro) ro.disconnect();
      if ((init as any)._resize) window.removeEventListener("resize", (init as any)._resize);
      if (globe) {
        try {
          globe._destructor?.();
        } catch {
          /* globe.gl teardown is best-effort */
        }
      }
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0" />

      {state === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
          <div className="w-10 h-10 rounded-full border-2 border-volt-green/30 border-t-volt-green animate-spin" />
          <p className="font-mono text-xs text-volt-green animate-pulse">
            Fetching global EV charging network…
          </p>
        </div>
      )}

      {/* Data source / status chip */}
      {state !== "loading" && (
        <div className="absolute bottom-4 left-4 z-10 font-mono text-[11px]">
          <div className="px-3 py-1.5 rounded-lg bg-black/60 border border-volt-line backdrop-blur-md flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-volt-green shadow-volt-glow-sm" />
            <span className="text-volt-text">
              {count.toLocaleString()} charging hubs
            </span>
            <span className="text-volt-muted">
              · {usedFallback ? "sample data (set API key for live)" : "OpenChargeMap live"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default GlobeView;
