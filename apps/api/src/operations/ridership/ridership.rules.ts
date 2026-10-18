import {
  BUS_LOW_OCCUPANCY_FACTOR,
  EXTRA_WAIT_MINUTES,
  STATION_ALERT_FACTOR,
} from "./ridership.constants.js";

// Pure occupancy rules. The turnstile counts who enters and leaves a parada;
// the pilot reports who gets on and off the bus.

// S1: people waiting reach at least 150% of the parada capacity.
export function reachesStationAlert(people: number, capacity: number): boolean {
  return people >= capacity * STATION_ALERT_FACTOR;
}

// S2: a bus below 25% of its capacity waits 5 more minutes.
export function extraWaitMinutes(occupancy: number, capacity: number): number {
  return occupancy < capacity * BUS_LOW_OCCUPANCY_FACTOR ? EXTRA_WAIT_MINUTES : 0;
}

export function percentOf(value: number, capacity: number): number {
  return Math.round((value / capacity) * 100);
}
