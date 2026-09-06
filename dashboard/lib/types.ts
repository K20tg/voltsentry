export type StationStatus =
  | "Available"
  | "Preparing"
  | "Charging"
  | "Finishing"
  | "Quarantined"
  | "Offline";

export interface TelemetryEvent {
  event: "telemetry";
  station_id: string;
  transaction_id?: number | null;
  ts: number;
  power_kw: number;
  soc: number;
  dp_dt: number;
  duration_sec: number;
  energy_register_kwh: number;
  energy_residual_kwh: number;
  status: StationStatus;
  ml_score: number;
}

export interface ThreatEvent {
  event: "threat";
  station_id: string;
  ts: number;
  tier: 1 | 2;
  rule_id?: string | null;
  ml_score?: number | null;
  severity: "low" | "medium" | "high";
  reason: string;
  action_taken: "logged" | "frame_dropped" | "quarantined";
  raw_frame?: string | null;
}

export interface GridEvent {
  event: "grid";
  ts: number;
  total_load_kw: number;
  transformer_capacity_kva: number;
  headroom_pct: number;
  active_stations: number;
}

export type FeedEvent = TelemetryEvent | ThreatEvent | GridEvent;
