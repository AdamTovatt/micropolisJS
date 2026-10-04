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
import { Emitter } from "./emitter";
import { GameCanvas } from "./gameCanvas";
import * as UiMessages from "./uiMessages";
import type { PixelPoint, TilePoint } from "./viewPosition";

// The player's input as the game reads it each tick: the keys held, where the mouse is over the canvas and the tool
// chosen. A click or a drag with the tool, and a press of a control button, are events.

// The tools that lay a line as the mouse drags; every other tool acts on a click
const DRAGGABLE_TOOLS = ["rail", "road", "wire"];

// The keys the game follows: the arrow keys and WASD scroll the map, and Escape closes a window or clears the tool
export type HeldKey = "up" | "down" | "left" | "right" | "escape";

export function heldKey(keyCode: number): HeldKey | null {
  switch (keyCode) {
    case 38:
    case 87:
      return "up";

    case 40:
    case 83:
      return "down";

    case 39:
    case 68:
      return "right";

    case 37:
    case 65:
      return "left";

    case 27:
      return "escape";

    default:
      return null;
  }
}

// The keys that scroll the map
export type ScrollKey = Exclude<HeldKey, "escape">;

// How fast a scroll key held moves the view, in CSS pixels a second, at every zoom
export const SCROLL_SPEED = 600;

// The most time held one take scrolls for, in milliseconds: after a stall of the page, such as a slow frame or a tab in
// the background, the view moves on at most a second's worth, as the step driver catches up at most a second's steps
export const MAX_SCROLL_TIME = 1000;

type Axis = "x" | "y";
type Way = 1 | -1;

// The axis each scroll key moves the view's origin along, and which way
const SCROLL_WAYS: Record<ScrollKey, {axis: Axis, way: Way}> = {
  left: {axis: "x", way: -1},
  right: {axis: "x", way: 1},
  up: {axis: "y", way: -1},
  down: {axis: "y", way: 1},
};

// The scrolling along one axis. The key last pressed of those held sets the way. The time it is held builds up into
// pixels at SCROLL_SPEED, and the pixels into whole tiles, which leaves the view's origin on whole tiles; what is left
// over carries to the next take. A press moves the view a tile at once, even one that comes and goes between two takes.
class AxisScroll {
  // The ways of the keys held, the last pressed last
  private held: Way[] = [];
  // The way of a press since the last take, or 0 for none
  private pressed: Way | 0 = 0;
  // The pixels scrolled toward the next whole tile, and the time, in milliseconds, they were counted to
  private pixels = 0;
  private since = 0;

  // A key's keydown at the time given. A key held repeats its keydown, which is no new press. The repeat of a key not
  // held, as one pressed while a window held the keyboard and still down once it closed, holds it without the press's
  // tile at once.
  press(way: Way, repeat: boolean, now: number): void {
    if (repeat && this.held.includes(way)) {
      return;
    }

    const before = this.way();
    this.held = [...this.held.filter((held) => held !== way), way];
    if (!repeat) {
      this.pressed = way;
    }
    this.restartIfTurned(before, now);
  }

  release(way: Way, now: number): void {
    const before = this.way();
    this.held = this.held.filter((held) => held !== way);
    this.restartIfTurned(before, now);
  }

  // The whole tiles to move the origin along the axis at the time given, negative for back
  take(now: number, tileWidth: number): number {
    const way = this.way();
    let tiles = this.pressed;
    this.pressed = 0;

    if (way !== 0) {
      this.pixels += SCROLL_SPEED * Math.min(now - this.since, MAX_SCROLL_TIME) / 1000;
      this.since = now;
      const whole = Math.floor(this.pixels / tileWidth);
      this.pixels -= whole * tileWidth;
      tiles += way * whole;
    }

    return tiles;
  }

  // The way the keys held scroll, or 0 for none held
  private way(): Way | 0 {
    return this.held.length === 0 ? 0 : this.held[this.held.length - 1];
  }

