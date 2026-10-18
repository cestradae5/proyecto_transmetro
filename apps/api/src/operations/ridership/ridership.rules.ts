import {
  BUS_LOW_OCCUPANCY_FACTOR,
  EXTRA_WAIT_MINUTES,
  STATION_ALERT_FACTOR,
} from "./ridership.constants.js";

// Pure occupancy rules. Counts are estimates: the turnstile only sees who
// enters and leaves a station, never who boards or gets off a bus.

// S1: people waiting reach at least 150% of the station capacity.
export function reachesStationAlert(people: number, capacity: number): boolean {
  return people >= capacity * STATION_ALERT_FACTOR;
}

// S2: a bus below 25% of its capacity waits 5 more minutes.
export function extraWaitMinutes(occupancy: number, capacity: number): number {
  return occupancy < capacity * BUS_LOW_OCCUPANCY_FACTOR ? EXTRA_WAIT_MINUTES : 0;
}

// S8: the waiting board up to the free seats.
export function board(waiting: number, aboard: number, capacity: number): number {
  return Math.max(0, Math.min(waiting, capacity - aboard));
}

// S8: exits during a stop are passengers leaving the bus, but only those who
// were aboard when it arrived can get off.
export function getOff(exits: number, arrivedWith: number): number {
  return Math.max(0, Math.min(exits, arrivedWith));
}

export function percentOf(value: number, capacity: number): number {
  return Math.round((value / capacity) * 100);
}
