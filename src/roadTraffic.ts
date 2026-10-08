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

import type { TilePosition } from "./protocol";
import { CAR_DIRECTIONS, directionOf, sameTile, tileKey } from "./routeTiles";
import type { CarDirection } from "./routeTiles";

// The cars on the road as they drive against each other: the client's picture of the traffic the city's trips make,
// which never feeds back into the city and need not match another player's. Each car drives its route in the
// right-hand lane, its place the distance it has driven along the route, in tiles from the middle of its first tile.
//
// A car holds each tile its body is on, and holds a tile before it drives into it: a car may take a tile only where
// its path through the tile crosses no path of a car holding it, but a car that came in the same way, in the same lane,
// which it follows instead, and no path of a car that has waited longer to take it (pathQuadrants). It takes no tile a
// train is on. Along its lane it keeps CAR_GAP behind the car ahead, braking as it closes on it or on a tile it can't
// take. So cars queue behind each other, wait their turn at junctions in the order they came, and wait at a level
// crossing while a train is on it or about to be. A car takes a level crossing only with room to drive off it: with
// the tile past it, and the car ahead in its lane far enough on that its back clears the crossing, so it never stands
// on one, and a train, which never waits for a car, closes the crossing for as long as a car takes to drive over it
// (CAR_CROSSING_MS). A car that stands still for CAR_WAIT_MS fades out over CAR_FADE_MS and is gone, so
// gridlock never builds up in the picture; a car whose first tile is taken waits to appear, and is dropped if it can't
// within CAR_WAIT_MS. Everything a car looks at is the cars holding the few tiles about it, so an update's cost grows
// with the cars, not with their square.

// How fast a car drives, in tiles a second
export const CAR_TILES_PER_SECOND = 4;

// How far a car keeps behind the car ahead of it in its lane, middle to middle, in tiles: its painted length
// (CAR_LENGTH in mapFrame.ts) and as much again between them
export const CAR_GAP = 0.5;

// How far short of where it must stop a car starts to brake, in tiles: it slows in proportion to the distance left,
// down to CAR_CRAWL
export const CAR_BRAKING = 0.6;

// How fast a car creeps up to where it must stop, in tiles a second
export const CAR_CRAWL = 0.4;

// How long a car stands still, waiting, before it fades out, and how long a car waits to appear, in milliseconds
export const CAR_WAIT_MS = 4000;

// How long a car takes to fade out, in milliseconds
export const CAR_FADE_MS = 600;

// The longest step of the clock a car drives in one update, in milliseconds: after a stall a car drives on from where
// it stood rather than jumping past the cars and tiles about it
export const LONGEST_DRIVE_MS = 100;

// How far each end of a car's body reaches from its middle along its route, in tiles: the tiles it holds
const BODY_REACH = CAR_GAP / 2;

// How far short of a tile a car takes it, in tiles: early enough that a car that may drive into it never brakes
const TAKES_AHEAD = CAR_BRAKING;

// The most level crossings one after another along a road, a road over two rail lines side by side, which a car takes
// at once
const MOST_CROSSINGS_IN_A_ROW = 2;

// The longest a car is on a level crossing it took, in milliseconds: from taking it, its front TAKES_AHEAD short of the
// crossing, until its back clears the last of MOST_CROSSINGS_IN_A_ROW, at full speed, which it keeps, having room to
// drive off them
export const CAR_CROSSING_MS = (TAKES_AHEAD + CAR_GAP + MOST_CROSSINGS_IN_A_ROW) / CAR_TILES_PER_SECOND * 1000;

// The segments of its route past the one it is on where a car looks for the car ahead of it: as far as the tiles it
// takes ahead reach
const LOOKS_AHEAD = 2;

// The quarters of a tile, as bits: a car's path through a tile covers some of them
const NORTH_WEST = 1;
const NORTH_EAST = 2;
const SOUTH_WEST = 4;
const SOUTH_EAST = 8;

// The quarters of its tile a car's lane covers going each way, on the right-hand side: the half of the lane it drives
// into the tile along, from the side it comes in by to the middle, and the half it drives out along, from the middle to
// the side it goes out by. Going east the lane is the tile's south half, and so on round.
const LANE_IN: Readonly<Record<CarDirection, number>> =
  {north: SOUTH_EAST, east: SOUTH_WEST, south: NORTH_WEST, west: NORTH_EAST};
const LANE_OUT: Readonly<Record<CarDirection, number>> =
  {north: NORTH_EAST, east: SOUTH_EAST, south: SOUTH_WEST, west: NORTH_WEST};