  // The time held counts from now in a way the keys held have just turned to
  private restartIfTurned(before: Way | 0, now: number): void {
    if (this.way() !== before) {
      this.pixels = 0;
      this.since = now;
    }
  }
}

// The scroll keys held and pressed, which the game takes on each of its ticks as the whole tiles to move the view
// across and down: a key held moves it at SCROLL_SPEED whatever the zoom, however often the game ticks, and a press
// moves it a tile at once. Each axis scrolls apart, so keys of both scroll the view on a slant.
export class ScrollKeys {
  private readonly axes: Record<Axis, AxisScroll> = {x: new AxisScroll(), y: new AxisScroll()};

  // A key's keydown at the time given, in milliseconds
  press(key: ScrollKey, repeat: boolean, now: number): void {
    const {axis, way} = SCROLL_WAYS[key];
    this.axes[axis].press(way, repeat, now);
  }

  release(key: ScrollKey, now: number): void {
    const {axis, way} = SCROLL_WAYS[key];
    this.axes[axis].release(way, now);
  }

  // Lets every key go, as when the page loses the keyboard and would never hear the keys come up
  releaseAll(now: number): void {
    for (const key of Object.keys(SCROLL_WAYS) as ScrollKey[]) {
      this.release(key, now);
    }
  }

  // The whole tiles to move the view across and down at the time given, when a tile is tileWidth CSS pixels
  take(now: number, tileWidth: number): TilePoint {
    return {x: this.axes.x.take(now, tileWidth), y: this.axes.y.take(now, tileWidth)};
  }
}

// The modifier keys of a key press
interface Modifiers {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

// Whether Ctrl, Alt or Meta is held, which makes a key press the browser's shortcut, never the game's: Ctrl or Cmd with
// + zooms the page and with A selects it, and on macOS a key pressed with Cmd never reports coming up
export function isShortcut(e: Modifiers): boolean {
  return e.altKey || e.ctrlKey || e.metaKey;
}

// The zoom steps a key press asks for: + (or =, the same key unshifted) zooms in a step, and - zooms out. A shortcut is
// the browser's.
export function zoomKey(e: {key: string} & Modifiers): number | null {
  if (isShortcut(e)) {
    return null;
  }

  switch (e.key) {
    case "+":
    case "=":
      return 1;

    case "-":
      return -1;

    default:
      return null;
  }
}

// Whether a key press hides or shows the minimap: M, unless it is a shortcut
export function isMinimapKey(e: {key: string} & Modifiers): boolean {
  return (e.key === "m" || e.key === "M") && !isShortcut(e);
}

// The pixels a wheel turns for each zoom step, about a notch of a mouse wheel, and the pixels a wheel's line and page
// count as
const WHEEL_STEP_PIXELS = 100;
const WHEEL_LINE_PIXELS = 16;
const WHEEL_PAGE_PIXELS = 800;

// Turns the mouse wheel's movement into zoom steps: a step in for each WHEEL_STEP_PIXELS the wheel turns up, and out
// for each it turns down. A touchpad's small movements add up to a step; a turn back the other way starts again.
export class WheelZoom {
  private pending = 0;

