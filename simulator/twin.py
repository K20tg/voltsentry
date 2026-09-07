import asyncio
import json
import random
import sys
import uuid
from datetime import datetime, timezone
from typing import Dict, Optional
import websockets

from shared.schemas import AttackTrigger, AttackType, ControlAck
from simulator.battery import Battery


def iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class StationTwin:
    def __init__(
        self,
        cpid: str,
        base_url: str,
        initial_soc: float = 20.0,
        start_delay: float = 0.0,
    ) -> None:
        self.cpid = cpid
        self.target_url = f"{base_url}/ocpp/{cpid}"
        self.initial_soc = initial_soc
        self.start_delay = start_delay
        self.mode = "clean"
        self.drift_ticks = 0
        self.is_quarantined = False
        self.battery = Battery(initial_soc=initial_soc, max_power_kw=120.0)
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.transaction_id: Optional[int] = None
        self.pending_responses: Dict[str, asyncio.Future] = {}
        self.prefix = f"[twin] [{self.cpid}]"
        self.running = True
        self.receiver_task: Optional[asyncio.Task] = None

    async def call(self, action: str, payload: dict) -> dict:
        """Send an OCPP CALL and wait for matching CALLRESULT."""
        if not self.ws:
            raise RuntimeError("WebSocket is not connected")
        msg_id = str(uuid.uuid4())[:8]
        loop = asyncio.get_running_loop()
        fut = loop.create_future()
        self.pending_responses[msg_id] = fut
        frame = [2, msg_id, action, payload]
        await self.ws.send(json.dumps(frame))
        return await asyncio.wait_for(fut, timeout=10.0)

    async def force_reconnect(self) -> None:
        """Drop the socket so run() reconnects and replays the full session FSM.

        Flipping mode back to 'clean' is not enough: after an oscillate attack the
        twin still holds a transactionId the proxy has already torn down, so every
        subsequent MeterValues trips R1 forever. CONTEXT.md [FIX-7] requires reset
        to reconnect the station, which re-runs Boot -> Authorize -> StartTransaction
        and resynchronises both sides.
        """
        if self.ws is not None:
            try:
                await self.ws.close()
            except Exception:
                pass

    async def _handle_inbound_call(self, msg_id: str, action: str, payload: dict) -> None:
        """Handle server-initiated CALLs (ChangeAvailability, Reset per [FIX-6])."""
        print(f"{self.prefix} Inbound CALL: {action}", flush=True)
        if action == "ChangeAvailability":
            avail_type = payload.get("type", "Inoperative")
            if avail_type == "Inoperative":
                self.is_quarantined = True
                print(f"{self.prefix} Station quarantined (Inoperative)", flush=True)
            else:
                self.is_quarantined = False
                print(f"{self.prefix} Station restored (Operative)", flush=True)
            res = [3, msg_id, {"status": "Accepted"}]
            await self.ws.send(json.dumps(res))
        elif action == "Reset":
            print(f"{self.prefix} Station Reset received", flush=True)
            self.mode = "clean"
            self.drift_ticks = 0
            self.is_quarantined = False
            self.battery = Battery(initial_soc=self.initial_soc, max_power_kw=120.0)
            res = [3, msg_id, {"status": "Accepted"}]
            await self.ws.send(json.dumps(res))
        else:
            res = [3, msg_id, {"status": "Accepted"}]
            await self.ws.send(json.dumps(res))

    async def _receiver_loop(self) -> None:
        """Listen for incoming frames (CALLRESULT, CALLERROR, or inbound CALLs)."""
        try:
            async for message in self.ws:
                try:
                    data = json.loads(message)
                except json.JSONDecodeError:
                    continue

                if not isinstance(data, list) or len(data) < 3:
                    continue

                msg_type = data[0]
                msg_id = data[1]

                if msg_type == 2:
                    # Inbound CALL from server
                    action = data[2]
                    payload = data[3] if len(data) > 3 else {}
                    await self._handle_inbound_call(msg_id, action, payload)
                elif msg_type == 3:
                    # CALLRESULT
                    payload = data[2] if len(data) > 2 else {}
                    if msg_id in self.pending_responses:
                        fut = self.pending_responses.pop(msg_id)
                        if not fut.done():
                            fut.set_result(payload)
                elif msg_type == 4:
                    # CALLERROR
                    if msg_id in self.pending_responses:
                        fut = self.pending_responses.pop(msg_id)
                        if not fut.done():
                            fut.set_exception(RuntimeError(f"OCPP Error: {data}"))
        except (websockets.exceptions.ConnectionClosed, asyncio.CancelledError):
            pass

    async def run(self) -> None:
        """Main lifecycle loop for this charger station."""
        if self.start_delay > 0:
            await asyncio.sleep(self.start_delay)

        while self.running:
            try:
                print(f"{self.prefix} Connecting to {self.target_url}...", flush=True)
                async with websockets.connect(self.target_url) as ws:
                    self.ws = ws
                    self.receiver_task = asyncio.create_task(self._receiver_loop())

                    # 1. BootNotification
                    boot_res = await self.call(
                        "BootNotification",
                        {"chargePointVendor": "VoltSentry", "chargePointModel": "Twin-v1"},
                    )
                    print(f"{self.prefix} BootNotification accepted", flush=True)

                    # 2. Authorize
                    auth_res = await self.call("Authorize", {"idTag": f"TAG-{self.cpid}"})
                    print(f"{self.prefix} Authorized", flush=True)

                    # 3. StartTransaction
                    start_res = await self.call(
                        "StartTransaction",
                        {
                            "connectorId": 1,
                            "idTag": f"TAG-{self.cpid}",
                            "meterStart": 0,
                            "timestamp": iso_now(),
                        },
                    )
                    self.transaction_id = start_res.get("transactionId", random.randint(1000, 9999))
                    print(f"{self.prefix} Transaction started (id: {self.transaction_id})", flush=True)

                    step = 0
                    while self.running:
                        if self.is_quarantined:
                            await asyncio.sleep(1.0)
                            continue

                        step += 1

                        if self.mode == "oscillate":
                            # Rapid Start/Stop cycle at 1 Hz
                            print(f"{self.prefix} [OSCILLATE] Rapid StopTransaction", flush=True)
                            await self.call(
                                "StopTransaction",
                                {
                                    "transactionId": self.transaction_id,
                                    "meterStop": int(self.battery.energy_kwh * 1000),
                                    "timestamp": iso_now(),
                                    "idTag": f"TAG-{self.cpid}",
                                },
                            )
                            await asyncio.sleep(0.5)
                            print(f"{self.prefix} [OSCILLATE] Rapid StartTransaction", flush=True)
                            start_res = await self.call(
                                "StartTransaction",
                                {
                                    "connectorId": 1,
                                    "idTag": f"TAG-{self.cpid}",
                                    "meterStart": int(self.battery.energy_kwh * 1000),
                                    "timestamp": iso_now(),
                                },
                            )
                            self.transaction_id = start_res.get("transactionId", self.transaction_id + 1)
                            await asyncio.sleep(0.5)
                            continue

                        # Normal CC-CV physics tick
                        actual_power, soc, energy_kwh = self.battery.tick(dt=1.0)

                        if self.mode == "meter_spoof":
                            # Draw actual ~120 kW but report 5 kW; energy accumulates truth
                            reported_power = 5.0
                        elif self.mode == "drift":
                            # Compounding -2% under-report per tick
                            self.drift_ticks += 1
                            drift_factor = 0.98 ** self.drift_ticks
                            reported_power = actual_power * drift_factor
                        else:
                            reported_power = actual_power

                        meter_payload = {
                            "connectorId": 1,
                            "transactionId": self.transaction_id,
                            "meterValue": [
                                {
                                    "timestamp": iso_now(),
                                    "sampledValue": [
                                        {
                                            "value": f"{reported_power:.1f}",
                                            "measurand": "Power.Active.Import",
                                            "unit": "kW",
                                        },
                                        {
                                            "value": f"{energy_kwh:.2f}",
                                            "measurand": "Energy.Active.Import.Register",
                                            "unit": "kWh",
                                        },
                                        {
                                            "value": f"{soc:.1f}",
                                            "measurand": "SoC",
                                            "unit": "Percent",
                                        },
                                    ],
                                }
                            ],
                        }

                        await self.call("MeterValues", meter_payload)

                        mode_tag = f" [{self.mode.upper()}]" if self.mode != "clean" else ""
                        print(
                            f"{self.prefix}{mode_tag} Pwr: {reported_power:.1f} kW (actual: {actual_power:.1f}) | SoC: {soc:.1f}% | Energy: {energy_kwh:.2f} kWh",
                            flush=True,
                        )

                        if soc >= 100.0:
                            print(f"{self.prefix} Battery full (100%). Stopping transaction.", flush=True)
                            await self.call(
                                "StopTransaction",
                                {
                                    "transactionId": self.transaction_id,
                                    "meterStop": int(energy_kwh * 1000),
                                    "timestamp": iso_now(),
                                    "idTag": f"TAG-{self.cpid}",
                                },
                            )
                            # Reset battery for next car after brief pause
                            await asyncio.sleep(5.0)
                            self.battery = Battery(initial_soc=15.0, max_power_kw=120.0)
                            break

                        await asyncio.sleep(1.0)

            except (websockets.exceptions.ConnectionClosed, ConnectionRefusedError, OSError) as e:
                if self.is_quarantined:
                    print(f"{self.prefix} Quarantined: waiting for reset signal before reconnecting...", flush=True)
                    while self.is_quarantined and self.running:
                        await asyncio.sleep(1.0)
                    print(f"{self.prefix} Quarantine cleared! Reconnecting to {self.target_url}...", flush=True)
                else:
                    print(f"{self.prefix} Connection lost ({e}), reconnecting in 2s...", flush=True)
                    await asyncio.sleep(2.0)
            except Exception as e:
                print(f"{self.prefix} Error: {e}, restarting session in 2s...", flush=True)
                await asyncio.sleep(2.0)
            finally:
                if self.receiver_task and not self.receiver_task.done():
                    self.receiver_task.cancel()


