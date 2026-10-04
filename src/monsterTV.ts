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

import { placeNewCanvas, requiredElement, screenPixelRatio, sizeCanvas } from "./domElements";
import { MapPainter, paintedView } from "./mapPainter";
import { SPRITE_PIXELS_PER_TILE, spriteTile } from "./paintable";
import type { PaintableMap, PaintableSprite } from "./paintable";
import type { SpriteView } from "./protocol";
import type { MapArt } from "./renderAssets";
import { ViewPosition, viewport } from "./viewPosition";
import type { TilePoint } from "./viewPosition";

// How long the view stays open after the sprite it follows dies
const TIMEOUT_SECS = 10;

const MONSTER_TV_ID = "monstertv";
const FORM_ID = "monsterTVForm";
const CONTAINER_ID = "tvContainer";
const CANVAS_ID = "tvCanvas";

// Marks the view as open, so the stylesheet can clear its slot: the status panel shares it.
const SHOWING_CLASS = "showing";

// What rendering the view writes to its element
interface ViewElement {
  readonly style: {display: string};
  readonly classList: {toggle(token: string, force: boolean): boolean};
}

// The stylesheet hides the view until it first opens
function setVisible(element: ViewElement, visible: boolean): void {
  element.style.display = visible ? "block" : "none";
}

// Shows or hides the view, and marks it open or not
function renderView(element: ViewElement, open: boolean): void {
  setVisible(element, open);
  element.classList.toggle(SHOWING_CLASS, open);
}

// Whether a sprite at the position has left the view whose first and last tiles are min and max, so the view should
// centre on it again. The last row and column count as out: they may be only partly in view.
function isOutOfView(position: TilePoint, min: TilePoint, max: TilePoint): boolean {
  return position.x < min.x || position.y < min.y || position.x >= max.x || position.y >= max.y;
}

// Follows one sprite at a time, by its type, of which the map holds at most one: the monster or the tornado. Each time
// the sprites move, it reports where the sprite is, until the sprite is gone or another is followed.
class SpriteFollower {
  private type: number | null = null;

  constructor(private readonly onMove: (position: TilePoint) => void, private readonly onLost: () => void) {}

  follow(type: number): void {
    this.type = type;
  }

  // The sprites as each sprites message places them
  update(sprites: readonly SpriteView[]): void {
    if (this.type === null) {
      return;
    }

    const sprite = sprites.find((candidate) => candidate.type === this.type);
    if (sprite === undefined) {
      this.type = null;
      this.onLost();
      return;
    }

    this.onMove(spriteTile(sprite));
  }
}

// Whether the view is open, and the timer that closes it a while after the sprite it follows dies. It touches no DOM:
// render shows or hides the view, and marks it open or not.
class ViewState {
  private open = false;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly render: (open: boolean) => void) {}

  get isOpen(): boolean {
    return this.open;
  }

  // Opens the view, if it isn't open, and keeps it open
  show(): void {
    this.cancelCloseLater();

    if (!this.open) {
      this.open = true;
      this.render(true);
    }
  }

  close(): void {
    this.cancelCloseLater();
    this.open = false;
    this.render(false);
  }

  // Closes the view a while from now, unless it shows or closes again first
  closeLater(): void {
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.close();
    }, TIMEOUT_SECS * 1000);
  }

  private cancelCloseLater(): void {
    if (this.closeTimer !== null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }
}

// The TV's canvas, which fills its container: where the TV looks, keeping to the map, and while the TV shows, the WebGL
// context it draws the map's art with. The art's textures are large, so the context is made as the TV opens and let go
// as it closes.
class TVCanvas {
  private readonly container: HTMLElement;
  // The container's size in CSS pixels, which are map pixels: a tile is drawn as many CSS pixels as the map pixels
  // sprites are positioned in
  private readonly width: number;
  private readonly height: number;
  private readonly position: ViewPosition;
  // While the TV shows, what draws on its canvas, and the canvas's backing store's pixels for each CSS pixel
  private painter: MapPainter | null = null;
  private pixelRatio = 1;

