/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
 *
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details. Alternatively,
 * consult http://micropolisjs.graememcc.co.uk/LICENSE and
 * http://micropolisjs.graememcc.co.uk/COPYING
 *
 * The name/term "MICROPOLIS" is a registered trademark of Micropolis (https://www.micropolis.com) GmbH
 * (Micropolis Corporation, the "licensor") and is licensed here to the authors/publishers of the "Micropolis"
 * city simulation game and its source code (the project or "licensee(s)") as a courtesy of the owner.
 *
 */

import type { Ride, TilePosition } from "./protocol";
import { CAR_CROSSING_MS } from "./roadTraffic";
import { sameTile, tileKey, tripRoute } from "./routeTiles";

// The trains the client draws for the city's rides, on its timetable: each ride boards a departure from its station,
// stamped with the step clock's value it leaves at (protocol/README.md). The rides that board one station at one
// departure leaving the same way, each the same track as far as it goes, ride one train, a car each, up to
// MOST_TRAIN_CARS; the rest wait for the next departure, in the picture only. A train stands at its station until it
// leaves, follows the path of its longest ride, and drops a car where each of its other rides gets off. Trains run on
// the right-hand track of the double track, each way its own, so trains each way pass.

// The steps the city takes a second of real time, at which the step clock a ride's departure counts on moves: the
// rules' Simulation.StepsPerSecond, which test/cars.ts holds this to, as the fixture tool writes it into
// conformance/ruleConstants.json
export const STEPS_PER_SECOND = 60;

// The steps of the step clock between one departure from a station and the next, each way: the rules'
// Timetable.DepartureInterval, which test/cars.ts holds this to, as STEPS_PER_SECOND
export const DEPARTURE_INTERVAL = 240;

// How fast a train runs, in tiles a second
export const TRAIN_TILES_PER_SECOND = 6;

// The most cars a train has, one a ride
export const MOST_TRAIN_CARS = 4;

// How far each car of a train runs behind the one ahead of it, in tiles
export const TRAIN_CAR_SPACING = 0.75;

// How far a car of a train reaches ahead of its middle and behind it, in tiles: the tiles it is on
const TRAIN_CAR_REACH = TRAIN_CAR_SPACING / 2;

// A train: its path, from its station's tile, and the steps along it, its longest ride's, which a longer ride boarding
// it replaces; its rides' last distances along it, longest first, a car each; the step clock's value it leaves its
// station at, and the client's drive clock as it leaves
export interface Train {
  path: TilePosition[];
  steps: string;
  readonly ends: number[];
  readonly departure: number;
  readonly leaves: number;
}

// The clocks as a ride arrives: the client's drive clock, in milliseconds, and the city's step clock, as the batch
// that brought the ride carried it
export interface RideClocks {
  readonly drive: number;
  readonly steps: number;
}

// How many cars a train has, one a ride
export function carsOf(train: Train): number {
  return train.ends.length;
}

// How far its front has gone at the drive clock given, in tiles: none before it leaves
export function frontOf(train: Train, clock: number): number {
  return Math.max(0, (clock - train.leaves) / 1000 * TRAIN_TILES_PER_SECOND);
}

// How far the train's front goes before it is gone, in tiles: until each car has reached where its ride gets off
export function lastFrontOf(train: Train): number {
  return Math.max(...train.ends.map((end, car) => end + car * TRAIN_CAR_SPACING));
}

// How far a car of the train, by its place in the train from the front, has gone at the drive clock given, in tiles:
// TRAIN_CAR_SPACING behind the car ahead, short of the station while it is still to leave it
function carAt(train: Train, car: number, clock: number): number {
  return frontOf(train, clock) - car * TRAIN_CAR_SPACING;
}

// Where each car of the train shows, at the drive clock given, as its distance along the path, front first: from
// leaving the station it got on at to reaching where its ride gets off. A train standing at its station shows its front
// car there.
export function carsShown(train: Train, clock: number): number[] {
  const shown: number[] = [];
  train.ends.forEach((end, car) => {
    const at = carAt(train, car, clock);
    if (at >= 0 && at <= end) {
      shown.push(at);
    }
  });
  return shown;
}

// The keys of the tiles a train's cars are on at the drive clock given, and of those each will reach within
// CAR_CROSSING_MS, short of where its ride gets off: a level crossing among them is closed to cars, so a car that took
// one is over it before a train comes. A train standing at its station closes nothing past it until it is about to
// leave.
export function tilesOf(train: Train, clock: number, into: Set<number>): void {
  train.ends.forEach((end, car) => {
    const from = Math.max(0, carAt(train, car, clock));
    const to = Math.min(end, carAt(train, car, clock + CAR_CROSSING_MS));
    if (from > end || to < 0) {
      return;
    }
    const first = Math.max(0, Math.round(from - TRAIN_CAR_REACH));
    const last = Math.min(train.path.length - 1, Math.round(to + TRAIN_CAR_REACH));
    for (let index = first; index <= last; index++) {
      into.add(tileKey(train.path[index]));
    }
  });
}

// The trains waiting at their stations and running, made from the rides the city sends
export class Trains {
  private readonly running: Train[] = [];
  private carCount = 0;

  get all(): readonly Train[] {
    return this.running;
  }

  // How many cars the trains have, one a ride
  get cars(): number {
    return this.carCount;
  }

  // A car for a ride, which has a step at least, arriving at the clocks given: a car of the train at its departure from
  // its station the same way, if it has room and its path runs along the ride's as far as the shorter goes, or else of
  // the train at the departure after, DEPARTURE_INTERVAL steps of the step clock on, and so on, or of a train of its own
  // at the first departure with none, which leaves as the step clock reaches its departure, or at once for one it has
  // passed
  board(ride: Ride, clocks: RideClocks): void {
    const [, , steps, departure] = ride;
    const path = tripRoute(ride);
    const end = path.length - 1;
    this.carCount++;
    for (let at = departure; ; at += DEPARTURE_INTERVAL) {
      const train = this.running.find((running) => running.departure === at && sameTile(running.path[0], path[0]) &&
                                      running.steps[0] === steps[0]);
      if (train === undefined) {
        const leaves = clocks.drive + Math.max(0, (at - clocks.steps) * 1000 / STEPS_PER_SECOND);
        this.running.push({path, steps, ends: [end], departure: at, leaves});
        return;
      }
      if (carsOf(train) < MOST_TRAIN_CARS && (train.steps.startsWith(steps) || steps.startsWith(train.steps))) {
        if (steps.length > train.steps.length) {
          train.path = path;
          train.steps = steps;
        }
        train.ends.push(end);
        train.ends.sort((a, b) => b - a);
        return;
      }
    }
  }

  // Lets go of the trains whose last car has reached where its ride gets off, at the drive clock given
  update(clock: number): void {
    let kept = 0;
    for (const train of this.running) {
      if (frontOf(train, clock) <= lastFrontOf(train)) {
        this.running[kept++] = train;
      } else {
        this.carCount -= carsOf(train);
      }
    }
    this.running.length = kept;
  }
}
