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

import { requiredElement } from "./domElements";
import { SPRITE_PIXELS_PER_TILE } from "./paintable";
import type { PaintableMap, PaintableSprite } from "./paintable";
import type { SpriteView } from "./protocol";
import { TileCanvas } from "./tileCanvas";
import type { TileSet } from "./tileSet";
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

// The map tile under the middle of the square a sprite is drawn in, which the view centres on: what the player sees of
// the sprite. For most sprites it is the tile the sprite is at; a tornado's funnel rises from its position, and the
// middle of it is a tile above.
function spriteTile(sprite: SpriteView): TilePoint {
  const middle = sprite.width / 2;
  return {x: Math.floor((sprite.x + middle) / SPRITE_PIXELS_PER_TILE),
          y: Math.floor((sprite.y + middle) / SPRITE_PIXELS_PER_TILE)};
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

// The small view that shows a disaster, and follows a monster or tornado around the map
class MonsterTV {
  readonly canvas: TileCanvas;
  private readonly element: HTMLElement;
  private readonly follower: SpriteFollower;
  private readonly state: ViewState;

  constructor(map: PaintableMap, tileSet: TileSet, spriteSheet: HTMLImageElement) {
    this.element = requiredElement(MONSTER_TV_ID);

    // The view is shown for a moment, so the canvas can measure its container
    setVisible(this.element, true);

    this.canvas = new TileCanvas(CONTAINER_ID, CANVAS_ID);
    this.canvas.init(map, tileSet, spriteSheet);

    setVisible(this.element, false);

    this.state = new ViewState((open) => renderView(this.element, open));
    this.follower = new SpriteFollower((position) => this.onMove(position), () => this.state.closeLater());
    requiredElement(FORM_ID).addEventListener("submit", (e) => {
      e.preventDefault();
      this.state.close();
    });
  }

  paint(sprites: ReadonlyArray<PaintableSprite> | null, isPaused: boolean): void {
    if (!this.state.isOpen) {
      return;
    }

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

export { MonsterTV, SpriteFollower, ViewState, isOutOfView, renderView, spriteTile };
export type { ViewElement };