class FleetManager:
    def __init__(self, base_url: str, station_count: int = 8) -> None:
        self.base_url = base_url
        self.stations: Dict[str, StationTwin] = {}
        for i in range(1, station_count + 1):
            cpid = f"CP-{i:02d}"
            # Stagger initial SoC and start delays for realism
            initial_soc = 15.0 + (i * 4.5) % 35.0  # 15% - 50%
            start_delay = (i - 1) * 0.4            # 0s, 0.4s, 0.8s...
            self.stations[cpid] = StationTwin(cpid, base_url, initial_soc, start_delay)

    def apply_trigger(self, trigger: AttackTrigger) -> ControlAck:
        print(f"[twin] [control] Applying {trigger.attack_type.value} trigger (target: {trigger.station_id})", flush=True)

        if trigger.attack_type == AttackType.METER_SPOOF:
            target_id = trigger.station_id or "CP-03"
            target = self.stations.get(target_id)
            if target:
                target.mode = "meter_spoof"
                return ControlAck(ok=True, detail=f"Station {target_id} mode set to meter_spoof")
            return ControlAck(ok=False, detail=f"Station {target_id} not found")

        elif trigger.attack_type == AttackType.FLEET_OSCILLATE:
            if trigger.station_id:
                target = self.stations.get(trigger.station_id)
                if target:
                    target.mode = "oscillate"
                    return ControlAck(ok=True, detail=f"Station {trigger.station_id} oscillating")
                return ControlAck(ok=False, detail=f"Station {trigger.station_id} not found")
            for s in self.stations.values():
                s.mode = "oscillate"
            return ControlAck(ok=True, detail="Fleet oscillation enabled across all stations")

        elif trigger.attack_type == AttackType.SUBTLE_DRIFT:
            target_id = trigger.station_id or "CP-02"
            target = self.stations.get(target_id)
            if target:
                target.mode = "drift"
                target.drift_ticks = 0
                return ControlAck(ok=True, detail=f"Station {target_id} mode set to subtle_drift")
            return ControlAck(ok=False, detail=f"Station {target_id} not found")

        elif trigger.attack_type == AttackType.RESET:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None
            for s in self.stations.values():
                s.mode = "clean"
                s.drift_ticks = 0
                s.is_quarantined = False
                # Hand back a battery that can actually charge again. Without
                # this, reset reconnects stations at whatever SoC they had
                # reached -- usually past the 80% knee -- so the fleet lands
                # straight back in the CV phase and `r` looks like a no-op.
                s.battery = Battery(initial_soc=s.initial_soc, max_power_kw=120.0)
                if loop is not None:
                    loop.create_task(s.force_reconnect())
            return ControlAck(ok=True, detail="All stations reset to clean mode")

        return ControlAck(ok=False, detail=f"Unhandled attack type: {trigger.attack_type}")

    async def control_handler(self, websocket) -> None:
        """Handle incoming control commands on ws://localhost:9100/control."""
        print("[twin] [control] Client connected to control channel", flush=True)
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    trigger = AttackTrigger.model_validate(data)
                    ack = self.apply_trigger(trigger)
                except Exception as e:
                    ack = ControlAck(ok=False, detail=f"Error processing trigger: {e}")
                await websocket.send(ack.model_dump_json())
        except websockets.exceptions.ConnectionClosed:
            print("[twin] [control] Control client disconnected", flush=True)


async def main() -> None:
    # Port configuration: default to 8000 (proxy), pass 9000 as arg for standalone CSMS testing
    target_port = 8000
    station_count = 8

    # Optional CLI args: [target_port] [station_count]
    if len(sys.argv) > 1:
        target_port = int(sys.argv[1])
    if len(sys.argv) > 2:
        station_count = int(sys.argv[2])

    base_url = f"ws://localhost:{target_port}"
    print(f"[twin] Initializing fleet of {station_count} stations targeting {base_url}...", flush=True)

    fleet = FleetManager(base_url, station_count=station_count)

    # Start control server on port 9100
    control_server = await websockets.serve(fleet.control_handler, "localhost", 9100)
    print("[twin] Control channel listening on ws://localhost:9100/control", flush=True)

    # Launch all station tasks
    station_tasks = [asyncio.create_task(station.run()) for station in fleet.stations.values()]

    try:
        await asyncio.gather(*station_tasks)
    finally:
        control_server.close()
        await control_server.wait_closed()


if __name__ == "__main__":
    asyncio.run(main())
