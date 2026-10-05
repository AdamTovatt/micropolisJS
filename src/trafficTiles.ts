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

import { BRWXXX7, LTRFBASE, ROADBASE } from "./tileValues";

// Traffic is drawn as cars (cars.ts), so the traffic tiles the rules put on the map, light and heavy and each frame of
// them, are drawn as the plain road tile of the same shape: road, a bridge, or road crossing a power line. The map keeps
// the traffic tile, which the query tool and the overlays read.

// The tile ids from the first light-traffic tile to the last heavy-traffic frame come sixteen to a level of traffic or
// a frame of one, each a shape of the road tiles from ROADBASE, but the sixteenth: there the open horizontal
// drawbridge's place holds the open vertical drawbridge and its frames, on which no traffic runs (Road.cs).
const SHAPES = 16;
const OPEN_DRAWBRIDGE = SHAPES - 1;

// Whether the tile id is a traffic tile
function isTraffic(tileId: number): boolean {
  return tileId >= LTRFBASE && tileId <= BRWXXX7 && (tileId - ROADBASE) % SHAPES !== OPEN_DRAWBRIDGE;
}

// The tile id drawn for the tile id: a traffic tile's plain road, and any other tile itself
export function plainRoad(tileId: number): number {
  return isTraffic(tileId) ? ROADBASE + (tileId - ROADBASE) % SHAPES : tileId;
}
