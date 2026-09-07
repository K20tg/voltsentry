"""Real-dataset loading + attack synthesis for Tier-2 (pure functions, no sockets).

Turns a charging dataset (ACN-Data session rows, a generic CSV/JSON, or the
VoltSentry recorded telemetry feed) into honest 5-dim feature vectors, and
synthesises the two data-integrity attacks exactly as `simulator/twin.py` emits
them, so the Tier-2 forest can be fitted and benchmarked offline.

What is REAL vs SYNTHESISED (surfaced in the training report):
  * duration + delivered energy: taken from the dataset.
  * per-timestep power: the real profile when the dataset carries one; otherwise
    a CC-CV shape is reconstructed and scaled so its integral == delivered energy
    ("profile shape synthesized, energy + duration real").
  * SoC: the real series when present, else approximated from cumulative energy
    against a nominal pack capacity ("approximated").
  * energy residual honest baseline: modelled as N(0, 0.05) additive noise on the
    register ("assumed noise model").

Feature order is the frozen FEATURE_ORDER; vectors are built with the production
`compute_session_features`, so the offline math matches the live wire exactly.
"""

from __future__ import annotations

import csv
import json
import zlib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Optional, Sequence

import numpy as np

from proxy.ml_engine import compute_session_features

# ---- column maps (ACN-Data defaults + generic fallbacks) ------------------
# Each logical field maps to an ordered list of candidate source keys; the first
# present wins. Missing optional fields fall back to reconstruction/approximation.
COLUMN_MAP = {
    "session_id": ["sessionID", "session_id", "_id", "id", "transaction_id"],
    "station_id": ["stationID", "spaceID", "station_id", "station", "connector_id"],
    "connect": ["connectionTime", "connect_time", "connectTime", "start_time", "start"],
    "disconnect": ["disconnectTime", "disconnect_time", "end_time", "end", "stop_time"],
    "done": ["doneChargingTime", "done_charging_time", "doneCharging"],
    "energy_kwh": ["kWhDelivered", "kwh_delivered", "kwh", "energy_kwh", "energy"],
    # optional per-timestep profile (list of numbers or (t, value) pairs)
    "power_profile": ["power_profile", "pilotSignal", "chargingCurrent", "power"],
}

DEFAULT_CAPACITY_KWH = 75.0
DEFAULT_HZ = 1.0
DEFAULT_START_FRAC = 0.2
RESIDUAL_NOISE_STD = 0.05
_RESIDUAL = 4  # index of energy_residual_kwh in FEATURE_ORDER


# ---- timestamp parsing ----------------------------------------------------

