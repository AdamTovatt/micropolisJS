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

import type { CityState } from "./cityState";
import { requiredElement } from "./domElements";
import type { Pixels } from "./renderAssets";
import { TILE_SIZE, tileImageOrigin } from "./tileSet";
import { TILE_COUNT } from "./tileValues";
import { plainRoad } from "./trafficTiles";
import type { TilePoint } from "./viewPosition";

// The minimap: the whole map small, in the left column, with the view's rectangle over it. A click or a drag on it
// centres the view there. Each tile is drawn in one colour, the average of its 16 px tile in the tile set, from the
// client's copy of the map, so it needs no texture, and a tile that changes redraws only its own pixels. Its panel
// folds as the others do (panelFolding.ts), with the button on its strip or the M key.

// The pixels of the minimap's canvas a tile is drawn, across and down. The stylesheet scales the canvas down to fit the
// column, and further where the window is too short for it, without smoothing.
export const MINIMAP_PIXELS_PER_TILE = 2;

// Each tile id's colour, three bytes each, red, green and blue: the average of the pixels in the tile set of the tile
// the map draws for it, a traffic tile's plain road
export function tileColours(tileSet: Pick<Pixels, "data" | "width">): Uint8Array {
  const colours = new Uint8Array(TILE_COUNT * 3);

  for (let tile = 0; tile < TILE_COUNT; tile++) {
    const origin = tileImageOrigin(plainRoad(tile));
    const sums = [0, 0, 0];

    for (let row = 0; row < TILE_SIZE; row++) {
      for (let column = 0; column < TILE_SIZE; column++) {
        const at = ((origin.y + row) * tileSet.width + origin.x + column) * 4;
        for (let channel = 0; channel < 3; channel++) {
          sums[channel] += tileSet.data[at + channel];
        }
      }
    }

    for (let channel = 0; channel < 3; channel++) {
      colours[tile * 3 + channel] = Math.round(sums[channel] / (TILE_SIZE * TILE_SIZE));
    }
  }

  return colours;
}

// What the minimap reads of the map: its size and each tile's id, without its flags
export interface MinimapMap {
  readonly width: number;
  readonly height: number;
  getTileValue(x: number, y: number): number;
}

// Draws tile (x, y) of the map into the minimap's pixels, MINIMAP_PIXELS_PER_TILE square, in its tile id's colour
export function drawTile(pixels: Pixels, colours: Uint8Array, map: MinimapMap, x: number, y: number): void {
  const tile = map.getTileValue(x, y);

  for (let row = 0; row < MINIMAP_PIXELS_PER_TILE; row++) {
    for (let column = 0; column < MINIMAP_PIXELS_PER_TILE; column++) {
      const at = ((y * MINIMAP_PIXELS_PER_TILE + row) * pixels.width + x * MINIMAP_PIXELS_PER_TILE + column) * 4;
      pixels.data[at] = colours[tile * 3];
      pixels.data[at + 1] = colours[tile * 3 + 1];
      pixels.data[at + 2] = colours[tile * 3 + 2];
      pixels.data[at + 3] = 255;
    }
  }
}

// The minimap's pixels, kept up to date with the client's copy of the city: a tiles message redraws the tiles it
// changes, and a map message, as the city sends when a player joins it again after the connection drops, redraws the
// whole map
export class MinimapImage {
  private pixels: Pixels;
  // Whether the pixels changed since they were last taken
  private changed = true;

  constructor(private readonly city: Pick<CityState, "map" | "on">, private readonly colours: Uint8Array) {
    this.pixels = this.drawWhole();
    city.on("tiles", ({changes}) => {
      changes.forEach(({x, y}) => drawTile(this.pixels, this.colours, this.city.map, x, y));
      this.changed = this.changed || changes.length > 0;
    });
    city.on("map", () => {
      this.pixels = this.drawWhole();
      this.changed = true;
    });
  }

  // The pixels, if they changed since they were last taken, or else null
  take(): Pixels | null {
    if (!this.changed) {
      return null;
    }

    this.changed = false;
    return this.pixels;
  }

  private drawWhole(): Pixels {
    const map = this.city.map;
    const width = map.width * MINIMAP_PIXELS_PER_TILE;
    const height = map.height * MINIMAP_PIXELS_PER_TILE;
    const pixels = {data: new Uint8ClampedArray(width * height * 4), width, height};

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        drawTile(pixels, this.colours, map, x, y);
      }
    }

    return pixels;
  }
}

