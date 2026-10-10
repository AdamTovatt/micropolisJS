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

import {
  BRWH, BRWV, BRWXXX7, HBRDG0, HBRDG3, HBRIDGE, HRAILROAD, HROADPOWER, INTERSECTION, LTRFBASE, ROADBASE, ROADS, ROADS10,
  ROADS2, ROADS3, ROADS4, ROADS5, ROADS6, ROADS7, ROADS8, ROADS9, VBRDG0, VBRDG3, VBRIDGE, VRAILROAD, VROADPOWER,
} from "./tileValues";

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

// The ways a road leaves a tile, as the road tool joins roads by them (RoadTable in ConnectingTool.cs): 1 north,
// 2 east, 4 south and 8 west
export const ROAD_NORTH = 1;
export const ROAD_EAST = 2;
export const ROAD_SOUTH = 4;
export const ROAD_WEST = 8;
const ACROSS = ROAD_EAST | ROAD_WEST;
const DOWN = ROAD_NORTH | ROAD_SOUTH;
const ROAD_WAYS = new Map<number, number>([
  [HBRIDGE, ACROSS], [VBRIDGE, DOWN], [ROADS, ACROSS], [ROADS2, DOWN], [ROADS3, ROAD_NORTH | ROAD_EAST],
  [ROADS4, ROAD_EAST | ROAD_SOUTH], [ROADS5, ROAD_SOUTH | ROAD_WEST], [ROADS6, ROAD_NORTH | ROAD_WEST],
  [ROADS7, ROAD_NORTH | ACROSS], [ROADS8, DOWN | ROAD_EAST], [ROADS9, ROAD_SOUTH | ACROSS], [ROADS10, DOWN | ROAD_WEST],
  [INTERSECTION, DOWN | ACROSS], [HROADPOWER, ACROSS], [VROADPOWER, DOWN], [BRWH, ACROSS], [BRWV, DOWN],
  // A road crossing rail runs across the rail
  [HRAILROAD, DOWN], [VRAILROAD, ACROSS],
  ...[HBRDG0, HBRDG0 + 1, HBRDG0 + 2, HBRDG3].map((id) => [id, ACROSS] as [number, number]),
  ...[VBRDG0, VBRDG0 + 1, VBRDG0 + 2, VBRDG3].map((id) => [id, DOWN] as [number, number]),
]);

// The ways the road on a tile of the id leaves it by, traffic's as the plain road it runs on, or 0 off a road
export function roadWays(tileId: number): number {
  return ROAD_WAYS.get(plainRoad(tileId)) ?? 0;
}