  // The zoom steps a wheel event's movement makes, in its deltaMode's units: 0 pixels, 1 lines, 2 pages
  steps(deltaY: number, deltaMode: number): number {
    // Up, toward the zoom in, is negative
    const pixels = -deltaY * (deltaMode === 1 ? WHEEL_LINE_PIXELS : deltaMode === 2 ? WHEEL_PAGE_PIXELS : 1);
    if (pixels * this.pending < 0) {
      this.pending = 0;
    }

    this.pending += pixels;
    // || 0 turns the -0 of a part step down into 0
    const steps = Math.trunc(this.pending / WHEEL_STEP_PIXELS) || 0;
    this.pending -= steps * WHEEL_STEP_PIXELS;
    return steps;
  }
}

// What a zoom asks for: the steps in (positive) or out, around a point of the canvas in CSS pixels, the pointer, or
// the middle of the view when it is null
export interface ZoomRequest {
  steps: number;
  point: PixelPoint | null;
}

// Whether a mouse press is the primary button's alone, without a modifier key, which is the only press a tool takes
export function isToolPress(e: {button: number, shiftKey: boolean, altKey: boolean, ctrlKey: boolean,
                                metaKey: boolean}): boolean {
  return e.button === 0 && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
}

const CURSOR_CLASSES = ["pointer", "helpPointer"];

// The class that gives the canvas the cursor for the tool chosen: the question mark for the query tool, the hand for
// the others, and none, the default cursor, while no tool is chosen
export function cursorClass(toolName: string | null): string | null {
  if (toolName === null) {
    return null;
  }

  return toolName === "query" ? "helpPointer" : "pointer";
}

// Removes the highlight from the tool button chosen
function deselectToolButtons(): void {
  document.querySelectorAll(".selected").forEach((element) => {
    element.classList.remove("selected");
    element.classList.add("unselected");
  });
}

// Where the tool was used, in pixels from the canvas's top-left corner: start is true for a click or the start of a
// drag, false for each tile a drag reaches after
export interface ToolClick {
  x: number;
  y: number;
  start: boolean;
}

export class InputStatus extends Emitter {
  // Keyboard Movement
  private readonly scrollKeys = new ScrollKeys();
  // Whether Escape was pressed since the game last took it
  private escapePressed = false;

  // Mouse movement: -1 while the mouse is off the canvas
  mouseX = -1;
  mouseY = -1;

  // Tool buttons
  toolName: string | null = null;
  toolWidth = 0;

  // Each tool's outline colour, by the tool's name, as its button gives it
  private readonly toolColours = new Map<string, string>();

  private readonly canvas: HTMLElement;
  private readonly pauseButton: HTMLElement;

  // Mouse drags: the tile a drag last reported, as a column and row
  private dragging = false;
  private lastDragX = -1;
  private lastDragY = -1;

  private readonly mouseDownHandler = (e: MouseEvent) => this.onMouseDown(e);
  private readonly mouseMoveHandler = (e: MouseEvent) => this.onMouseMove(e);
  private readonly mouseUpHandler = (e: MouseEvent) => this.onMouseUp(e);
  private readonly canvasClickHandler = (e: MouseEvent) => this.onCanvasClick(e);

  private readonly wheelZoom = new WheelZoom();
  // Where the pointer is over the canvas, tool or no tool, which the zoom keys zoom around, or null while it is off it
  private pointer: PixelPoint | null = null;

  // tileWidth gives the CSS pixels a tile is drawn, at the zoom the canvas is at, and windowHoldsInput whether a window
  // holds the keyboard and mouse, which leaves the keys to it but Escape
  constructor(private readonly tileWidth: () => number, private readonly windowHoldsInput: () => boolean) {
    super();
    this.canvas = requiredElement(GameCanvas.DEFAULT_ID);
    this.pauseButton = requiredElement("pauseRequest");

    // Add the listeners
    document.addEventListener("keydown", (e) => this.onKeyDown(e));
    document.addEventListener("keyup", (e) => this.onKeyUp(e));
    // A page that loses the keyboard never hears the keys held come up
    window.addEventListener("blur", () => this.scrollKeys.releaseAll(performance.now()));

    this.canvas.addEventListener("mouseenter", () => this.onMouseEnter());
    this.canvas.addEventListener("mouseleave", () => this.onMouseLeave());
    // Not passive, so the wheel zooms the map rather than scrolling the page
    this.canvas.addEventListener("wheel", (e) => this.onWheel(e), {passive: false});
    this.canvas.addEventListener("mousemove", (e) => {
      this.pointer = this.relativeCoordinates(e);
    });

    document.querySelectorAll<HTMLElement>(".toolButton").forEach((button) => {
      button.addEventListener("click", (e) => this.onToolButton(e, button));
      this.toolColours.set(button.dataset.tool ?? "", button.dataset.colour ?? "");
    });

    const requests: [HTMLElement, string][] = [
      [requiredElement("budgetRequest"), UiMessages.BUDGET_REQUESTED],
      [requiredElement("evalRequest"), UiMessages.EVAL_REQUESTED],
      [requiredElement("disasterRequest"), UiMessages.DISASTER_REQUESTED],
      [this.pauseButton, UiMessages.PAUSE_REQUESTED],
      [requiredElement("screenshotRequest"), UiMessages.SCREENSHOT_WINDOW_REQUESTED],
      [requiredElement("settingsRequest"), UiMessages.SETTINGS_WINDOW_REQUESTED],
      [requiredElement("saveRequest"), UiMessages.SAVE_REQUESTED],
      [requiredElement("debugRequest"), UiMessages.DEBUG_WINDOW_REQUESTED],
    ];
    for (const [button, message] of requests) {
      button.addEventListener("click", () => this.emit(message));
    }
  }

