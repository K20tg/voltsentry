"""OCPP 1.6-J frame handling — pure functions, no I/O.

Wire format (CONTEXT.md §5.A) is a JSON **array**, not an object:

    CALL       [2, "<uniqueId>", "<Action>", {payload}]
    CALLRESULT [3, "<uniqueId>", {payload}]
    CALLERROR  [4, "<uniqueId>", "<code>", "<desc>", {details}]

A CALLRESULT does not carry the action name; correlation back to the
originating action is the caller's job via a pending-call map (see state.py).

The MeterValues payload shape and the string-typed sampled values are pinned
in CONTEXT.md §6.2.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any, Optional

CALL = 2
CALLRESULT = 3
CALLERROR = 4


@dataclass
class OCPPFrame:
    """A parsed OCPP frame. Fields not carried by a given message type are None."""

    message_type_id: int
    unique_id: str
    action: Optional[str] = None            # CALL only
    payload: Optional[dict] = None          # CALL / CALLRESULT
    error_code: Optional[str] = None        # CALLERROR
    error_description: Optional[str] = None  # CALLERROR
    error_details: Optional[dict] = None    # CALLERROR


def parse_frame(raw: str) -> OCPPFrame:
    """Parse a raw OCPP wire string into an OCPPFrame.

    Raises ValueError on anything that is not a well-formed OCPP array frame.
    """
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"frame is not valid JSON: {exc}") from exc

    if not isinstance(data, list) or len(data) < 2:
        raise ValueError("OCPP frame must be a JSON array of at least 2 elements")

    message_type_id = data[0]
    unique_id = data[1]
    if not isinstance(message_type_id, int):
        raise ValueError("messageTypeId must be an integer")
    if not isinstance(unique_id, str):
        raise ValueError("uniqueId must be a string")

    if message_type_id == CALL:
        if len(data) != 4 or not isinstance(data[2], str) or not isinstance(data[3], dict):
            raise ValueError("malformed CALL frame")
        return OCPPFrame(CALL, unique_id, action=data[2], payload=data[3])

    if message_type_id == CALLRESULT:
        if len(data) != 3 or not isinstance(data[2], dict):
            raise ValueError("malformed CALLRESULT frame")
        return OCPPFrame(CALLRESULT, unique_id, payload=data[2])

    if message_type_id == CALLERROR:
        if len(data) != 5 or not isinstance(data[2], str) or not isinstance(data[3], str):
            raise ValueError("malformed CALLERROR frame")
        details = data[4] if isinstance(data[4], dict) else {}
        return OCPPFrame(
            CALLERROR,
            unique_id,
            error_code=data[2],
            error_description=data[3],
            error_details=details,
        )

    raise ValueError(f"unknown messageTypeId: {message_type_id}")


def serialise_call(action: str, payload: dict, unique_id: Optional[str] = None) -> str:
    """Serialise an outgoing CALL frame [2, uniqueId, action, payload].

    Generates a uniqueId when one is not supplied.
    """
    if unique_id is None:
        unique_id = uuid.uuid4().hex
    return json.dumps([CALL, unique_id, action, payload])


def _sampled_values(payload: dict) -> list[dict[str, Any]]:
    """Flatten the nested MeterValues sampledValue list (CONTEXT.md §6.2)."""
    samples: list[dict[str, Any]] = []
    for meter_value in payload.get("meterValue", []):
        samples.extend(meter_value.get("sampledValue", []))
    return samples


def extract_meter_values(payload: dict) -> dict:
    """Extract {power_kw, energy_register_kwh, soc} from a MeterValues payload.

    Sampled values are strings on the wire (OCPP requirement) and cast to float
    here. Missing measurands come back as 0.0.
    """
    by_measurand = {s.get("measurand"): s.get("value") for s in _sampled_values(payload)}

    def _f(measurand: str) -> float:
        value = by_measurand.get(measurand)
        return float(value) if value is not None else 0.0

    return {
        "power_kw": _f("Power.Active.Import"),
        "energy_register_kwh": _f("Energy.Active.Import.Register"),
        "soc": _f("SoC"),
    }
