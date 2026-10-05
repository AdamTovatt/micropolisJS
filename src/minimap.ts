/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
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
import { requiredElement, setShown } from "./domElements";
import type { Pixels } from "./renderAssets";
import { PageStore, StoredText } from "./storage";
import { TILE_SIZE, tileImageOrigin } from "./tileSet";
import { TILE_COUNT } from "./tileValues";
import type { TilePoint } from "./viewPosition";

// The minimap: the whole map small, in the left column, with the view's rectangle over it. A click or a drag on it
// centres the view there. Each tile is drawn in one colour, the average of its 16 px tile in the tile set, from the
// client's copy of the map, so it needs no texture, and a tile that changes redraws only its own pixels. The player
// hides or shows it with the button on it or the M key, which the page remembers.

export const MINIMAP_SHOWN_KEY = "micropolisJSMinimapShown";

// The pixels of the minimap's canvas a tile is drawn, across and down. The stylesheet scales the canvas down to fit the
// column, and further where the window is too short for it, without smoothing.
export const MINIMAP_PIXELS_PER_TILE = 2;

// Each tile id's colour, three bytes each, red, green and blue: the average of its tile's pixels in the tile set
export function tileColours(tileSet: Pick<Pixels, "data" | "width">): Uint8Array {
  const colours = new Uint8Array(TILE_COUNT * 3);

  for (let tile = 0; tile < TILE_COUNT; tile++) {
    const origin = tileImageOrigin(tile);
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

// A rectangle of the map, in tiles
export interface TileRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// The part of the map a view shows, from its origin, which may lie between tiles, and the tiles it shows across and
// down, a fraction where a tile at either edge shows in part, cut to the map: the void a view shows beyond the map is
// not marked
export function viewRect(origin: TilePoint, tilesInView: TilePoint, map: {width: number, height: number}): TileRect {
  const left = Math.max(0, origin.x);
  const top = Math.max(0, origin.y);
  const right = Math.min(map.width, origin.x + tilesInView.x);
  const bottom = Math.min(map.height, origin.y + tilesInView.y);

  return {left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top)};
}

// The map tile under a point of the minimap, in CSS pixels from its top-left corner, when it shows width by height
// CSS pixels: the nearest tile on the map, for a drag that carries the pointer past the minimap's edges
export function minimapTile(point: TilePoint, width: number, height: number,
                            map: {width: number, height: number}): TilePoint {
  const along = (position: number, length: number, tiles: number) =>
    Math.max(0, Math.min(tiles - 1, Math.floor(position / length * tiles)));

  return {x: along(point.x, width, map.width), y: along(point.y, height, map.height)};
}

// Whether the minimap shows, which the player sets and the page remembers: it shows until the player hides it. A store
// that can't be read or written leaves the choice held for this page only (StoredText).
export class MinimapShown {
  private readonly text: StoredText;

  constructor(store: PageStore | null) {
    this.text = new StoredText(store, MINIMAP_SHOWN_KEY);
  }

  get shown(): boolean {
    return this.text.read() !== "false";
  }

  set shown(shown: boolean) {
    this.text.write(String(shown));
  }
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
const TOGGLE_ID = "minimapToggle";

// The minimap in the page's panel
export class Minimap {
  private readonly frame: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly viewMark: HTMLElement;
  private readonly toggleButton: HTMLElement;
  private readonly image: MinimapImage;
  private readonly shownChoice: MinimapShown;

  // The view's rectangle as last marked, so a paint that would mark the same again doesn't
  private marked = "";

  // The minimap of the city's map, in the colours of the tile set's pixels, marking and moving the view
  constructor(private readonly city: Pick<CityState, "map" | "on">, tileSet: Pixels,
              private readonly view: MinimapView, store: PageStore | null) {
    this.frame = requiredElement(FRAME_ID);
    this.canvas = requiredElement(CANVAS_ID, HTMLCanvasElement);
    this.viewMark = requiredElement(VIEW_ID);
    this.toggleButton = requiredElement(TOGGLE_ID);
    this.shownChoice = new MinimapShown(store);
    this.image = new MinimapImage(city, tileColours(tileSet));

    this.toggleButton.addEventListener("click", () => this.toggle());
    this.listenForPointer();
    this.showChoice();
  }

  // Hides a minimap showing, or shows a hidden one, and remembers which
  toggle(): void {
    this.shownChoice.shown = !this.shownChoice.shown;
    this.showChoice();
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

    const map = this.city.map;
    const rect = viewRect(this.view.getTileOrigin(), this.view.tilesInView, map);
    const percent = (tiles: number, of: number) => `${tiles / of * 100}%`;
    const marked = [percent(rect.left, map.width), percent(rect.top, map.height),
                    percent(rect.width, map.width), percent(rect.height, map.height)];
    const key = marked.join(" ");
    if (key !== this.marked) {
      this.marked = key;
      [this.viewMark.style.left, this.viewMark.style.top, this.viewMark.style.width, this.viewMark.style.height] =
        marked;
    }
  }

  private showChoice(): void {
    const shown = this.shownChoice.shown;
    setShown(this.frame, shown);
    this.toggleButton.textContent = shown ? "Hide" : "Show";
    this.toggleButton.setAttribute("aria-expanded", String(shown));
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
