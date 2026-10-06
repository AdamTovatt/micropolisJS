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

import type { CarShareStep } from "./carShare";
import { SPRITE_PIXELS_PER_TILE } from "./paintable";
import type { TilePosition, Trip } from "./protocol";

// The cars the client draws for the city's traffic: each trip a trips message brings (protocol/README.md) becomes a car
// that drives its route once, on the right-hand side of the road, and is gone at its end, and each ride a car of a
// train, which runs along the middle of the track from the station it got on at, and is gone into the one it gets off
// at. Cars are the client's alone: never simulation sprites, never saved and never in a command log. They move on the
// client's clock, the one tile animation uses, which the end-to-end suite fixes, so there they stand at the starts of
// their routes.

// How fast a car drives, in tiles a second
export const CAR_TILES_PER_SECOND = 4;

// How fast a train runs, in tiles a second
export const TRAIN_TILES_PER_SECOND = 6;

// The most cars a train has, one a ride
export const MOST_TRAIN_CARS = 4;

// How far each car of a train runs behind the one ahead of it, in tiles
export const TRAIN_CAR_SPACING = 0.75;

// The most cars driving at once when every trip and ride becomes one, a share of it at a smaller share of them, a
// train's cars counted each. A car or a train that arrives while that many drive is dropped, so none is cut short.
export const MAX_CARS = 2000;

// The most cars driving at once at the step of the Cars slider given: MAX_CARS times its share, and none at Off
export function carCap(step: CarShareStep): number {
  return step.every === null ? 0 : MAX_CARS / step.every;
}

// Whether the trip that arrived index trips after the page joined becomes a car at the step of the Cars slider given:
// every k-th from the first, k being the step's every, and none at Off
export function takesTrip(index: number, step: CarShareStep): boolean {
  return step.every !== null && index % step.every === 0;
}

// How far right of the middle of the road a car drives, in tiles: the middle of the road's right-hand lane, as the art
// paints it (LANE in art/blender/tilesets.py)
export const LANE_OFFSET = 0.1;

// The side of the square a car is drawn in, in map pixels, at 16 a tile: a tile, as its art's frame is
export const CAR_PIXELS = 16;

// The way a car faces: the way it drives
export type CarDirection = "north" | "east" | "south" | "west";

// Where a car is: the point of the map under its middle, in tiles from the map's top-left corner, and the way it faces
export interface CarPlace {
  x: number;
  y: number;
  direction: CarDirection;
}

// A car as a view draws it: the square it is drawn in, width map pixels a side with its top-left corner at map pixel
// (x, y), and the way it faces; a car on the road in its colour, by its number from 0, which its route picks, and a car
// of a train in the trains' art
interface CarSquare {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly direction: CarDirection;
}

export interface PaintableRoadCar extends CarSquare {
  readonly kind: "road";
  readonly colour: number;
}

export interface PaintableTrainCar extends CarSquare {
  readonly kind: "rail";
}

export type PaintableCar = PaintableRoadCar | PaintableTrainCar;

// A colour cars come in: its name, by which the render manifest names its art (docs/render-assets.md), and the flat
// colour, red, green and blue from 0 to 1, a car is drawn in where the manifest has no art for it
export interface CarColour {
  readonly name: string;
  readonly flat: readonly [number, number, number];
}

// The colours cars come in, a car's colour its number in this list: the render manifest's art for a car is found by
// its colour's name, which the art build writes (CAR_COLOURS in art/tools/designs.py)
export const CAR_COLOURS: readonly CarColour[] = [
  {name: "red", flat: [0.85, 0.2, 0.15]},
  {name: "blue", flat: [0.15, 0.4, 0.85]},
  {name: "yellow", flat: [0.95, 0.8, 0.2]},
  {name: "white", flat: [0.95, 0.95, 0.95]},
  {name: "green", flat: [0.15, 0.4, 0.25]},
  {name: "orange", flat: [0.95, 0.5, 0.15]},
];

// Every way a car faces
export const CAR_DIRECTIONS: readonly CarDirection[] = ["north", "east", "south", "west"];

// The way from one tile of a route to the next, which is beside it
function directionOf(from: TilePosition, to: TilePosition): CarDirection {
  if (to.x > from.x) {
    return "east";
  }
  if (to.x < from.x) {
    return "west";
  }
  return to.y > from.y ? "south" : "north";
}

// A unit step the way given, in tiles, y growing south
function stepOf(direction: CarDirection): {x: number, y: number} {
  switch (direction) {
    case "north": return {x: 0, y: -1};
    case "east": return {x: 1, y: 0};
    case "south": return {x: 0, y: 1};
    case "west": return {x: -1, y: 0};
  }
}

// The way each letter of a trip's steps takes it
export const STEP_LETTERS: Readonly<Record<string, CarDirection>> = {N: "north", E: "east", S: "south", W: "west"};

