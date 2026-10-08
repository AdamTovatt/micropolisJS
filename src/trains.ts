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
// departure leaving the same way, each the same track as far as it goes, ride one train, a carriage for each
// RIDES_PER_CARRIAGE of them or fewer, up to MOST_CARRIAGES; the rest wait for the next departure, in the picture only.
// A train stands at its station until it leaves, then keeps its carriages, taking rides only into the seats they have
// left, and runs all of them along the path of its longest ride to its end. Trains run on the right-hand track of the
// double track, each way its own, so trains each way pass.

// The steps the city takes a second of real time, at which the step clock a ride's departure counts on moves: the
// rules' Simulation.StepsPerSecond, which test/cars.ts holds this to, as the fixture tool writes it into
// conformance/ruleConstants.json
export const STEPS_PER_SECOND = 60;

// The steps of the step clock between one departure from a station and the next, each way: the rules'
// Timetable.DepartureInterval, which test/cars.ts holds this to, as STEPS_PER_SECOND
export const DEPARTURE_INTERVAL = 240;

// How fast a train runs, in tiles a second
export const TRAIN_TILES_PER_SECOND = 6;

// The most rides a carriage of a train carries, and the most carriages a train has
export const RIDES_PER_CARRIAGE = 10;
export const MOST_CARRIAGES = 6;

// How far each carriage of a train runs behind the one ahead of it, in tiles
export const CARRIAGE_SPACING = 0.75;

// How far a carriage of a train reaches ahead of its middle and behind it, in tiles: the tiles it is on
const CARRIAGE_REACH = CARRIAGE_SPACING / 2;

// A train: its path, from its station's tile, and the steps along it, its longest ride's, which a longer ride boarding
// it replaces; the rides it carries, and its carriages, RIDES_PER_CARRIAGE seats each; the step clock's value it leaves
// its station at, and the client's drive clock as it leaves
export interface Train {
  path: TilePosition[];
  steps: string;
  rides: number;
  carriages: number;
  readonly departure: number;
  readonly leaves: number;
}

// The clocks as a ride arrives: the client's drive clock, in milliseconds, and the city's step clock, as the batch
// that brought the ride carried it
export interface RideClocks {
  readonly drive: number;
  readonly steps: number;
}

// How far its front has gone at the drive clock given, in tiles: none before it leaves
export function frontOf(train: Train, clock: number): number {
  return Math.max(0, (clock - train.leaves) / 1000 * TRAIN_TILES_PER_SECOND);
}

// How far along its path a train runs, in tiles: to the end of it, its longest ride's
function endOf(train: Train): number {
  return train.path.length - 1;
}

// How far the train's front goes before it is gone, in tiles: until its last carriage has reached the end of its path
export function lastFrontOf(train: Train): number {
  return endOf(train) + (train.carriages - 1) * CARRIAGE_SPACING;
}

// How far a carriage of the train, by its place in the train from the front, has gone at the drive clock given, in
// tiles: CARRIAGE_SPACING behind the one ahead, short of the station while it is still to leave it
function carriageAt(train: Train, carriage: number, clock: number): number {
  return frontOf(train, clock) - carriage * CARRIAGE_SPACING;
}

// Where each carriage of the train shows, at the drive clock given, as its distance along the path, front first: from
// leaving its station to reaching the end of the path. A train standing at its station shows its front carriage there.
export function carriagesShown(train: Train, clock: number): number[] {
  const shown: number[] = [];
  for (let carriage = 0; carriage < train.carriages; carriage++) {
    const at = carriageAt(train, carriage, clock);
    if (at >= 0 && at <= endOf(train)) {
      shown.push(at);
    }
  }
  return shown;
}

