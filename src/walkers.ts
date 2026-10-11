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
import { pickedByStart, tileKey } from "./routeTiles";
import { locateNinth } from "./walkwayValues";

// The walkers the client draws for the walks a trips message brings (protocol/README.md): each a small person seen from
// above, standing for several people, that walks its walk once along the ninths of the tiles it goes over, from the
// middle of each ninth to the next, and is gone at its end. Paths never crowd, so walkers pass through each other, and
// a walker never waits: the cars give way to it on a crossing (crossingTiles).

// How fast a walker walks, in ninths of a tile a second: a tile a second
export const WALK_SPEED = NINTHS_PER_SIDE;

// The side of the square a walker's figure is drawn in, in map pixels, at 16 a tile: under a quarter of a ninth, so its
// shoulders, which nearly fill its square, are about a fifth as wide as a path
export const WALKER_PIXELS = 1.25;

// A colour walkers come in: its flat colour, red, green and blue from 0 to 1, which tints the white clothing of the
// figure a walker is drawn as
export interface WalkerColour {
  readonly flat: readonly [number, number, number];
}

// The colours walkers come in, a walker's colour its number in this list: saturated mid-tone clothing, red, blue,
// purple, azure and rose, which stands out by its hue from the grey of the paving and the tan of the gravel, none near
// the grass's greens, and stays lighter than the dark head the tint barely moves
export const WALKER_COLOURS: readonly WalkerColour[] = [
  {flat: [0.86, 0.2, 0.16]},
  {flat: [0.22, 0.4, 0.92]},
  {flat: [0.62, 0.26, 0.86]},
  {flat: [0.12, 0.66, 0.86]},
  {flat: [0.92, 0.3, 0.58]},
];

// A walker walking: the ninths of its walk, on the map's grid of ninths, from its first to its last, each beside the
// one before, its colour and its figure, by their numbers, which its walk's start picks, and the drive clock's time it
// set out at, in milliseconds
export interface Walker {
  readonly route: readonly TilePosition[];
  readonly colour: number;
  readonly figure: number;
  readonly start: number;
}

// The axis of the map a walker walks along, which its figure's shoulders run across: vertical as it walks up or down
// the map, horizontal as it walks across it
export type WalkAxis = "vertical" | "horizontal";

// The colour and the figure a walker takes from its walk: the same for every walker from its start, the figure a
// number the render art picks one of its figures by (RenderArt.walkerFigure)
export function walkerLook(route: readonly TilePosition[]): {colour: number, figure: number} {
  const {x, y} = route[0];
  return {colour: pickedByStart(route, WALKER_COLOURS.length), figure: x * 11 + y * 5};
}

// Where a walker is at the drive clock's time given, in tiles from the map's top-left corner, and the axis it walks
// along: the middle of the ninth it is on, or between it and the next, along the axis from that ninth to the next, or
// null once it has walked its walk
export function walkerPlace(walker: Walker, clock: number): {x: number, y: number, axis: WalkAxis} | null {
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
          y: (from.y + 0.5 + (to.y - from.y) * along) / NINTHS_PER_SIDE,
          axis: to.x !== from.x ? "horizontal" : "vertical"};
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

  // Adds to tiles, by key, the tile of each crossing a walker is on at the drive clock's time given, or steps onto next:
  // of the ninths it is between, those crossingsAt gives of their tile, a bit for each ninth, as crossings in
  // walkwayValues.ts finds them
  crossingTiles(clock: number, crossingsAt: (tile: TilePosition) => number, tiles: Set<number>): void {
    for (const walker of this.walking) {
      const walked = Math.max(0, clock - walker.start) / 1000 * WALK_SPEED;
      const ninth = Math.floor(walked);
      const last = Math.min(ninth + 1, walker.route.length - 1);
      for (let index = ninth; index <= last; index++) {
        const {tile, n} = locateNinth(walker.route[index].x, walker.route[index].y);
        if ((crossingsAt(tile) & (1 << n)) !== 0) {
          tiles.add(tileKey(tile));
        }
      }
    }
  }

  // Lets go of each walker that has walked its walk by the drive clock's time given
  update(clock: number): void {
    this.walking = this.walking.filter((walker) => walkerPlace(walker, clock) !== null);
  }
}