// The way a quarter turn to the left of the way given
function leftOf(way: CarDirection): CarDirection {
  return CAR_DIRECTIONS[(CAR_DIRECTIONS.indexOf(way) + 3) % 4];
}

// The quarters of a tile a car's path through it covers, coming in going the way given, or null where its route starts
// there, and going out the way given, or null where its route ends there: the half of its lane it drives in along, the
// half it drives out along, and on a turn to the left, across the oncoming lane, the corner between, where it would
// have gone on straight. A turn to the right keeps to one quarter. A car that starts or ends its route in the tile
// covers its lane's both halves there.
export function pathQuadrants(coming: CarDirection | null, going: CarDirection | null): number {
  if (coming === null && going === null) {
    return 0;
  }
  if (coming === null) {
    return LANE_IN[going!] | LANE_OUT[going!];
  }
  if (going === null) {
    return LANE_IN[coming] | LANE_OUT[coming];
  }
  const leftTurn = leftOf(coming) === going;
  return LANE_IN[coming] | LANE_OUT[going] | (leftTurn ? LANE_OUT[coming] : 0);
}

// A car on the road, from waiting to appear at its route's start to fading out or reaching its end
export interface RoadCar {
  readonly route: readonly TilePosition[];
  readonly colour: number;
  // The order the cars were added in, which ties between them break by
  readonly order: number;
  // Where it is: waiting to appear, driving, or fading out since the clock's fadeStart
  state: "waiting" | "driving" | "fading";
  fadeStart: number;
  // How far it has driven along its route, in tiles
  distance: number;
  // How long, in milliseconds of the clock, it has stood still, or waited to appear
  stood: number;
  // The indices on its route of the first and the last tile it holds, the last less than the first while it holds none
  firstHeld: number;
  lastHeld: number;
  // The index on its route of the tile it waits to take, and the clock as it started to wait for it, or -1
  waitingFor: number;
  waitingSince: number;
}

// How much of it a car shows at the clock given, from 1 driving down to 0 as it fades out
export function carOpacity(car: RoadCar, clock: number): number {
  return car.state === "fading" ? Math.max(0, 1 - (clock - car.fadeStart) / CAR_FADE_MS) : 1;
}

// The road traffic: the cars, and by tile those that hold it and those that wait to take it
export class RoadTraffic {
  private readonly cars: RoadCar[] = [];
  private readonly holders = new Map<number, RoadCar[]>();
  private readonly waiters = new Map<number, RoadCar[]>();
  private added = 0;

  // isCrossing says whether a tile is a level crossing
  constructor(private readonly isCrossing: (tile: TilePosition) => boolean) {}

  // How many cars there are, waiting to appear, driving or fading out
  get count(): number {
    return this.cars.length;
  }

  // The cars, in the order they were added
  get all(): readonly RoadCar[] {
    return this.cars;
  }

  // A car that waits to appear at its route's start, which has two tiles at least, from the clock given
  add(route: readonly TilePosition[], colour: number, clock: number): void {
    const car: RoadCar = {route, colour, order: this.added++, state: "waiting", fadeStart: 0, distance: 0, stood: 0,
                          firstHeld: 0, lastHeld: -1, waitingFor: -1, waitingSince: clock};
    this.cars.push(car);
    this.wait(car, 0, clock);
  }

  // Takes a car off the road at once, with no fade, letting go of every tile it holds and waits for, so the cars behind
  // it and those waiting after it go on as if it had driven away
  remove(car: RoadCar): void {
    const at = this.cars.indexOf(car);
    if (at < 0) {
      throw new Error(`Car ${car.order} is not on the road`);
    }
    this.cars.splice(at, 1);
    this.forget(car);
  }

  // Moves the cars on by the clock's step, elapsed milliseconds to the clock now, in the order they were added: each
  // appears where its first tile is free, drives as far as the car ahead and the tiles it may take let it, and fades out
  // or is gone at the end of its route. A train is on each of the tiles trainTiles holds by key.
  update(clock: number, elapsed: number, trainTiles: ReadonlySet<number>): void {
    const step = Math.min(Math.max(0, elapsed), LONGEST_DRIVE_MS);
    let kept = 0;
    for (const car of this.cars) {
      if (this.move(car, clock, step, trainTiles)) {
        this.cars[kept++] = car;
      } else {
        this.forget(car);
      }
    }
    this.cars.length = kept;
  }