def parse_time_seconds(value) -> float:
    """Parse ISO-8601, RFC-1123, or an 'hh:mm:ss' duration into seconds (float).

    Absolute timestamps return unix-epoch seconds; a bare 'hh:mm:ss' returns its
    duration in seconds. Numbers pass through as epoch seconds.
    """
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    if not s:
        raise ValueError("empty timestamp")

    # hh:mm:ss (or h:mm:ss) duration — no date, no comma, no 'T'
    parts = s.split(":")
    if len(parts) == 3 and all(p.strip().lstrip("-").isdigit() for p in parts):
        h, m, sec = (int(p) for p in parts)
        return float(h * 3600 + m * 60 + sec)

    # RFC-1123: "Wed, 01 May 2019 07:00:00 GMT"
    if "," in s and any(mon in s for mon in _MONTHS):
        dt = parsedate_to_datetime(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()

    # ISO-8601 (tolerate a trailing Z)
    iso = s.replace("Z", "+00:00")
    dt = datetime.fromisoformat(iso)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


# ---- Session model --------------------------------------------------------

@dataclass
class Session:
    session_id: str
    station_id: str
    duration_sec: float
    energy_kwh: float                                  # ground-truth delivered kWh
    capacity_kwh: float = DEFAULT_CAPACITY_KWH
    power_profile: Optional[list] = None               # [(t_sec, power_kw), ...] real
    soc_profile: Optional[list] = None                 # [(t_sec, soc_pct), ...] real
    connect_ts: Optional[float] = None                 # epoch, for report date range
    provenance: dict = field(default_factory=dict)     # what was real vs synthesised


# ---- loaders --------------------------------------------------------------

def _pick(row: dict, candidates: Sequence[str]):
    for key in candidates:
        if key in row and row[key] not in (None, ""):
            return row[key]
    return None


def _session_from_row(row: dict, cmap: dict, capacity: float, prov: dict) -> Optional[Session]:
    sid = _pick(row, cmap["session_id"])
    if sid is None:
        return None
    connect = _pick(row, cmap["connect"])
    disconnect = _pick(row, cmap["disconnect"])
    done = _pick(row, cmap["done"])
    energy = _pick(row, cmap["energy_kwh"])
    if energy is None:
        return None

    connect_ts = parse_time_seconds(connect) if connect is not None else None
    if disconnect is not None and connect is not None:
        duration = parse_time_seconds(disconnect) - connect_ts
    elif done is not None and connect is not None:
        duration = parse_time_seconds(done) - connect_ts
        prov["duration"] = "from doneChargingTime (disconnect missing)"
    else:
        duration = 3600.0
        prov["duration"] = "defaulted to 3600 s (no timestamps)"
    duration = max(float(duration), 60.0)

    station = _pick(row, cmap["station_id"]) or "UNKNOWN"
    return Session(
        session_id=str(sid),
        station_id=str(station),
        duration_sec=float(duration),
        energy_kwh=float(energy),
        capacity_kwh=capacity,
        connect_ts=connect_ts,
        provenance=dict(prov),
    )


def _load_telemetry_stream(records: list, capacity: float) -> list[Session]:
    """Group VoltSentry telemetry events into sessions with a real power profile."""
    groups: dict = {}
    for r in records:
        if r.get("event") != "telemetry":
            continue
        key = str(r.get("transaction_id") or r.get("station_id"))
        groups.setdefault(key, []).append(r)

    sessions: list[Session] = []
    for key, evs in groups.items():
        evs.sort(key=lambda e: e["ts"])
        t0 = evs[0]["ts"]
        power = [(float(e["ts"] - t0), float(e["power_kw"])) for e in evs]
        soc = [(float(e["ts"] - t0), float(e.get("soc", 0.0))) for e in evs]
        duration = max(float(evs[-1]["ts"] - t0), 60.0)
        # Ground-truth energy = integral of the REAL reported power profile. The
        # feed's energy_register field is demo-seeded and not consistent with the
        # short capture window, so we do not trust it as delivered energy.
        ta = np.asarray([p[0] for p in power], dtype=float)
        pa = np.asarray([p[1] for p in power], dtype=float)
        energy = float(np.trapz(pa, ta) / 3600.0) if len(pa) > 1 else 0.0
        sessions.append(
            Session(
                session_id=key,
                station_id=str(evs[0].get("station_id", "UNKNOWN")),
                duration_sec=duration,
                energy_kwh=energy if energy > 0 else 30.0,
                capacity_kwh=capacity,
                power_profile=power,
                soc_profile=soc,
                connect_ts=t0,
                provenance={"power": "real profile", "soc": "real"},
            )
        )
    return sessions


def load_sessions(
    path, capacity: float = DEFAULT_CAPACITY_KWH, column_map: Optional[dict] = None
) -> list[Session]:
    """Load sessions from .csv / .json / .jsonl. Never raises on a missing field."""
    path = Path(path)
    cmap = column_map or COLUMN_MAP
    suffix = path.suffix.lower()

    if suffix == ".csv":
        prov = {"power": "CC-CV shape synthesized, energy+duration real", "soc": "approximated"}
        with path.open(newline="", encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh))
        out = [_session_from_row(r, cmap, capacity, prov) for r in rows]
        return [s for s in out if s is not None]

    if suffix == ".jsonl":
        records = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    else:  # .json
        blob = json.loads(path.read_text(encoding="utf-8"))
        records = blob.get("_items", blob) if isinstance(blob, dict) else blob

    if records and isinstance(records[0], dict) and records[0].get("event") == "telemetry":
        return _load_telemetry_stream(records, capacity)

    prov = {"power": "CC-CV shape synthesized, energy+duration real", "soc": "approximated"}
    out = [_session_from_row(r, cmap, capacity, prov) for r in records if isinstance(r, dict)]
    return [s for s in out if s is not None]


# ---- power / feature construction -----------------------------------------

@dataclass
class Series:
    ts: np.ndarray
    true_power: np.ndarray
    reported_power: np.ndarray
    soc: np.ndarray
    register: np.ndarray            # register (true cumulative energy + noise), kWh
    residual: np.ndarray            # register - integral(reported power)
    start_index: int                # first attacked sample (== len for honest)
    vectors: list                   # list[list[float]] in FEATURE_ORDER


def _reconstruct_cc_cv(t: np.ndarray, dt: float, energy_kwh: float) -> np.ndarray:
    """A CC-CV power shape scaled so its time-integral equals energy_kwh."""
    T = max(t[-1], dt)
    knee = 0.7 * T                       # constant current for the first ~70% of time
    tau = max(0.12 * T, dt)              # CV exponential taper time-constant
    shape = np.where(t <= knee, 1.0, np.exp(-(t - knee) / tau))
    integral_kwh = shape.sum() * dt / 3600.0
    peak = energy_kwh / integral_kwh if integral_kwh > 0 else 0.0
    return shape * peak


