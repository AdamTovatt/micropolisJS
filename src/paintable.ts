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
}

// What a view reads of a sprite: the square it is drawn in, width map pixels a side from map pixel (x, y), and its
// type and frame, which count from 1, as a sprites message gives them
export type PaintableSprite = Readonly<SpriteView>;

// Sprites are positioned in map pixels, at 16 a tile whatever the tiles are drawn at
export const SPRITE_PIXELS_PER_TILE = 16;

// An area of a view in tiles from its origin: x and y inclusive, xBound and yBound exclusive
export interface TileBounds {
  x: number;
  xBound: number;
  y: number;
  yBound: number;
}

// The tiles a sprite's square covers, in the view whose top-left tile is (originX, originY)
export function spriteTiles(sprite: PaintableSprite, originX: number, originY: number): TileBounds {
  const left = sprite.x - originX * SPRITE_PIXELS_PER_TILE;
  const top = sprite.y - originY * SPRITE_PIXELS_PER_TILE;

  return {
    x: Math.floor(left / SPRITE_PIXELS_PER_TILE),
    xBound: Math.ceil((left + sprite.width) / SPRITE_PIXELS_PER_TILE),
    y: Math.floor(top / SPRITE_PIXELS_PER_TILE),
    yBound: Math.ceil((top + sprite.width) / SPRITE_PIXELS_PER_TILE),
  };
}

// The map tile under the middle of the square a sprite is drawn in, which a view centres on: what the player sees of
// the sprite. For most sprites it is the tile the sprite is at; a tornado's funnel rises from its position, and the
// middle of it is a tile above.
export function spriteTile(sprite: PaintableSprite): TilePoint {
  const middle = sprite.width / 2;
  return {x: Math.floor((sprite.x + middle) / SPRITE_PIXELS_PER_TILE),
          y: Math.floor((sprite.y + middle) / SPRITE_PIXELS_PER_TILE)};
}

// The sprites any part of whose square shows in the view whose top-left tile is (originX, originY), pixelWidth by
// pixelHeight map pixels, as the original's sprite manager chose the sprites to draw
export function spritesInView(sprites: readonly PaintableSprite[], originX: number, originY: number,
                              pixelWidth: number, pixelHeight: number): PaintableSprite[] {
  const startX = originX * SPRITE_PIXELS_PER_TILE;
  const startY = originY * SPRITE_PIXELS_PER_TILE;
  const lastX = startX + pixelWidth;
  const lastY = startY + pixelHeight;
  const inX = (x: number) => x >= startX && x < lastX;
  const inY = (y: number) => y >= startY && y < lastY;

  return sprites.filter((sprite) => (inX(sprite.x) || inX(sprite.x + sprite.width)) &&
                                    (inY(sprite.y) || inY(sprite.y + sprite.width)));
}