  // Moves a car on, and says whether it is still on the road
  private move(car: RoadCar, clock: number, step: number, trainTiles: ReadonlySet<number>): boolean {
    if (car.state === "fading") {
      return clock - car.fadeStart < CAR_FADE_MS;
    }

    if (car.state === "waiting") {
      if (this.take(car, 0, clock, trainTiles)) {
        car.state = "driving";
        car.stood = 0;
        return true;
      }
      car.stood += step;
      return car.stood < CAR_WAIT_MS;
    }

    const end = car.route.length - 1;
    let limit = this.leaderLimit(car);
    const next = car.lastHeld + 1;
    if (next <= end) {
      const edge = next - 0.5;
      if (car.distance + BODY_REACH + TAKES_AHEAD >= edge) {
        this.take(car, next, clock, trainTiles);
      }
      // A car's front never goes onto a tile it doesn't hold
      if (car.lastHeld + 1 <= end) {
        limit = Math.min(limit, car.lastHeld + 0.5 - BODY_REACH);
      }
    }

    const left = Math.max(0, limit - car.distance);
    const braking = left >= CAR_BRAKING ? CAR_TILES_PER_SECOND : Math.max(CAR_CRAWL, CAR_TILES_PER_SECOND * left / CAR_BRAKING);
    const driven = Math.min(braking * step / 1000, left);
    car.distance += driven;

    if (car.distance >= end) {
      return false;
    }

    while (car.firstHeld < car.lastHeld && car.distance - BODY_REACH > car.firstHeld + 0.5) {
      this.release(car, car.firstHeld);
      car.firstHeld++;
    }

    car.stood = driven > 0 ? 0 : car.stood + step;
    if (car.stood >= CAR_WAIT_MS) {
      car.state = "fading";
      car.fadeStart = clock;
    }
    return true;
  }

  // How far along its route a car may go for the car ahead of it in its lane: CAR_GAP short of it, or as far as it
  // likes for none, so a car drives off the end of its route, into the zone it goes to, without braking for it. The
  // car ahead holds a tile of the few the car is driving to: on the road between the same two tiles the same way, or
  // one that came into the tile the car is driving into the same way and has turned off it, until its body is clear
  // of the lane. It looks as many segments past the one the car is on as given.
  private leaderLimit(car: RoadCar, looks = LOOKS_AHEAD): number {
    const route = car.route;
    const end = route.length - 1;
    const segment = Math.min(Math.floor(car.distance), end - 1);
    const last = Math.min(segment + looks, end);
    let ahead = Infinity;

    for (let j = segment; j <= last; j++) {
      const held = this.holders.get(tileKey(route[j]));
      if (held === undefined) {
        continue;
      }
      for (const other of held) {
        if (other === car) {
          continue;
        }
        const at = placeAlong(car, other, segment, last);
        if (at !== null && (at > car.distance || (at === car.distance && other.order < car.order))) {
          ahead = Math.min(ahead, at);
        }
      }
    }

    return ahead - CAR_GAP;
  }

  // Takes the tile at the index given on a car's route if it may, and says whether it did, or else waits for it. A
  // level crossing it takes with the crossings in a row after it and the tile past them, all at once, and only with room
  // ahead in its lane for its back to clear the last crossing, so it never stands on one.
  private take(car: RoadCar, index: number, clock: number, trainTiles: ReadonlySet<number>): boolean {
    const route = car.route;
    const end = route.length - 1;
    let last = index;
    if (this.isCrossing(route[index])) {
      while (last < end && this.isCrossing(route[last + 1])) {
        last++;
      }
      const clears = last + 0.5 + BODY_REACH;
      const segment = Math.min(Math.floor(car.distance), end - 1);
      if (this.leaderLimit(car, last + 1 - segment) < clears) {
        this.wait(car, index, clock);
        return false;
      }
      last = Math.min(last + 1, end);
    }

    for (let taken = index; taken <= last; taken++) {
      if (!this.mayTake(car, taken, clock, trainTiles)) {
        this.wait(car, index, clock);
        return false;
      }
    }
    this.stopWaiting(car);
    for (let taken = index; taken <= last; taken++) {
      this.hold(car, taken);
    }
    return true;
  }

