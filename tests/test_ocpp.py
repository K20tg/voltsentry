"""Tests for proxy.ocpp — OCPP 1.6-J frame parsing and MeterValues extraction.

Wire format and the MeterValues shape are pinned in CONTEXT.md §6.
Frames are JSON arrays, not objects. Sampled values are strings on the wire.
"""

import json

import pytest

from proxy.ocpp import extract_meter_values, parse_frame, serialise_call


# A valid MeterValues CALL, shaped exactly like CONTEXT.md §6.2.
VALID_METERVALUES = json.dumps(
    [
        2,
        "a3f1",
        "MeterValues",
        {
            "connectorId": 1,
            "transactionId": 1041,
            "meterValue": [
                {
                    "timestamp": "2026-09-06T15:04:05Z",
                    "sampledValue": [
                        {"value": "120.4", "measurand": "Power.Active.Import", "unit": "kW"},
                        {"value": "18.72", "measurand": "Energy.Active.Import.Register", "unit": "kWh"},
                        {"value": "64.0", "measurand": "SoC", "unit": "Percent"},
                    ],
                }
            ],
        },
    ]
)


def test_parse_valid_metervalues_frame():
    frame = parse_frame(VALID_METERVALUES)

    assert frame.message_type_id == 2
    assert frame.unique_id == "a3f1"
    assert frame.action == "MeterValues"
    assert frame.payload["transactionId"] == 1041

    values = extract_meter_values(frame.payload)
    # Values are strings on the wire; the proxy casts them to float.
    assert values == {"power_kw": 120.4, "energy_register_kwh": 18.72, "soc": 64.0}


def test_parse_malformed_frame_raises():
    # Not a JSON array — an object. CONTEXT.md §5.A: the wire format is an array.
    with pytest.raises(ValueError):
        parse_frame('{"messageTypeId": 2, "action": "MeterValues"}')


def test_serialise_call_produces_ocpp_call_array():
    raw = serialise_call("ChangeAvailability", {"connectorId": 1, "type": "Inoperative"})
    decoded = json.loads(raw)

    assert decoded[0] == 2  # CALL
    assert isinstance(decoded[1], str) and decoded[1]  # non-empty uniqueId
    assert decoded[2] == "ChangeAvailability"
    assert decoded[3] == {"connectorId": 1, "type": "Inoperative"}