// The keys of the tiles a train's carriages are on at the drive clock given, and of those each will reach within
// CAR_CROSSING_MS, short of the end of its path: a level crossing among them is closed to cars, so a car that took one
// is over it before a train comes. A train standing at its station closes nothing past it until it is about to leave.
export function tilesOf(train: Train, clock: number, into: Set<number>): void {
  const end = endOf(train);
  for (let carriage = 0; carriage < train.carriages; carriage++) {
    const from = Math.max(0, carriageAt(train, carriage, clock));
    const to = Math.min(end, carriageAt(train, carriage, clock + CAR_CROSSING_MS));
    if (from > end || to < 0) {
      continue;
    }
    const first = Math.max(0, Math.round(from - CARRIAGE_REACH));
    const last = Math.min(end, Math.round(to + CARRIAGE_REACH));
    for (let index = first; index <= last; index++) {
      into.add(tileKey(train.path[index]));
    }
  }
}

// The trains waiting at their stations and running, made from the rides the city sends
export class Trains {
  private readonly running: Train[] = [];
  private carriageCount = 0;

  get all(): readonly Train[] {
    return this.running;
  }

  // How many carriages the trains have
  get carriages(): number {
    return this.carriageCount;
  }

  // A seat for a ride, which has a step at least, arriving at the clocks given, in the train at its departure from its
  // station the same way, if its path runs along the ride's as far as the shorter goes, or once the train has left, as
  // far as the ride's goes: in a carriage it has with a seat left, or, while it stands at its station, in a carriage it
  // adds, up to MOST_CARRIAGES; or else in the train at the departure after, DEPARTURE_INTERVAL steps of the step clock
  // on, and so on, or in a train of its own at the first departure with none, which leaves as the step clock reaches
  // its departure, or at once for one it has passed. A carriage is added only where mayAddCarriage says it may be, and a
  // ride that needs one where it may not is dropped.
  board(ride: Ride, clocks: RideClocks, mayAddCarriage: () => boolean): void {
    const [, , steps, departure] = ride;
    const path = tripRoute(ride);
    for (let at = departure; ; at += DEPARTURE_INTERVAL) {
      const train = this.running.find((running) => running.departure === at && sameTile(running.path[0], path[0]) &&
                                      running.steps[0] === steps[0]);
      if (train === undefined) {
        if (mayAddCarriage()) {
          const leaves = clocks.drive + Math.max(0, (at - clocks.steps) * 1000 / STEPS_PER_SECOND);
          const started: Train = {path, steps, rides: 0, carriages: 0, departure: at, leaves};
          this.running.push(started);
          this.addCarriage(started, path, steps);
        }
        return;
      }
      // A train that has left keeps the carriages and the path it left with, so none appears behind it running, and none
      // that has reached the end of its path shows again
      const left = clocks.drive > train.leaves;
      if (!train.steps.startsWith(steps) && (left || !steps.startsWith(train.steps))) {
        continue;
      }
      if (train.rides < train.carriages * RIDES_PER_CARRIAGE) {
        seat(train, path, steps);
        return;
      }
      if (!left && train.carriages < MOST_CARRIAGES) {
        if (mayAddCarriage()) {
          this.addCarriage(train, path, steps);
        }
        return;
      }
    }
  }

  // Lets go of the trains whose last carriage has reached the end of their path, at the drive clock given
  update(clock: number): void {
    let kept = 0;
    for (const train of this.running) {
      if (frontOf(train, clock) <= lastFrontOf(train)) {
        this.running[kept++] = train;
      } else {
        this.carriageCount -= train.carriages;
      }
    }
    this.running.length = kept;
  }

  // Adds a carriage to a train, counted, and seats a ride along the path given in it
  private addCarriage(train: Train, path: TilePosition[], steps: string): void {
    train.carriages++;
    this.carriageCount++;
    seat(train, path, steps);
  }
}

// Seats a ride along the path given in a train with a seat left, the train running the ride's path if it is the longer
function seat(train: Train, path: TilePosition[], steps: string): void {
  train.rides++;
  if (steps.length > train.steps.length) {
    train.path = path;
    train.steps = steps;
  }
}