// Where the view's rectangle goes on the minimap, as CSS percentages of the minimap's size
export interface ViewMarkPlacement {
  left: string;
  top: string;
  width: string;
  height: string;
}

// The view's rectangle, from its origin, which may lie between tiles, and the tiles it shows across and down, a
// fraction where a tile at either edge shows in part: the whole view, the void it shows beyond the map included, so the
// rectangle reaches past the minimap's edges where the view does, and the minimap's frame clips it. A view longer than
// the map along an axis, as a screen wider than 1920 CSS pixels is at 16 a tile on a map 120 tiles across, has its
// rectangle's edges along that axis clipped away, and past both no rectangle shows: the whole map is on the screen then, which the minimap needn't mark.
export function viewMarkPlacement(origin: TilePoint, tilesInView: TilePoint,
                                  map: {width: number, height: number}): ViewMarkPlacement {
  const percent = (tiles: number, of: number) => `${tiles / of * 100}%`;
  return {left: percent(origin.x, map.width), top: percent(origin.y, map.height),
          width: percent(tilesInView.x, map.width), height: percent(tilesInView.y, map.height)};
}

// The map tile under a point of the minimap, in CSS pixels from its top-left corner, when it shows width by height
// CSS pixels: the nearest tile on the map, for a drag that carries the pointer past the minimap's edges
export function minimapTile(point: TilePoint, width: number, height: number,
                            map: {width: number, height: number}): TilePoint {
  const along = (position: number, length: number, tiles: number) =>
    Math.max(0, Math.min(tiles - 1, Math.floor(position / length * tiles)));

  return {x: along(point.x, width, map.width), y: along(point.y, height, map.height)};
}

// The view the minimap marks and moves: where it is, how much of the map it shows, and centring it on a tile
export interface MinimapView {
  getTileOrigin(): TilePoint;
  readonly tilesInView: TilePoint;
  centreOn(x: number, y: number): void;
}

const FRAME_ID = "minimapFrame";
const CANVAS_ID = "minimapCanvas";
const VIEW_ID = "minimapView";

// The minimap in the page's panel
export class Minimap {
  private readonly frame: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly viewMark: HTMLElement;
  private readonly image: MinimapImage;

  // The view's rectangle as last marked, so a paint that would mark the same again doesn't
  private marked = "";

  // The minimap of the city's map, in the colours of the tile set's pixels, marking and moving the view
  constructor(private readonly city: Pick<CityState, "map" | "on">, tileSet: Pixels,
              private readonly view: MinimapView) {
    this.frame = requiredElement(FRAME_ID);
    this.canvas = requiredElement(CANVAS_ID, HTMLCanvasElement);
    this.viewMark = requiredElement(VIEW_ID);
    this.image = new MinimapImage(city, tileColours(tileSet));

    this.listenForPointer();
  }

  // Puts the whole image on the canvas if any tile changed since the last paint, and marks where the view is now
  paint(): void {
    const pixels = this.image.take();
    if (pixels !== null) {
      if (this.canvas.width !== pixels.width || this.canvas.height !== pixels.height) {
        this.canvas.width = pixels.width;
        this.canvas.height = pixels.height;
      }
      this.canvas.getContext("2d")!.putImageData(new ImageData(pixels.data, pixels.width, pixels.height), 0, 0);
    }

    const mark = viewMarkPlacement(this.view.getTileOrigin(), this.view.tilesInView, this.city.map);
    const key = Object.values(mark).join(" ");
    if (key !== this.marked) {
      this.marked = key;
      Object.assign(this.viewMark.style, mark);
    }
  }

  // A press on the minimap centres the view on the tile under it, and a drag keeps it centred on the tile under the
  // pointer, wherever the pointer goes until it comes up
  private listenForPointer(): void {
    const centre = (e: PointerEvent) => {
      const box = this.canvas.getBoundingClientRect();
      const tile = minimapTile({x: e.clientX - box.left, y: e.clientY - box.top}, box.width, box.height,
                               this.city.map);
      this.view.centreOn(tile.x, tile.y);
    };

    this.frame.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) {
        return;
      }

      e.preventDefault();
      this.frame.setPointerCapture(e.pointerId);
      centre(e);
    });
    this.frame.addEventListener("pointermove", (e) => {
      if (this.frame.hasPointerCapture(e.pointerId)) {
        centre(e);
      }
    });
  }
}
