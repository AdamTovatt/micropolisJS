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

import type { Ride, TilePosition, Trip } from "./protocol";
import { HRAILROAD, VRAILROAD } from "./tileValues";

// The tiles the routes of cars and trains stand on, and the ways between them, which the cars on the road and the
// trains both go by

// The way a car or a car of a train faces: the way it goes
export type CarDirection = "north" | "east" | "south" | "west";

// Every way a car faces, clockwise from north
export const CAR_DIRECTIONS: readonly CarDirection[] = ["north", "east", "south", "west"];

// The way from one tile of a route to the next, which is beside it
export function directionOf(from: TilePosition, to: TilePosition): CarDirection {
  if (to.x > from.x) {
    return "east";
  }
  if (to.x < from.x) {
    return "west";
  }
  return to.y > from.y ? "south" : "north";
}

// A unit step the way given, in tiles, y growing south
export function stepOf(direction: CarDirection): {x: number, y: number} {
  switch (direction) {
    case "north": return {x: 0, y: -1};
    case "east": return {x: 1, y: 0};
    case "south": return {x: 0, y: 1};
    case "west": return {x: -1, y: 0};
  }
}

// The way each letter of a trip's steps takes it
export const STEP_LETTERS: Readonly<Record<string, CarDirection>> = {N: "north", E: "east", S: "south", W: "west"};

// Every tile a trip or a ride stands on, in order: its start, then the tile each of its steps takes it to
export function tripRoute([x, y, steps]: Trip | Ride): TilePosition[] {
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

// Whether two tiles are the same tile
export function sameTile(a: TilePosition, b: TilePosition): boolean {
  return a.x === b.x && a.y === b.y;
}

// Whether the tile id given is a level crossing, a road over a rail line either way
export function isLevelCrossing(id: number): boolean {
  return id === HRAILROAD || id === VRAILROAD;
}

// A key for a tile, unique on any map the game makes
export function tileKey(tile: TilePosition): number {
  return tile.y * 65536 + tile.x;
}