  // Looks at the middle of the map. The container must be shown, so it can be measured.
  constructor(private readonly map: PaintableMap, private readonly mapArt: MapArt) {
    this.container = requiredElement(CONTAINER_ID);
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.position = new ViewPosition(viewport(this.width, this.height, SPRITE_PIXELS_PER_TILE, map.width, map.height));
    this.centreOn(Math.floor(map.width / 2), Math.floor(map.height / 2));
  }

  // The map pixels the view shows across and down
  get mapPixelWidth(): number {
    return this.width;
  }

  get mapPixelHeight(): number {
    return this.height;
  }

  centreOn(x: number, y: number): void {
    this.position.centreOn(x, y);
  }

  getTileOrigin(): TilePoint {
    return this.position.origin;
  }

  getMaxTile(): TilePoint {
    return this.position.maxTile;
  }

  // Makes the canvas, in place of the one before, and the context that draws on it. Its backing store has
  // devicePixelRatio pixels for each CSS pixel, as the map's does.
  open(): void {
    const canvas = placeNewCanvas(this.container, CANVAS_ID);
    this.pixelRatio = screenPixelRatio();
    sizeCanvas(canvas, this.width, this.height, this.pixelRatio);
    canvas.style.margin = "0";
    canvas.style.padding = "0";
    this.painter = MapPainter.onCanvas(canvas, this.map, this.mapArt);
  }

  // Whether the canvas shows what the last paint read, drawn to the end, or the TV is closed, with nothing to draw
  get current(): boolean {
    return this.painter === null || this.painter.current;
  }

  // Lets go of the context, and the textures it holds
  close(): void {
    this.painter?.release();
    this.painter = null;
  }

  // Draws what the map's own view would draw of the tiles in view and the sprites, unless the TV is closed
  paint(sprites: readonly PaintableSprite[], isPaused: boolean): void {
    if (this.painter === null) {
      return;
    }

    this.painter.paint(paintedView(this.position, SPRITE_PIXELS_PER_TILE * this.pixelRatio), () => null, sprites,
                       isPaused);
  }
}

// The small view that shows a disaster, and follows a monster or tornado around the map
class MonsterTV {
  readonly canvas: TVCanvas;
  private readonly element: HTMLElement;
  private readonly follower: SpriteFollower;
  private readonly state: ViewState;

  constructor(map: PaintableMap, mapArt: MapArt) {
    this.element = requiredElement(MONSTER_TV_ID);

    // The view is shown for a moment, so the canvas can measure its container
    setVisible(this.element, true);
    this.canvas = new TVCanvas(map, mapArt);
    setVisible(this.element, false);

    this.state = new ViewState((open) => {
      renderView(this.element, open);
      if (open) {
        this.canvas.open();
      } else {
        this.canvas.close();
      }
    });
    this.follower = new SpriteFollower((position) => this.onMove(position), () => this.state.closeLater());
    requiredElement(FORM_ID).addEventListener("submit", (e) => {
      e.preventDefault();
      this.state.close();
    });
  }

  // Whether the TV shows what it last painted, drawn to the end, or is closed
  get current(): boolean {
    return this.canvas.current;
  }

  paint(sprites: readonly PaintableSprite[], isPaused: boolean): void {
    this.canvas.paint(sprites, isPaused);
  }

  // Shows the sprite of the type, at map tile (x, y), and follows it until it is gone
  track(x: number, y: number, spriteType: number): void {
    this.follower.follow(spriteType);
    this.show(x, y);
  }

  // The sprites as each sprites message places them
  spritesMoved(sprites: readonly SpriteView[]): void {
    this.follower.update(sprites);
  }

  // Shows map tile (x, y)
  show(x: number, y: number): void {
    this.canvas.centreOn(x, y);
    this.state.show();
  }

  private onMove(position: TilePoint): void {
    if (isOutOfView(position, this.canvas.getTileOrigin(), this.canvas.getMaxTile())) {
      this.canvas.centreOn(position.x, position.y);
    }
  }
}

export { MonsterTV, SpriteFollower, ViewState, isOutOfView, renderView };
export type { ViewElement };