// Every tile a trip stands on, in order: its start, then the tile each of its steps takes it to
export function tripRoute([x, y, steps]: Trip): TilePosition[] {
  const route = [{x, y}];
  for (const letter of steps) {
    const direction = STEP_LETTERS[letter];
    if (direction === undefined) {
      throw new Error(`A trip's step ${JSON.stringify(letter)} is none of ${Object.keys(STEP_LETTERS).join("")}`);
    }
    const step = stepOf(direction);
    const last = route[route.length - 1];
    route.push({x: last.x + step.x, y: last.y + step.y});
  }
  return route;
}

// The offset from the middle of the road to its right-hand lane, for a car driving the way given: a quarter turn
// clockwise from the way it drives, LANE_OFFSET tiles long
function laneOffset(direction: CarDirection): {x: number, y: number} {
  const step = stepOf(direction);
  return {x: -step.y * LANE_OFFSET, y: step.x * LANE_OFFSET};
}

// The point of the right-hand lane a car passes at the route's tile, its index given: the tile's middle moved into the
// lane it drives in, and at a turn into both lanes', where they cross. A route never turns back on itself, since a drive
// never goes the way it came.
function lanePoint(route: readonly TilePosition[], index: number): {x: number, y: number} {
  const tile = route[index];
  const incoming = index > 0 ? directionOf(route[index - 1], tile) : null;
  const outgoing = index < route.length - 1 ? directionOf(tile, route[index + 1]) : null;
  const point = {x: tile.x + 0.5, y: tile.y + 0.5};

  for (const direction of incoming === outgoing ? [incoming] : [incoming, outgoing]) {
    if (direction !== null) {
      const offset = laneOffset(direction);
      point.x += offset.x;
      point.y += offset.y;
    }
  }

  return point;
}

// The middle of the route's tile, its index given, where the track runs
function middlePoint(route: readonly TilePosition[], index: number): {x: number, y: number} {
  return {x: route[index].x + 0.5, y: route[index].y + 0.5};
}

// Where something on a route is, distance tiles from its start, and the way it faces, passing at each tile the point
// pointAt gives. A route has two tiles at least, and the distance runs from 0 to one less than its tiles.
function placeOn(route: readonly TilePosition[], distance: number,
                 pointAt: (route: readonly TilePosition[], index: number) => {x: number, y: number}): CarPlace {
  const segment = Math.min(Math.floor(distance), route.length - 2);
  const along = distance - segment;
  const from = pointAt(route, segment);
  const to = pointAt(route, segment + 1);

  return {x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along,
          direction: directionOf(route[segment], route[segment + 1])};
}

// Where a car is on its route, distance tiles from its start, and the way it faces: in its right-hand lane
export function carPlace(route: readonly TilePosition[], distance: number): CarPlace {
  return placeOn(route, distance, lanePoint);
}

// Where a car of a train is on its route, distance tiles from its start, and the way it faces: on the middle of the
// track
export function trainPlace(route: readonly TilePosition[], distance: number): CarPlace {
  return placeOn(route, distance, middlePoint);
}

// The colour a car takes from its route: the same for every car from its start
export function carColour(route: readonly TilePosition[]): number {
  const {x, y} = route[0];
  return (x * 7 + y * 13) % CAR_COLOURS.length;
}

// A car on the road, in its colour, or a train of cars, driving its route
interface Driving {
  readonly route: readonly TilePosition[];
  // The drive clock's time as it started, in milliseconds
  readonly start: number;
}

type Vehicle = Driving & (
  {readonly kind: "road", readonly colour: number} | {readonly kind: "rail", readonly cars: number}
);

// How many cars a vehicle draws
function carsOf(vehicle: Vehicle): number {
  return vehicle.kind === "road" ? 1 : vehicle.cars;
}

// How far a car or the front of a train goes before it is gone, in tiles: a car to its route's end, and a train until
// its last car is there
function lastDistance(vehicle: Vehicle): number {
  const end = vehicle.route.length - 1;
  return vehicle.kind === "road" ? end : end + (vehicle.cars - 1) * TRAIN_CAR_SPACING;
}

// The cars and trains driving: their own clock, which moves on with the client's while the city runs and stands while
// it's paused, so each stands still while the city is paused and picks up again when it runs. Which trips and rides
// become cars is the step of the Cars slider the player chose (CarSharePreference), read as each trips message
// arrives, so a smaller share starts fewer from then on and every one already driving finishes its route.
export class Cars {
  private readonly driving: Vehicle[] = [];
  // How many cars the vehicles driving draw, a train's cars counted each
  private carsDrawn = 0;
  // The drive clock, in milliseconds, and the client's clock as it was last read, or null before then
  private clock = 0;
  private lastNow: number | null = null;
  // The trips and the rides that arrived since the page last joined the city, those that became cars or not alike
  private arrived = 0;
  private ridden = 0;

  // share is the step of the Cars slider, as the player has it now
  constructor(private readonly share: () => CarShareStep) {}

