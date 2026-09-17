"use client";

/**
 * useTwinControl — browser client for the charger twin's control channel.
 *
 * The twin already exposes ws://localhost:9100/control and accepts an
 * AttackTrigger (shared/schemas.py) as JSON, replying with a ControlAck. That
 * is exactly what cli/attack.py speaks, so the dashboard can drive the same
 * red-team injections without touching any Python.
 *
 *   -> {"attack_type": "meter_spoof", "station_id": "CP-03", "params": {}}
 *   <- {"ok": true, "detail": "..."}
 *
 * The socket is opened lazily on the first injection and kept warm afterwards.
 * If the twin is not running (fixture/replay mode, or a demo with only the
 * dashboard up) the connection simply fails and `status` reports it — callers
 * surface that rather than pretending the attack landed.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Mirrors AttackType in shared/schemas.py. */
export type AttackType =
  | "meter_spoof"
  | "fleet_oscillate"
  | "session_shadow"
  | "subtle_drift"
  | "reset";

export type ControlStatus =
  | "idle"
  | "connecting"
  | "open"
  | "unavailable"
  | "closed";

export interface ControlAck {
  ok: boolean;
  detail: string;
}

const CONTROL_URL = "ws://localhost:9100/control";
const CONNECT_TIMEOUT_MS = 2500;

export function useTwinControl() {
  const [status, setStatus] = useState<ControlStatus>("idle");
  const [lastAck, setLastAck] = useState<ControlAck | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<((ack: ControlAck) => void)[]>([]);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      pendingRef.current = [];
      const sock = socketRef.current;
      socketRef.current = null;
      if (sock && sock.readyState <= WebSocket.OPEN) sock.close();
    };
  }, []);

  /** Resolve (or reuse) an open socket. Rejects if the twin is unreachable. */
  const connect = useCallback((): Promise<WebSocket> => {
    const existing = socketRef.current;
    if (existing && existing.readyState === WebSocket.OPEN) {
      return Promise.resolve(existing);
    }

    return new Promise<WebSocket>((resolve, reject) => {
      let settled = false;
      // Distinguishes "we were connected and the twin went away" from "we could
      // never reach it": only the former should downgrade to `closed`, or the
      // badge would stop reporting an unreachable twin as offline.
      let opened = false;
      setStatus("connecting");

      let ws: WebSocket;
      try {
        ws = new WebSocket(CONTROL_URL);
      } catch {
        setStatus("unavailable");
        reject(new Error("control channel unavailable"));
        return;
      }

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {
          /* already dead */
        }
        if (!unmountedRef.current) setStatus("unavailable");
        reject(new Error("control channel timed out"));
      }, CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        if (settled) return;
        settled = true;
        opened = true;
        clearTimeout(timeout);
        socketRef.current = ws;
        if (!unmountedRef.current) setStatus("open");
        resolve(ws);
      };

      // The twin answers one ControlAck per trigger, in order, so a FIFO of
      // resolvers is enough to pair replies with sends.
      ws.onmessage = (ev) => {
        let ack: ControlAck;
        try {
          const parsed = JSON.parse(ev.data as string) as Partial<ControlAck>;
          ack = { ok: !!parsed.ok, detail: parsed.detail ?? "" };
        } catch {
          ack = { ok: false, detail: "Malformed ack from twin" };
        }
        if (!unmountedRef.current) setLastAck(ack);
        const next = pendingRef.current.shift();
        if (next) next(ack);
      };

      ws.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (!unmountedRef.current) setStatus("unavailable");
        reject(new Error("control channel error"));
      };

      ws.onclose = () => {
        clearTimeout(timeout);
        if (socketRef.current === ws) socketRef.current = null;
        // Flush anyone still waiting so a caller never hangs.
        const waiting = pendingRef.current;
        pendingRef.current = [];
        waiting.forEach((fn) =>
          fn({ ok: false, detail: "Control channel closed mid-request" })
        );
        // A socket that never opened keeps its `unavailable` status.
        if (!unmountedRef.current && opened) setStatus("closed");
      };
    });
  }, []);

  /**
   * Fire one attack trigger. Resolves with the twin's ack, or a synthetic
   * failure ack when the twin is unreachable — callers always get an answer.
   */
  const inject = useCallback(
    async (
      attackType: AttackType,
      stationId?: string | null
    ): Promise<ControlAck> => {
      let ws: WebSocket;
      try {
        ws = await connect();
      } catch {
        const ack: ControlAck = {
          ok: false,
          detail:
            "Twin control channel unreachable on :9100 — start `python -m simulator.twin` to inject live attacks.",
        };
        if (!unmountedRef.current) setLastAck(ack);
        return ack;
      }

      return new Promise<ControlAck>((resolve) => {
        const timeout = setTimeout(() => {
          const idx = pendingRef.current.indexOf(handler);
          if (idx >= 0) pendingRef.current.splice(idx, 1);
          resolve({ ok: false, detail: "Twin did not acknowledge in time" });
        }, CONNECT_TIMEOUT_MS);

        const handler = (ack: ControlAck) => {
          clearTimeout(timeout);
          resolve(ack);
        };

        pendingRef.current.push(handler);
        try {
          ws.send(
            JSON.stringify({
              attack_type: attackType,
              station_id: stationId ?? null,
              params: {},
            })
          );
        } catch {
          clearTimeout(timeout);
          pendingRef.current.pop();
          resolve({ ok: false, detail: "Failed to send trigger" });
        }
      });
    },
    [connect]
  );

  return { status, lastAck, inject };
}
