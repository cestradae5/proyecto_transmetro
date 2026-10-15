import {
  board,
  extraWaitMinutes,
  getOff,
  percentOf,
  reachesStationAlert,
} from "./ridership.rules.js";

describe("ridership rules", () => {
  describe("reachesStationAlert (S1: at least 150% of the station capacity)", () => {
    it.each([
      [5, 4, false],
      [6, 4, true],
      [7, 4, true],
      [149, 100, false],
      [150, 100, true],
      [7, 5, false],
      [8, 5, true],
      [0, 1, false],
      [14, 10, false],
      [15, 10, true],
    ])("%i people with capacity %i -> %p", (people, capacity, expected) => {
      expect(reachesStationAlert(people, capacity)).toBe(expected);
    });
  });

  describe("extraWaitMinutes (S2: below 25% of the bus capacity waits 5 more minutes)", () => {
    it.each([
      [0, 40, 5],
      [9, 40, 5],
      [10, 40, 0],
      [40, 40, 0],
      [0, 2, 5],
      [1, 2, 0],
      [0, 4, 5],
      [1, 4, 0],
    ])("occupancy %i of %i -> %i minutes", (occupancy, capacity, expected) => {
      expect(extraWaitMinutes(occupancy, capacity)).toBe(expected);
    });
  });

  describe("board (S8)", () => {
    it.each([
      [3, 0, 40, 3],
      [50, 0, 40, 40],
      [8, 39, 40, 1],
      [8, 40, 40, 0],
      [0, 10, 40, 0],
      // A capacity lowered below the carried occupancy boards nobody.
      [5, 45, 40, 0],
      [10, 5, 4, 0],
    ])("%i waiting, %i aboard, capacity %i -> %i board", (waiting, aboard, capacity, expected) => {
      expect(board(waiting, aboard, capacity)).toBe(expected);
    });
  });

  describe("getOff (S8)", () => {
    it.each([
      [2, 0, 0],
      [3, 10, 3],
      [12, 10, 10],
      [0, 10, 0],
    ])("%i exits with %i aboard on arrival -> %i get off", (exits, arrivedWith, expected) => {
      expect(getOff(exits, arrivedWith)).toBe(expected);
    });
  });

  describe("percentOf", () => {
    it.each([
      [6, 4, 150],
      [5, 4, 125],
      [1, 3, 33],
      [0, 40, 0],
    ])("%i of %i -> %i%%", (value, capacity, expected) => {
      expect(percentOf(value, capacity)).toBe(expected);
    });
  });
});