  // The page joined the city, at its start or again after a reconnect: the trips and rides are counted from here
  joined(): void {
    this.arrived = 0;
    this.ridden = 0;
  }

  // A car for each trip a trips message brings that the step takes (takesTrip), starting now at the trip's start, in
  // order, but a car that arrives while the step's cap drive (carCap), which is dropped. A trip of no steps has nowhere
  // to drive.
  add(trips: readonly Trip[]): void {
    const step = this.share();
    for (const trip of trips) {
      const index = this.arrived++;
      if (!takesTrip(index, step)) {
        continue;
      }
      const route = tripRoute(trip);
      if (route.length > 1) {
        this.start({route, start: this.clock, kind: "road", colour: carColour(route)}, step);
      }
    }
  }

  // A car of a train for each ride a trips message brings that the step takes, counted as trips are but on their own
  // (takesTrip): the rides taken that run one path, which starts at the station they get on at and ends at the one they
  // get off at, ride one train, a car each, up to MOST_TRAIN_CARS, and the rest the trains after it. The trains start
  // now, at their stations, in the order the first ride of each came, but a train that arrives while its cars would
  // take those driving past the step's cap (carCap), which is dropped.
  addRides(rides: readonly Trip[]): void {
    const step = this.share();
    const paths = new Map<string, {ride: Trip, count: number}>();
    for (const ride of rides) {
      const index = this.ridden++;
      if (!takesTrip(index, step)) {
        continue;
      }
      const key = JSON.stringify(ride);
      const path = paths.get(key);
      if (path === undefined) {
        paths.set(key, {ride, count: 1});
      } else {
        path.count++;
      }
    }

    for (const {ride, count} of paths.values()) {
      const route = tripRoute(ride);
      for (let left = count; left > 0 && route.length > 1; left -= MOST_TRAIN_CARS) {
        this.start({route, start: this.clock, kind: "rail", cars: Math.min(left, MOST_TRAIN_CARS)}, step);
      }
    }
  }

  // Moves the drive clock on to the client's clock now, in milliseconds, unless the city is paused, and lets go of the
  // cars and trains at the ends of their routes
  advance(now: number, paused: boolean): void {
    if (this.lastNow !== null && !paused) {
      this.clock += Math.max(0, now - this.lastNow);
    }
    this.lastNow = now;

    // In one pass, keeping those still driving in the order they started
    let kept = 0;
    for (const vehicle of this.driving) {
      if (this.distance(vehicle) < lastDistance(vehicle)) {
        this.driving[kept++] = vehicle;
      } else {
        this.carsDrawn -= carsOf(vehicle);
      }
    }
    this.driving.length = kept;
  }

  // How far each car and the front of each train driving has gone, in tiles, as the drive clock last moved it
  driven(): number[] {
    return this.driving.map((vehicle) => this.distance(vehicle));
  }

  // Each car driving, and each car of each train on its route, as a view draws it: a train's cars run behind its front,
  // each TRAIN_CAR_SPACING behind the one ahead, and show from leaving the station it got on at to reaching the one it
  // gets off at
  paintable(): PaintableCar[] {
    const painted: PaintableCar[] = [];
    for (const vehicle of this.driving) {
      const distance = this.distance(vehicle);
      if (vehicle.kind === "road") {
        const {x, y, direction} = carPlace(vehicle.route, distance);
        painted.push({kind: "road", ...square(x, y), direction, colour: vehicle.colour});
        continue;
      }

      const end = vehicle.route.length - 1;
      for (let i = 0; i < vehicle.cars; i++) {
        const behind = distance - i * TRAIN_CAR_SPACING;
        if (behind >= 0 && behind <= end) {
          const {x, y, direction} = trainPlace(vehicle.route, behind);
          painted.push({kind: "rail", ...square(x, y), direction});
        }
      }
    }
    return painted;
  }

  // Starts a car or a train, unless its cars would take those driving past the step's cap
  private start(vehicle: Vehicle, step: CarShareStep): void {
    if (this.carsDrawn + carsOf(vehicle) <= carCap(step)) {
      this.driving.push(vehicle);
      this.carsDrawn += carsOf(vehicle);
    }
  }

  // How far the car, or the front of the train, has gone, in tiles
  private distance(vehicle: Vehicle): number {
    const speed = vehicle.kind === "road" ? CAR_TILES_PER_SECOND : TRAIN_TILES_PER_SECOND;
    return (this.clock - vehicle.start) / 1000 * speed;
  }
}

// The square a car is drawn in, whose middle is the point of the map (x, y), in tiles
function square(x: number, y: number): {x: number, y: number, width: number} {
  return {x: x * SPRITE_PIXELS_PER_TILE - CAR_PIXELS / 2, y: y * SPRITE_PIXELS_PER_TILE - CAR_PIXELS / 2,
          width: CAR_PIXELS};
}