  // Whether a car may take the tile at the index given on its route: no train is on it, and its path through the tile
  // crosses neither the path of any car holding it but one that came in the same way, nor that of a car that started
  // waiting for it sooner. A car appearing at its route's start follows no one: any car holding its lane there takes
  // its place.
  private mayTake(car: RoadCar, index: number, clock: number, trainTiles: ReadonlySet<number>): boolean {
    const key = tileKey(car.route[index]);
    if (trainTiles.has(key)) {
      return false;
    }

    const coming = comingWay(car, index);
    const path = pathQuadrants(coming, goingWay(car, index));
    for (const other of this.holders.get(key) ?? []) {
      const otherIndex = indexOn(other, car.route[index]);
      const otherComing = comingWay(other, otherIndex);
      const sameLane = coming !== null && otherComing === coming;
      if (other !== car && !sameLane && (pathQuadrants(otherComing, goingWay(other, otherIndex)) & path) !== 0) {
        return false;
      }
    }

    const since = car.waitingFor === index ? car.waitingSince : clock;
    for (const other of this.waiters.get(key) ?? []) {
      if (other === car || other.waitingSince > since || (other.waitingSince === since && other.order > car.order)) {
        continue;
      }
      const otherComing = comingWay(other, other.waitingFor);
      const sameLane = coming !== null && otherComing === coming;
      if (!sameLane && (pathQuadrants(otherComing, goingWay(other, other.waitingFor)) & path) !== 0) {
        return false;
      }
    }

    return true;
  }

  private hold(car: RoadCar, index: number): void {
    const key = tileKey(car.route[index]);
    const held = this.holders.get(key);
    if (held === undefined) {
      this.holders.set(key, [car]);
    } else {
      held.push(car);
    }
    car.lastHeld = index;
  }

  private release(car: RoadCar, index: number): void {
    remove(this.holders, tileKey(car.route[index]), car);
  }

  // Marks a car as waiting for the tile at the index given, from the clock given unless it waits for it already
  private wait(car: RoadCar, index: number, clock: number): void {
    if (car.waitingFor === index) {
      return;
    }
    this.stopWaiting(car);
    car.waitingFor = index;
    car.waitingSince = clock;
    const key = tileKey(car.route[index]);
    const waiting = this.waiters.get(key);
    if (waiting === undefined) {
      this.waiters.set(key, [car]);
    } else {
      waiting.push(car);
    }
  }

  private stopWaiting(car: RoadCar): void {
    if (car.waitingFor >= 0) {
      remove(this.waiters, tileKey(car.route[car.waitingFor]), car);
      car.waitingFor = -1;
    }
  }

  // Lets go of everything a car holds and waits for, as it leaves the road
  private forget(car: RoadCar): void {
    this.stopWaiting(car);
    for (let index = car.firstHeld; index <= car.lastHeld; index++) {
      this.release(car, index);
    }
    car.lastHeld = car.firstHeld - 1;
  }
}

// Takes a car out of the list a map holds under the key given, and the list once it is empty
function remove(map: Map<number, RoadCar[]>, key: number, car: RoadCar): void {
  const list = map.get(key);
  if (list === undefined) {
    return;
  }
  const at = list.indexOf(car);
  if (at >= 0) {
    list.splice(at, 1);
  }
  if (list.length === 0) {
    map.delete(key);
  }
}

// The way a car comes into the tile at the index given on its route, or null for its first
function comingWay(car: RoadCar, index: number): CarDirection | null {
  return index > 0 ? directionOf(car.route[index - 1], car.route[index]) : null;
}

// The way a car goes out of the tile at the index given on its route, or null for its last
function goingWay(car: RoadCar, index: number): CarDirection | null {
  return index < car.route.length - 1 ? directionOf(car.route[index], car.route[index + 1]) : null;
}

// The index on a car's route of a tile it holds
function indexOn(car: RoadCar, tile: TilePosition): number {
  for (let index = car.firstHeld; index <= car.lastHeld; index++) {
    if (sameTile(car.route[index], tile)) {
      return index;
    }
  }
  throw new Error(`A car holds (${tile.x}, ${tile.y}), which is none of its tiles held`);
}

// Where another car is along a car's route, in the car's distance, where it is in the car's lane on the segments of
// the route from the first given to the last: on the road between two tiles of the route the same way, or just past
// the middle of one, having come into it the way the car will and turned off; or null where it is in no lane of the
// car's
function placeAlong(car: RoadCar, other: RoadCar, first: number, last: number): number | null {
  const route = car.route;
  const otherEnd = other.route.length - 1;
  const otherSegment = Math.min(Math.floor(other.distance), otherEnd - 1);
  const along = other.distance - otherSegment;
  const from = other.route[otherSegment];
  const to = other.route[otherSegment + 1];
  const before = otherSegment > 0 ? other.route[otherSegment - 1] : null;

  for (let j = first; j <= last && j < route.length - 1; j++) {
    if (sameTile(from, route[j]) && sameTile(to, route[j + 1])) {
      return j + along;
    }
    if (sameTile(from, route[j]) && along < CAR_GAP && j > 0 && before !== null && sameTile(before, route[j - 1])) {
      return j + along;
    }
  }
  return null;
}
