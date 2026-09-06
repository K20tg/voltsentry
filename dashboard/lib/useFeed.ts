"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { TelemetryEvent, ThreatEvent, GridEvent, FeedEvent } from "./types";

export interface PowerHistoryPoint {
  time: string;
  timestamp: number;
  [station_id: string]: number | string;
}

interface UseFeedOptions {
  source?: "fixture" | "live";
  onThreat?: (threat: ThreatEvent) => void;
}

export function useFeed(options: UseFeedOptions = {}) {
  const [mode, setMode] = useState<"fixture" | "live">(options.source || "live");
  const [stations, setStations] = useState<Record<string, TelemetryEvent>>({});
  const [grid, setGrid] = useState<GridEvent | null>(null);
  const [threats, setThreats] = useState<ThreatEvent[]>([]);
  const [powerHistory, setPowerHistory] = useState<PowerHistoryPoint[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fixtureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const onThreatRef = useRef(options.onThreat);

  useEffect(() => {
    onThreatRef.current = options.onThreat;
  }, [options.onThreat]);

  const processEvent = useCallback((event: FeedEvent) => {
    if (event.event === "telemetry") {
      setStations((prev) => ({
        ...prev,
        [event.station_id]: event,
      }));

      // Update rolling 60-second power history
      const timeStr = new Date(event.ts * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      setPowerHistory((prev) => {
        const lastPoint = prev[prev.length - 1];
        if (lastPoint && Math.abs(lastPoint.timestamp - event.ts) < 0.5) {
          const updatedPoint: PowerHistoryPoint = {
            ...lastPoint,
            [event.station_id]: event.power_kw,
          };
          return [...prev.slice(0, -1), updatedPoint];
        } else {
          const basePoint: PowerHistoryPoint = {
            ...(lastPoint ? { ...lastPoint } : {}),
            time: timeStr,
            timestamp: event.ts,
            [event.station_id]: event.power_kw,
          };
          return [...prev, basePoint].slice(-60); // keep rolling 60 samples
        }
      });
    } else if (event.event === "grid") {
      setGrid(event);
    } else if (event.event === "threat") {
      setThreats((prev) => [event, ...prev.slice(0, 49)]); // keep latest 50
      if (onThreatRef.current) {
        onThreatRef.current(event);
      }
    }
  }, []);

  // Fixture feed mode
  useEffect(() => {
    if (mode !== "fixture") return;

    let isMounted = true;
    setIsConnected(true);

    fetch("/fixtures/replay.jsonl")
      .then((res) => res.text())
      .then((text) => {
        if (!isMounted) return;

        const lines = text
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        const parsedEvents: FeedEvent[] = [];
        for (const line of lines) {
          try {
            parsedEvents.push(JSON.parse(line));
          } catch (e) {
            console.error("Failed to parse fixture line:", line, e);
          }
        }

        if (parsedEvents.length === 0) return;

        let index = 0;
        fixtureIntervalRef.current = setInterval(() => {
          if (!isMounted) return;
          const ev = parsedEvents[index];
          if (ev) {
            processEvent(ev);
          }
          index = (index + 1) % parsedEvents.length;
        }, 1000);
      })
      .catch((err) => {
        console.error("Error loading fixture replay.jsonl:", err);
      });

    return () => {
      isMounted = false;
      if (fixtureIntervalRef.current) {
        clearInterval(fixtureIntervalRef.current);
      }
    };
  }, [mode, processEvent]);

  // Live WebSocket mode (ws://localhost:8100/feed) with 2s reconnect backoff
  useEffect(() => {
    if (mode !== "live") return;

    let isCancelled = false;

    const connect = () => {
      if (isCancelled) return;

      console.log("[useFeed] Dialing ws://localhost:8100/feed...");
      const ws = new WebSocket("ws://localhost:8100/feed");
      socketRef.current = ws;

      ws.onopen = () => {
        if (isCancelled) return;
        console.log("[useFeed] Live feed connected on :8100");
        setIsConnected(true);
      };

      ws.onmessage = (messageEvent) => {
        if (isCancelled) return;
        try {
          const ev: FeedEvent = JSON.parse(messageEvent.data);
          processEvent(ev);
        } catch (e) {
          console.error("[useFeed] Failed to parse frame:", e);
        }
      };

      ws.onclose = () => {
        if (isCancelled) return;
        console.log("[useFeed] Connection dropped. Retrying in 2 seconds...");
        setIsConnected(false);
        reconnectTimeoutRef.current = setTimeout(connect, 2000);
      };

      ws.onerror = (err) => {
        if (isCancelled) return;
        console.error("[useFeed] Socket error on :8100", err);
        ws.close();
      };
    };

    connect();

    return () => {
      isCancelled = true;
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [mode, processEvent]);

  return {
    stations,
    grid,
    threats,
    powerHistory,
    isConnected,
    mode,
    setMode,
  };
}
