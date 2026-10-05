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

import { SPRITE_PIXELS_PER_TILE } from "./paintable";
import type { TilePosition } from "./protocol";

// The cars the client draws for the city's traffic: each trip a trips message brings (protocol/README.md) becomes a car
// that drives its route once, on the right-hand side of the road, and is gone at its end. Cars are the client's alone:
// never simulation sprites, never saved and never in a command log. They move on the client's clock, the one tile
// animation uses, which the end-to-end suite fixes, so there they stand at the starts of their routes.

// How fast a car drives, in tiles a second
export const CAR_TILES_PER_SECOND = 4;

// The most cars driving at once. A car that arrives while this many drive is dropped, so no car is cut short.
export const MAX_CARS = 60;

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
// (x, y), the way it faces, and its colour, by its number from 0, which its route picks
export interface PaintableCar {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly direction: CarDirection;
  readonly colour: number;
}

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

// Where a car is on its route, distance tiles from its start, and the way it faces. A route has two tiles at least,
// and the distance runs from 0 to one less than its tiles.
export function carPlace(route: readonly TilePosition[], distance: number): CarPlace {
  const last = route.length - 1;
  const segment = Math.min(Math.floor(distance), last - 1);
  const along = distance - segment;
  const from = lanePoint(route, segment);
  const to = lanePoint(route, segment + 1);

  return {x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along,
          direction: directionOf(route[segment], route[segment + 1])};
}

// The colour a car takes from its route: the same for every car from its start
export function carColour(route: readonly TilePosition[]): number {
  const {x, y} = route[0];
  return (x * 7 + y * 13) % CAR_COLOURS.length;
}

interface Car {
  readonly route: readonly TilePosition[];
  // The drive clock's time as the car started, in milliseconds
  readonly start: number;
  readonly colour: number;
}

// The cars driving: their own clock, which moves on with the client's while the city runs and stands while it's
// paused, so each car stands still while the city is paused and picks up again when it runs
export class Cars {
  private readonly driving: Car[] = [];
  // The drive clock, in milliseconds, and the client's clock as it was last read, or null before then
  private clock = 0;
  private lastNow: number | null = null;

  // A car for each route, starting now at the route's start, in order, but a car that arrives while MAX_CARS drive,
  // which is dropped. A route of one tile has nowhere to drive.
  add(routes: readonly (readonly TilePosition[])[]): void {
    for (const route of routes) {
      if (this.driving.length >= MAX_CARS) {
        return;
      }
      if (route.length > 1) {
        this.driving.push({route, start: this.clock, colour: carColour(route)});
      }
    }
  }

  // Moves the drive clock on to the client's clock now, in milliseconds, unless the city is paused, and lets go of the
  // cars at the ends of their routes
  advance(now: number, paused: boolean): void {
    if (this.lastNow !== null && !paused) {
      this.clock += Math.max(0, now - this.lastNow);
    }
    this.lastNow = now;

    for (let i = this.driving.length - 1; i >= 0; i--) {
      const car = this.driving[i];
      if (this.distance(car) >= car.route.length - 1) {
        this.driving.splice(i, 1);
      }
    }
  }

  // How far each car driving has driven, in tiles, as the drive clock last moved it
  driven(): number[] {
    return this.driving.map((car) => this.distance(car));
  }

  // Each car driving as a view draws it
  paintable(): PaintableCar[] {
    return this.driving.map((car) => {
      const {x, y, direction} = carPlace(car.route, this.distance(car));
      return {x: x * SPRITE_PIXELS_PER_TILE - CAR_PIXELS / 2, y: y * SPRITE_PIXELS_PER_TILE - CAR_PIXELS / 2,
              width: CAR_PIXELS, direction, colour: car.colour};
    });
  }

  // How far the car has driven, in tiles
  private distance(car: Car): number {
    return (this.clock - car.start) / 1000 * CAR_TILES_PER_SECOND;
  }
}