  // The pause button offers whatever the simulation isn't doing
  showPaused(paused: boolean): void {
    this.pauseButton.textContent = paused ? "Play" : "Pause";
  }

  clearTool(): void {
    this.toolName = null;
    this.toolWidth = 0;
    deselectToolButtons();
    this.showCursor();
  }

  private showCursor(): void {
    const cursor = cursorClass(this.toolName);

    this.canvas.classList.remove(...CURSOR_CLASSES);
    if (cursor !== null) {
      this.canvas.classList.add(cursor);
    }
  }

  // The whole tiles to scroll the view across and down at the time given, since the last take. A window holding the
  // keyboard holds the view still: the scroll owed for a key held as it opened is dropped.
  takeScroll(now: number): TilePoint {
    const scroll = this.scrollKeys.take(now, this.tileWidth());
    return this.windowHoldsInput() ? {x: 0, y: 0} : scroll;
  }

  // Whether Escape was pressed since the last take: a press is latched until the game takes it, so a tap that comes and
  // goes between two of its ticks is not lost
  takeEscape(): boolean {
    const pressed = this.escapePressed;
    this.escapePressed = false;
    return pressed;
  }

  // A window holding the keyboard keeps every key but Escape, which closes it: its sliders, selects and radio groups
  // take the arrow keys, and its inputs any key
  private onKeyDown(e: KeyboardEvent): void {
    const key = heldKey(e.keyCode);
    if (key === "escape") {
      if (!e.repeat) {
        this.escapePressed = true;
      }
      e.preventDefault();
      return;
    }

    if (this.windowHoldsInput()) {
      return;
    }

    if (key !== null && !isShortcut(e)) {
      this.scrollKeys.press(key, e.repeat, performance.now());
      e.preventDefault();
    }

    // Not mid-drag: the tile under the pointer can move as the zoom changes, and the drag would lay the tool along the
    // line to it
    const steps = zoomKey(e);
    if (steps !== null) {
      e.preventDefault();
      if (!this.dragging) {
        this.emit(UiMessages.ZOOM_REQUESTED, {steps, point: this.pointer} satisfies ZoomRequest);
      }
    }

    if (isMinimapKey(e)) {
      e.preventDefault();
      if (!e.repeat) {
        this.emit(UiMessages.MINIMAP_TOGGLE_REQUESTED);
      }
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const steps = this.wheelZoom.steps(e.deltaY, e.deltaMode);
    // Not mid-drag, as for the zoom keys
    if (steps !== 0 && !this.dragging) {
      this.emit(UiMessages.ZOOM_REQUESTED, {steps, point: this.relativeCoordinates(e)} satisfies ZoomRequest);
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    // A key held as a window opened comes up while it holds the keyboard
    const key = heldKey(e.keyCode);
    if (key !== null && key !== "escape") {
      this.scrollKeys.release(key, performance.now());
    }
  }

  private relativeCoordinates(e: MouseEvent): {x: number, y: number} {
    const cRect = this.canvas.getBoundingClientRect();
    return {x: e.clientX - cRect.left, y: e.clientY - cRect.top};
  }

  private onMouseEnter(): void {
    if (this.toolName === null) {
      return;
    }

    this.canvas.addEventListener("mousemove", this.mouseMoveHandler);

    if (DRAGGABLE_TOOLS.indexOf(this.toolName) !== -1) {
      this.canvas.addEventListener("mousedown", this.mouseDownHandler);
    } else {
      this.canvas.addEventListener("click", this.canvasClickHandler);
    }
  }

  private onMouseDown(e: MouseEvent): void {
    if (!isToolPress(e)) {
      return;
    }

    const coords = this.relativeCoordinates(e);
    this.mouseX = coords.x;
    this.mouseY = coords.y;

    this.dragging = true;
    this.emit(UiMessages.TOOL_CLICKED, {x: this.mouseX, y: this.mouseY, start: true} satisfies ToolClick);

    this.lastDragX = Math.floor(this.mouseX / this.tileWidth());
    this.lastDragY = Math.floor(this.mouseY / this.tileWidth());

    this.canvas.addEventListener("mouseup", this.mouseUpHandler);
    e.preventDefault();
  }

  private onMouseUp(e: MouseEvent): void {
    this.dragging = false;
    this.lastDragX = -1;
    this.lastDragY = -1;
    this.canvas.removeEventListener("mouseup", this.mouseUpHandler);
    e.preventDefault();
  }

  private onMouseLeave(): void {
    this.canvas.removeEventListener("mousedown", this.mouseDownHandler);
    this.canvas.removeEventListener("mousemove", this.mouseMoveHandler);
    this.canvas.removeEventListener("mouseup", this.mouseUpHandler);

    // Watch out: we might have been mid-drag
    if (this.dragging) {
      this.dragging = false;
      this.lastDragX = -1;
      this.lastDragY = -1;
    }

    this.canvas.removeEventListener("click", this.canvasClickHandler);

    this.mouseX = -1;
    this.mouseY = -1;
    this.pointer = null;
  }

  private onMouseMove(e: MouseEvent): void {
    const coords = this.relativeCoordinates(e);
    this.mouseX = coords.x;
    this.mouseY = coords.y;

    // A drag continues from the tile last reported: the game fills in the tiles a fast move skips
    if (this.dragging) {
      const x = Math.floor(this.mouseX / this.tileWidth());
      const y = Math.floor(this.mouseY / this.tileWidth());

      if (x !== this.lastDragX || y !== this.lastDragY) {
        this.emit(UiMessages.TOOL_CLICKED, {x: this.mouseX, y: this.mouseY, start: false} satisfies ToolClick);
        this.lastDragX = x;
        this.lastDragY = y;
      }
    }
  }

  private onCanvasClick(e: MouseEvent): void {
    if (!isToolPress(e) || this.mouseX === -1 || this.mouseY === -1 || this.dragging) {
      return;
    }

    this.emit(UiMessages.TOOL_CLICKED, {x: this.mouseX, y: this.mouseY, start: true} satisfies ToolClick);
    e.preventDefault();
  }

  // The colour the tool's outline is drawn in, whoever holds it
  toolColourOf(tool: string): string {
    return this.toolColours.get(tool) || "yellow";
  }

  private onToolButton(e: MouseEvent, button: HTMLElement): void {
    deselectToolButtons();

    // Add highlight
    button.classList.remove("unselected");
    button.classList.add("selected");

    this.toolName = button.dataset.tool ?? null;
    this.toolWidth = Number(button.dataset.size);

    this.showCursor();

    e.preventDefault();
  }
}
