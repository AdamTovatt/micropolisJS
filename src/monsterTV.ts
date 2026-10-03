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

import { GameCanvas } from "./gameCanvas";
import type { PaintableMap, PaintableSprite, TilePoint } from "./gameCanvas";
import { SPRITE_DYING, SPRITE_MOVED } from "./messages";
import type { TileSet } from "./tileSet";

// A sprite the view can follow: it reports each move, as the map tile it is over, and its death
interface TrackableSprite {
  addEventListener(event: typeof SPRITE_MOVED, listener: (position: TilePoint) => void): void;
  addEventListener(event: typeof SPRITE_DYING, listener: () => void): void;
  removeEventListener(event: typeof SPRITE_MOVED, listener: (position: TilePoint) => void): void;
  removeEventListener(event: typeof SPRITE_DYING, listener: () => void): void;
}

// How long the view stays open after the sprite it follows dies
const TIMEOUT_SECS = 10;

const MONSTER_TV_ID = "monstertv";
const FORM_ID = "monsterTVForm";
const CONTAINER_ID = "tvContainer";
const CANVAS_ID = "tvCanvas";

// Marks the view as open, so the stylesheet can clear its slot: the status panel shares it.
const SHOWING_CLASS = "showing";

// Whether a sprite at the position has left the view whose first and last tiles are min and max, so the view should
// centre on it again. The last row and column count as out: they may be only partly in view.
function isOutOfView(position: TilePoint, min: TilePoint, max: TilePoint): boolean {
  return position.x < min.x || position.y < min.y || position.x >= max.x || position.y >= max.y;
}

// Follows one sprite at a time, reporting its moves until it dies or another is followed
class SpriteFollower {
  private sprite: TrackableSprite | null = null;

  constructor(private readonly onMove: (position: TilePoint) => void, private readonly onLost: () => void) {}

  follow(sprite: TrackableSprite): void {
    this.stop();

    this.sprite = sprite;
    sprite.addEventListener(SPRITE_MOVED, this.onMove);
    sprite.addEventListener(SPRITE_DYING, this.died);
  }

  private stop(): void {
    if (this.sprite !== null) {
      this.sprite.removeEventListener(SPRITE_MOVED, this.onMove);
      this.sprite.removeEventListener(SPRITE_DYING, this.died);
      this.sprite = null;
    }
  }

  private readonly died = (): void => {
    this.stop();
    this.onLost();
  };
}

// Whether the view is open, and the timer that closes it a while after the sprite it follows dies. It touches no DOM:
// render shows or hides the view, and marks it open or not.
class ViewState {
  private open = false;
  // Whether the view shows. Each open and each close flips it, whether or not the view was open, as jQuery's toggle
  // did in the original port: a close that finds the view closed shows it again.
  private visible = false;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly render: (visible: boolean, open: boolean) => void) {}

  get isOpen(): boolean {
    return this.open;
  }

  // Opens the view, if it isn't open, and keeps it open
  show(): void {
    if (this.closeTimer !== null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }

    if (!this.open) {
      this.open = true;
      this.flip();
    }
  }

  close(): void {
    this.open = false;
    this.flip();
  }

  // Closes the view a while from now, unless it shows again first
  closeLater(): void {
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.close();
    }, TIMEOUT_SECS * 1000);
  }

  private flip(): void {
    this.visible = !this.visible;
    this.render(this.visible, this.open);
  }
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Node ${id} not found`);
  }
  return element;
}

// The small view that shows a disaster, and follows a monster or tornado around the map
class MonsterTV {
  readonly canvas: GameCanvas;
  private readonly element: HTMLElement;
  private readonly follower: SpriteFollower;
  private readonly state: ViewState;

  constructor(map: PaintableMap, tileSet: TileSet, spriteSheet: HTMLImageElement) {
    this.element = requireElement(MONSTER_TV_ID);

    // Need to quickly flick on the canvas container so the canvas picks up the correct dimensions (this is a bit of a
    // hack as we're reusing the same GameCanvas that paints the main map, but it avoids a lot of duplication)
    this.element.style.display = "block";

    this.canvas = new GameCanvas(CONTAINER_ID, CANVAS_ID);
    this.canvas.init(map, tileSet, spriteSheet);
    this.canvas.disallowOffMap();

    this.element.style.display = "none";

    this.state = new ViewState((visible, open) => {
      this.element.style.display = visible ? "block" : "none";
      this.element.classList.toggle(SHOWING_CLASS, open);
    });
    this.follower = new SpriteFollower((position) => this.onMove(position), () => this.state.closeLater());
    requireElement(FORM_ID).addEventListener("submit", (e) => {
      e.preventDefault();
      this.state.close();
    });
  }

  paint(sprites: ReadonlyArray<PaintableSprite> | null, isPaused: boolean): void {
    if (!this.state.isOpen) {
      return;
    }

    this.canvas.paint(null, sprites, isPaused);
  }

  // Shows the sprite, at map tile (x, y), and follows it until it dies
  track(x: number, y: number, sprite: TrackableSprite): void {
    this.follower.follow(sprite);
    this.show(x, y);
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

export { MonsterTV, SpriteFollower, ViewState, isOutOfView };
export type { TrackableSprite };
