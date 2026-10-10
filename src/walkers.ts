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

import { NINTHS_PER_SIDE } from "./protocol";
import type { TilePosition } from "./protocol";
import { pickedByStart } from "./routeTiles";

// The walkers the client draws for the walks a trips message brings (protocol/README.md): each a dab of paint, standing
// for several people, that walks its walk once along the ninths of the tiles it goes over, from the middle of each
// ninth to the next, and is gone at its end. Paths never crowd, so walkers pass through each other.

// How fast a walker walks, in ninths of a tile a second: a tile a second
export const WALK_SPEED = NINTHS_PER_SIDE;

// The side of the square a walker's dab of paint is drawn in, in map pixels, at 16 a tile: two thirds of a ninth, so
// the dab in it, narrower than its square, is about half as wide as a path, a speck of paint on it
export const WALKER_PIXELS = 3.5;

// A colour walkers come in: its flat colour, red, green and blue from 0 to 1, which tints the white dab of paint a
// walker is drawn as
export interface WalkerColour {
  readonly flat: readonly [number, number, number];
}

// The colours walkers come in, a walker's colour its number in this list: muted clothing tones, navy, brick, charcoal,
// plum and slate, each darker than the gravel and the paving and no green of the grass's, so it reads on all of them
export const WALKER_COLOURS: readonly WalkerColour[] = [
  {flat: [0.2, 0.25, 0.42]},
  {flat: [0.58, 0.25, 0.19]},
  {flat: [0.26, 0.25, 0.25]},
  {flat: [0.44, 0.28, 0.42]},
  {flat: [0.36, 0.42, 0.5]},
];

// A walker walking: the ninths of its walk, on the map's grid of ninths, from its first to its last, each beside the
// one before, its colour and its dab, by their numbers, which its walk's start picks, and the drive clock's time it
// set out at, in milliseconds
export interface Walker {
  readonly route: readonly TilePosition[];
  readonly colour: number;
  readonly dab: number;
  readonly start: number;
}

// The colour and the dab a walker takes from its walk: the same for every walker from its start, the dab a number the
// render art picks one of its dabs by (RenderArt.walkerDab)
export function walkerLook(route: readonly TilePosition[]): {colour: number, dab: number} {
  const {x, y} = route[0];
  return {colour: pickedByStart(route, WALKER_COLOURS.length), dab: x * 11 + y * 5};
}

// Where a walker is at the drive clock's time given, in tiles from the map's top-left corner: the middle of the ninth
// it is on, or between it and the next, or null once it has walked its walk
export function walkerPlace(walker: Walker, clock: number): {x: number, y: number} | null {
  const {route} = walker;
  const walked = Math.max(0, clock - walker.start) / 1000 * WALK_SPEED;
  if (walked >= route.length - 1) {
    return null;
  }

  const ninth = Math.floor(walked);
  const along = walked - ninth;
  const from = route[ninth];
  const to = route[ninth + 1];
  return {x: (from.x + 0.5 + (to.x - from.x) * along) / NINTHS_PER_SIDE,
          y: (from.y + 0.5 + (to.y - from.y) * along) / NINTHS_PER_SIDE};
}

// The walkers walking, each from when it set out to the end of its walk
export class Walkers {
  private walking: Walker[] = [];

  // Every walker walking
  get all(): readonly Walker[] {
    return this.walking;
  }

  // How many walk
  get count(): number {
    return this.walking.length;
  }

  // A walker on the walk given, through two ninths or more, setting out at the drive clock's time given
  add(route: readonly TilePosition[], clock: number): void {
    this.walking.push({route, ...walkerLook(route), start: clock});
  }

  // Lets go of each walker that has walked its walk by the drive clock's time given
  update(clock: number): void {
    this.walking = this.walking.filter((walker) => walkerPlace(walker, clock) !== null);
  }
}