def _true_power(session: Session, t: np.ndarray, dt: float) -> np.ndarray:
    """Real profile resampled to the grid, or a reconstructed CC-CV shape.

    A real profile is used AS-IS (it is the physical truth); the register is then
    the integral of that profile, so an honest session's residual sits on its noise
    baseline. Only a reconstructed shape is scaled to a stated delivered energy.
    """
    if session.power_profile:
        pts = np.asarray(session.power_profile, dtype=float)
        return np.interp(t, pts[:, 0], pts[:, 1])
    return _reconstruct_cc_cv(t, dt, session.energy_kwh)


def _rng_for(session: Session, seed: int) -> np.random.Generator:
    mixed = (seed ^ zlib.crc32(session.session_id.encode())) & 0xFFFFFFFF
    return np.random.default_rng(mixed)


def build_series(
    session: Session,
    kind: str = "clean",
    start_frac: float = DEFAULT_START_FRAC,
    seed: int = 42,
    hz: float = DEFAULT_HZ,
) -> Series:
    """Build the reported/true power + feature vectors for a session.

    `kind` is 'clean', 'meter_spoof' or 'subtle_drift'. Attacks begin at
    `start_frac` into the session and match `simulator/twin.py` exactly: the
    register always accumulates TRUE energy, while reported power is spoofed.
    """
    dt = 1.0 / hz
    n = max(int(round(session.duration_sec * hz)) + 1, 4)
    t = np.arange(n) * dt
    true_power = _true_power(session, t, dt)

    start_index = int(n * start_frac) if kind != "clean" else n
    reported = true_power.copy()
    if kind == "meter_spoof":
        reported[start_index:] = 5.0
    elif kind == "subtle_drift":
        # matches twin: drift_ticks pre-increments, so k = 1, 2, 3, ... after start
        for j in range(start_index, n):
            k = j - start_index + 1
            reported[j] = true_power[j] * (0.98 ** k)
    elif kind != "clean":
        raise ValueError(f"unknown attack kind: {kind}")

    # register = cumulative TRUE energy (rectangle rule) + honest-baseline noise
    reg_true = np.cumsum(true_power) * dt / 3600.0
    rng = _rng_for(session, seed)
    register = reg_true + rng.normal(0.0, RESIDUAL_NOISE_STD, n)

    # SoC: real series if present, else approximated from cumulative energy
    if session.soc_profile:
        pts = np.asarray(session.soc_profile, dtype=float)
        soc = np.clip(np.interp(t, pts[:, 0], pts[:, 1]), 0.0, 100.0)
    else:
        soc = np.clip(100.0 * reg_true / session.capacity_kwh, 0.0, 100.0)

    # Walk the production feature function so offline vectors match the live wire.
    vectors: list = []
    residual = np.zeros(n)
    prev_ts = None
    prev_power = None
    integral = 0.0
    session_start = float(t[0])
    count = 0
    for i in range(n):
        feats = compute_session_features(
            power_kw=float(reported[i]),
            soc=float(soc[i]),
            energy_register_kwh=float(register[i]),
            ts=float(t[i]),
            prev_ts=prev_ts,
            prev_power_kw=prev_power,
            energy_integral_kwh=integral,
            session_start_ts=session_start,
            sample_count=count,
        )
        vectors.append(feats.as_vector())
        residual[i] = feats.energy_residual_kwh
        prev_ts = float(t[i])
        prev_power = float(reported[i])
        integral = feats.energy_integral_kwh
        count = feats.sample_count

    return Series(
        ts=t,
        true_power=true_power,
        reported_power=reported,
        soc=soc,
        register=register,
        residual=residual,
        start_index=start_index,
        vectors=vectors,
    )


def session_to_vectors(session: Session, seed: int = 42, hz: float = DEFAULT_HZ) -> list:
    """Honest 5-dim feature vectors for a session (no attack), sampled at `hz`."""
    return build_series(session, "clean", seed=seed, hz=hz).vectors


def apply_attack(
    session: Session,
    kind: str,
    start_frac: float = DEFAULT_START_FRAC,
    seed: int = 42,
    hz: float = DEFAULT_HZ,
) -> list:
    """Feature vectors for a session under `kind` ('meter_spoof' | 'subtle_drift')."""
    return build_series(session, kind, start_frac=start_frac, seed=seed, hz=hz).vectors
