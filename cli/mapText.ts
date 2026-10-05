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

import type { OverlayAnswer } from "../src/protocol";
import { BIT_MASK, ZONEBIT } from "../src/tileFlags";
import * as Tiles from "../src/tileValues";

// The map and the overlays as text, one character a tile or a block, under rulers of tile coordinates

// A rectangle of tiles, its corners included
export interface Area {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// The tiles of each kind, from the lowest tile value to the highest, with the character of a tile of that kind. A
// zone's or a building's centre tile shows its character in upper case.
const KINDS: readonly {last: number; character: string}[] = [
  {last: Tiles.DIRT, character: "."},
  {last: Tiles.RIVER - 1, character: "?"},
  {last: Tiles.WATER_HIGH, character: "~"},
  {last: Tiles.WOODS_HIGH, character: "^"},
  {last: Tiles.WOODS5, character: "\""},
  {last: Tiles.LASTRUBBLE, character: ":"},
  {last: Tiles.LASTFLOOD, character: "%"},
  {last: Tiles.UNUSED_TRASH5, character: "!"},
  {last: Tiles.LASTFIRE, character: "*"},
  {last: Tiles.BRWXXX7, character: "="},
  {last: Tiles.LASTPOWER, character: "-"},
  {last: Tiles.UNUSED_TRASH6, character: "?"},
  {last: Tiles.LASTRAIL, character: "#"},
  {last: Tiles.ROADVPOWERH, character: "="},
  {last: Tiles.HOSPITALBASE - 1, character: "r"},
  {last: Tiles.CHURCHBASE - 1, character: "h"},
  {last: Tiles.COMBASE - 1, character: "w"},
  {last: Tiles.INDBASE - 1, character: "c"},
  {last: Tiles.PORTBASE - 1, character: "i"},
  {last: Tiles.LASTPORT, character: "s"},
  {last: Tiles.COALBASE - 1, character: "a"},
  {last: Tiles.LASTPOWERPLANT, character: "k"},
  {last: Tiles.POLICESTBASE - 1, character: "f"},
  {last: Tiles.STADIUMBASE - 1, character: "p"},
  {last: Tiles.NUCLEARBASE - 1, character: "d"},
  {last: Tiles.LASTZONE, character: "n"},
  {last: Tiles.LIGHTNINGBOLT, character: "?"},
  {last: Tiles.HBRDG3, character: "="},
  {last: Tiles.RADAR7, character: "a"},
  {last: Tiles.FOUNTAIN, character: "\""},
  {last: Tiles.TELEBASE - 1, character: "?"},
  {last: Tiles.SMOKEBASE + 7, character: "i"},
  {last: Tiles.TINYEXPLAST, character: "*"},
  {last: Tiles.COALSMOKE1 - 1, character: "?"},
  {last: Tiles.FOOTBALLGAME1 - 1, character: "k"},
  {last: Tiles.VBRDG0 - 1, character: "d"},
  {last: Tiles.VBRDG3, character: "="},
  {last: Tiles.NUKESWIRL4, character: "n"},
  {last: Tiles.CHURCH7LAST, character: "w"},
];

export const MAP_LEGEND = [
  ". clear land   ~ water   ^ trees   \" park   : rubble   % flood   ! radioactive   * fire or explosion",
  "= road   - power line   # rail",
  "r residential   c commercial   i industrial   h hospital   w church   p police   f fire station",
  "d stadium   k coal power   n nuclear power   s seaport   a airport   ? anything else",
  "A zone's or building's centre, where a click places it, is in upper case.",
].join("\n");

// The character of a tile with the raw value, its flags included
export function tileCharacter(raw: number): string {
  const value = raw & BIT_MASK;
  const kind = KINDS.find(({last}) => value <= last);
  const character = kind?.character ?? "?";
  return (raw & ZONEBIT) !== 0 ? character.toUpperCase() : character;
}

// The map's raw tiles, row by row, as the map message holds them
export interface TileGrid {
  width: number;
  height: number;
  tiles: readonly number[];
}

// The tiles of the area, under rulers of their x coordinates and beside their y coordinates
export function mapText(grid: TileGrid, area: Area): string {
  const bounded = clampArea(area, grid.width, grid.height);
  return gridText(bounded, 1, (x, y) => tileCharacter(grid.tiles[y * grid.width + x]));
}

// The overlay's blocks covering the area, a digit each from 0 at the layer's low end to 9 at its high end, under
// rulers of the tile coordinates of each block's top-left tile
export function overlayText(overlay: OverlayAnswer, area: Area, mapWidth: number, mapHeight: number): string {
  const size = overlay.blockSize;
  const bounded = clampArea(area, mapWidth, mapHeight);
  const blocks: Area = {
    left: Math.floor(bounded.left / size),
    top: Math.floor(bounded.top / size),
    right: Math.floor(bounded.right / size),
    bottom: Math.floor(bounded.bottom / size),
  };
  const span = overlay.high - overlay.low;

  return gridText(blocks, size, (x, y) => {
    const value = overlay.values[y * overlay.width + x];
    const scaled = span === 0 ? 0 : Math.round((value - overlay.low) / span * 9);
    return String(Math.min(Math.max(scaled, 0), 9));
  });
}

function clampArea(area: Area, width: number, height: number): Area {
  const bounded = {
    left: Math.max(area.left, 0),
    top: Math.max(area.top, 0),
    right: Math.min(area.right, width - 1),
    bottom: Math.min(area.bottom, height - 1),
  };

  if (bounded.left > bounded.right || bounded.top > bounded.bottom) {
    throw new Error(`The area holds no tile of the ${width}x${height} map`);
  }

  return bounded;
}

// The cells of the area, each the character cell gives it, under two rulers, the tens and the units of the tile
// coordinate of each column, and beside the tile coordinate of each row. A cell covers scale tiles a side.
function gridText(area: Area, scale: number, cell: (x: number, y: number) => string): string {
  const columns: number[] = [];
  for (let x = area.left; x <= area.right; x++) {
    columns.push(x);
  }

  const margin = " ".repeat(4);
  const tens = columns.map((x) => x * scale % 10 === 0 || x === area.left ? String(Math.floor(x * scale / 10) % 10) : " ");
  const units = columns.map((x) => String(x * scale % 10));
  const lines = [margin + tens.join(""), margin + units.join("")];

  for (let y = area.top; y <= area.bottom; y++) {
    lines.push(String(y * scale).padStart(3) + " " + columns.map((x) => cell(x, y)).join(""));
  }

  return lines.join("\n");
}
