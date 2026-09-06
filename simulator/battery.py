import math


class Battery:
    """
    Pure CC-CV (Constant Current / Constant Voltage) EV Battery model.
    Zero I/O.
    """

    def __init__(
        self,
        capacity_kwh: float = 75.0,
        max_power_kw: float = 120.0,
        initial_soc: float = 20.0,
        target_soc: float = 100.0,
    ) -> None:
        self.capacity_kwh = capacity_kwh
        self.max_power_kw = min(max_power_kw, 150.0)  # Hard physics cap at 150 kW
        self.soc = min(100.0, max(0.0, initial_soc))
        self.target_soc = min(100.0, max(0.0, target_soc))
        self.energy_kwh = 0.0

    @property
    def power_kw(self) -> float:
        """Calculate instant charging power based on CC-CV curve."""
        if self.soc >= self.target_soc or self.soc >= 100.0:
            return 0.0
        
        if self.soc <= 80.0:
            # Constant Current / Constant Power phase
            return self.max_power_kw
        else:
            # Constant Voltage exponential taper phase
            # Power tapers down smoothly from max_power_kw at 80% to < 60 kW at 95%
            taper_factor = math.exp(-0.08 * (self.soc - 80.0))
            return self.max_power_kw * taper_factor

    def tick(self, dt: float) -> tuple[float, float, float]:
        """
        Advance discrete time by dt seconds.
        Returns: (power_kw, soc, energy_kwh)
        """
        if dt <= 0.0 or self.soc >= 100.0:
            return self.power_kw, self.soc, self.energy_kwh

        current_power = self.power_kw
        # Energy delivered during this tick (kWh)
        energy_added = current_power * (dt / 3600.0)
        self.energy_kwh += energy_added

        # Calculate SoC increase (%)
        delta_soc = (energy_added / self.capacity_kwh) * 100.0
        self.soc = min(100.0, self.soc + delta_soc)

        return current_power, self.soc, self.energy_kwh
