import asyncio
import json
import sys
import uuid
from typing import Optional
import click
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
import websockets

from shared.schemas import AttackTrigger, AttackType, ControlAck

CONTROL_URL = "ws://localhost:9100/control"
PROXY_INGRESS_URL = "ws://localhost:8000/ocpp"

console = Console()


async def send_trigger(trigger: AttackTrigger, control_url: str = CONTROL_URL) -> ControlAck:
    """Send an AttackTrigger over the twin control channel."""
    try:
        async with websockets.connect(control_url) as ws:
            await ws.send(trigger.model_dump_json())
            raw_res = await asyncio.wait_for(ws.recv(), timeout=5.0)
            data = json.loads(raw_res)
            return ControlAck.model_validate(data)
    except Exception as e:
        return ControlAck(ok=False, detail=f"Failed to connect to control channel: {e}")


async def execute_session_shadow(station_id: str = "CP-01", base_url: str = PROXY_INGRESS_URL) -> ControlAck:
    """
    Session Shadowing Attack:
    Opens a rogue, duplicate WebSocket connection to the proxy (:8000)
    using an already-active chargePointId.
    """
    target_url = f"{base_url}/{station_id}"
    console.print(f"[bold red][cli] Initiating rogue socket connection to {target_url}...[/bold red]")
    try:
        async with websockets.connect(target_url) as ws:
            msg_id = str(uuid.uuid4())[:8]
            shadow_frame = [
                2,
                msg_id,
                "BootNotification",
                {"chargePointVendor": "AttackerShadow", "chargePointModel": "EvilTwin-v1"},
            ]
            await ws.send(json.dumps(shadow_frame))
            res = await asyncio.wait_for(ws.recv(), timeout=4.0)
            return ControlAck(ok=True, detail=f"Rogue handshake sent to {target_url}. Response: {res}")
    except websockets.exceptions.ConnectionClosed as e:
        return ControlAck(ok=True, detail=f"Rogue socket closed by proxy (Code: {e.code}, Reason: {e.reason})")
    except Exception as e:
        return ControlAck(ok=False, detail=f"Shadow attack error: {e}")


def display_menu():
    table = Table(title="⚡ VoltSentry Red-Team Exploit Suite ⚡", show_header=True, header_style="bold magenta")
    table.add_column("Key", style="bold cyan", width=6, justify="center")
    table.add_column("Attack Vector", style="bold white", width=20)
    table.add_column("Target", style="green", width=14)
    table.add_column("Expected Detection Rule / Mechanism", style="yellow")

    table.add_row("1", "Meter Spoof", "CP-03", "R2_PHYSICS (Draws 120 kW, reports 5 kW)")
    table.add_row("2", "Fleet Oscillate", "Fleet-wide", "R3_OSCILLATION (1 Hz rapid Start/Stop cycles)")
    table.add_row("3", "Session Shadow", "CP-01 (:8000)", "R4_SESSION_UNIQUE (Rogue duplicate handshake)")
    table.add_row("4", "Subtle Drift", "CP-02", "ML Anomaly (compounding -2% power decay/tick)")
    table.add_row("r", "Fleet Reset", "All Stations", "Clears quarantine & resets to clean mode")
    table.add_row("q", "Quit", "-", "Exit Red-Team CLI")

    console.print(Panel(table, border_style="red", expand=False))


async def run_interactive_tui():
    console.clear()
    while True:
        display_menu()
        choice = click.prompt(click.style("[cli] Enter command key", bold=True, fg="bright_cyan"), default="1")
        choice = choice.strip().lower()

        if choice == "1":
            console.print("[cli] Dispatching [bold red]Meter Spoof[/bold red] to CP-03...")
            trigger = AttackTrigger(attack_type=AttackType.METER_SPOOF, station_id="CP-03")
            ack = await send_trigger(trigger)
            console.print(f"[cli] Result: {'[green]OK[/green]' if ack.ok else '[red]FAILED[/red]'} - {ack.detail}\n")

        elif choice == "2":
            console.print("[cli] Dispatching [bold red]Fleet Oscillate[/bold red]...")
            trigger = AttackTrigger(attack_type=AttackType.FLEET_OSCILLATE, station_id=None)
            ack = await send_trigger(trigger)
            console.print(f"[cli] Result: {'[green]OK[/green]' if ack.ok else '[red]FAILED[/red]'} - {ack.detail}\n")

        elif choice == "3":
            console.print("[cli] Executing [bold red]Session Shadowing[/bold red] directly against :8000...")
            ack = await execute_session_shadow(station_id="CP-01")
            console.print(f"[cli] Result: {'[green]OK[/green]' if ack.ok else '[red]FAILED[/red]'} - {ack.detail}\n")

        elif choice == "4":
            console.print("[cli] Dispatching [bold yellow]Subtle Drift[/bold yellow] to CP-02...")
            trigger = AttackTrigger(attack_type=AttackType.SUBTLE_DRIFT, station_id="CP-02")
            ack = await send_trigger(trigger)
            console.print(f"[cli] Result: {'[green]OK[/green]' if ack.ok else '[red]FAILED[/red]'} - {ack.detail}\n")

        elif choice == "r":
            console.print("[cli] Dispatching [bold green]Fleet Reset[/bold green]...")
            trigger = AttackTrigger(attack_type=AttackType.RESET)
            ack = await send_trigger(trigger)
            console.print(f"[cli] Result: {'[green]OK[/green]' if ack.ok else '[red]FAILED[/red]'} - {ack.detail}\n")

        elif choice in ("q", "quit", "exit"):
            console.print("[cli] Exiting Red-Team CLI.")
            break
        else:
            console.print(f"[cli] [red]Unknown command:[/red] {choice}\n")


@click.command()
@click.option("--attack", "-a", type=click.Choice(["1", "2", "3", "4", "r"]), help="Single-shot attack command key")
@click.option("--station", "-s", default=None, help="Target station ID (e.g. CP-03)")
def main(attack: Optional[str], station: Optional[str]):
    """VoltSentry Red-Team CLI exploit launcher."""
    if attack:
        # Non-interactive single command mode
        if attack == "1":
            trigger = AttackTrigger(attack_type=AttackType.METER_SPOOF, station_id=station or "CP-03")
            ack = asyncio.run(send_trigger(trigger))
        elif attack == "2":
            trigger = AttackTrigger(attack_type=AttackType.FLEET_OSCILLATE, station_id=station)
            ack = asyncio.run(send_trigger(trigger))
        elif attack == "3":
            ack = asyncio.run(execute_session_shadow(station_id=station or "CP-01"))
        elif attack == "4":
            trigger = AttackTrigger(attack_type=AttackType.SUBTLE_DRIFT, station_id=station or "CP-02")
            ack = asyncio.run(send_trigger(trigger))
        elif attack == "r":
            trigger = AttackTrigger(attack_type=AttackType.RESET)
            ack = asyncio.run(send_trigger(trigger))
        console.print(f"[cli] Ack: ok={ack.ok} detail={ack.detail}")
    else:
        # Interactive TUI mode
        try:
            asyncio.run(run_interactive_tui())
        except KeyboardInterrupt:
            console.print("\n[cli] Aborted by user.")


if __name__ == "__main__":
    main()
