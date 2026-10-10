/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 * Modified in Adam Tovatt's continuation of micropolisJS. Copyright (C) 2026 Adam Tovatt
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

import type { SpriteView } from "./protocol";
import type { TilePoint } from "./viewPosition";

// What the views of the map read of it and of its sprites: the map's canvas and the monster TV's

// What a view reads of the map
export interface PaintableMap {
  readonly width: number;
  readonly height: number;
  testBounds(x: number, y: number): boolean;
  getTileValue(x: number, y: number): number;
  // Fills result, row by row, with the raw values of the w by h tiles from (x, y), TILE_INVALID off the map
  getTileValuesForPainting(x: number, y: number, w: number, h: number, result: number[]): number[];
  // Fills result, row by row, with the walkway values of the w by h tiles from (x, y), 0 off the map
  getWalkwaysForPainting(x: number, y: number, w: number, h: number, result: number[]): number[];
}

// What a view reads of a sprite: the square it is drawn in, width map pixels a side from map pixel (x, y), and its
// type and frame, which count from 1, as a sprites message gives them
export type PaintableSprite = Readonly<SpriteView>;

// Sprites are positioned in map pixels, at 16 a tile whatever the tiles are drawn at
export const SPRITE_PIXELS_PER_TILE = 16;

// The square a sprite or a car is drawn in, width map pixels a side from map pixel (x, y)
export type PaintableSquare = Pick<PaintableSprite, "x" | "y" | "width">;

// The map tile under the middle of the square a sprite is drawn in, which a view centres on: what the player sees of
// the sprite. For most sprites it is the tile the sprite is at; a tornado's funnel rises from its position, and the
// middle of it is a tile above.
export function spriteTile(sprite: PaintableSprite): TilePoint {
  const middle = sprite.width / 2;
  return {x: Math.floor((sprite.x + middle) / SPRITE_PIXELS_PER_TILE),
          y: Math.floor((sprite.y + middle) / SPRITE_PIXELS_PER_TILE)};
}

// The sprites, or cars, any part of whose square shows in the view whose top-left tile is (originX, originY),
// pixelWidth by pixelHeight map pixels, as the original's sprite manager chose the sprites to draw
export function squaresInView<T extends PaintableSquare>(squares: readonly T[], originX: number, originY: number,
                                                         pixelWidth: number, pixelHeight: number): T[] {
  const startX = originX * SPRITE_PIXELS_PER_TILE;
  const startY = originY * SPRITE_PIXELS_PER_TILE;
  const lastX = startX + pixelWidth;
  const lastY = startY + pixelHeight;
  const inX = (x: number) => x >= startX && x < lastX;
  const inY = (y: number) => y >= startY && y < lastY;

  return squares.filter((square) => (inX(square.x) || inX(square.x + square.width)) &&
                                    (inY(square.y) || inY(square.y + square.width)));
}
