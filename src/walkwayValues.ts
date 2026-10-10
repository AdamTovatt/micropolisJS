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

import { BITS_PER_NINTH, NINTHS_PER_SIDE, WALKWAY_KINDS } from "./protocol";
import type { TilePosition, WalkwayKind } from "./protocol";
import { ROAD_EAST, ROAD_NORTH, ROAD_SOUTH, ROAD_WEST, railWays, roadEnds } from "./trafficTiles";

// A tile's walkway value, as the city sends it (protocol.ts), and the ninths of a tile it takes meaning from: which
// kind each ninth holds, which ninths a road's carriageway or a rail's track takes, and which a crossing, where a car
// gives way to a walker, as Walkways in the rules finds each.

// The number a walkway value gives a kind on a ninth, counting from 1 as WALKWAY_KINDS lists them, 0 being none
export function kindNumber(kind: WalkwayKind): number {
  return WALKWAY_KINDS.indexOf(kind) + 1;
}

// The kind of walkway a tile's walkway value holds on its ninth n, numbered as kindNumber numbers it, or 0 for none
export function kindAt(walkway: number, n: number): number {
  return (walkway >> (BITS_PER_NINTH * n)) & ((1 << BITS_PER_NINTH) - 1);
}

// The ninths of a tile that hold walkway of the kind given in its walkway value, a bit 1 << n for each ninth n
export function kindNinths(walkway: number, kind: WalkwayKind): number {
  const wanted = kindNumber(kind);
  let ninths = 0;
  for (let n = 0; n < NINTHS_PER_SIDE * NINTHS_PER_SIDE; n++) {
    if (kindAt(walkway, n) === wanted) {
      ninths |= 1 << n;
    }
  }
  return ninths;
}

// The tile a ninth of the map's grid of ninths lies in, and which of that tile's ninths it is, numbered row by row as a
// walkway value numbers them, for a ninth off the map too, as Walkways.Locate in the rules finds them
export function locateNinth(ninthX: number, ninthY: number): {tile: TilePosition, n: number} {
  const tile = {x: Math.floor(ninthX / NINTHS_PER_SIDE), y: Math.floor(ninthY / NINTHS_PER_SIDE)};
  return {tile, n: (ninthY - tile.y * NINTHS_PER_SIDE) * NINTHS_PER_SIDE + ninthX - tile.x * NINTHS_PER_SIDE};
}

// The ninths of a tile of the id that are a road's carriageway, a bit 1 << n for each ninth n, where a path is a
// crossing: the middle ninth and the middle of each side the road leaves by, or none off a road, as
// Walkways.Carriageway in the rules finds them
export function carriageway(id: number): number {
  return middleAndSides(roadEnds(id));
}

// The ninths of a tile of the id that its rail's track takes, a bit 1 << n for each ninth n: the middle ninth and the
// middle of each side the track leaves by, or none off rail, as Walkways.Track in the rules finds them
export function track(id: number): number {
  return middleAndSides(railWays(id));
}

// The crossings of a tile of the id with the walkway value given, a bit 1 << n for each ninth n: the ninths of its
// carriageway holding a path, where a car gives way to a walker, as Walkways.Crossings in the rules finds them; a
// footbridge or an underpass on the carriageway is none
export function crossings(walkway: number, id: number): number {
  return carriageway(id) & kindNinths(walkway, "path");
}

// The middle ninth and the middle of each side of the ways given, a bit 1 << n for each ninth n, or none for no ways, as
// Walkways.MiddleAndSides in the rules finds them
function middleAndSides(ways: number): number {
  if (ways === 0) {
    return 0;
  }

  let ninths = 1 << 4;
  const sides: [number, number][] = [[ROAD_NORTH, 1], [ROAD_EAST, 5], [ROAD_SOUTH, 7], [ROAD_WEST, 3]];
  for (const [way, n] of sides) {
    if ((ways & way) !== 0) {
      ninths |= 1 << n;
    }
  }
  return ninths;
}
