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
import { EventEmitter } from "./eventEmitter.js";
import { GameCanvas } from "./gameCanvas";
import * as Messages from "./messages";

// The player's input as the game reads it each tick: the keys held, where the mouse is over the canvas and the tool
// chosen. A click or a drag with the tool, and a press of a control button, are events.

const TOOL_OUTPUT_ID = "toolOutput";

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

// Whether a mouse press is the primary button's alone, without a modifier key, which is the only press a tool takes
export function isToolPress(e: {button: number, shiftKey: boolean, altKey: boolean, ctrlKey: boolean,
                                metaKey: boolean}): boolean {
  return e.button === 0 && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
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

export class InputStatus {
  declare addEventListener: (event: string, listener: (value: never) => void) => void;
  declare removeEventListener: (event: string, listener: (value: never) => void) => void;
  declare _emitEvent: (event: string, value?: unknown) => void;

  // Keyboard Movement
  up = false;
  down = false;
  left = false;
  right = false;
  escape = false;

  // Mouse movement: -1 while the mouse is off the canvas
  mouseX = -1;
  mouseY = -1;

  // Tool buttons
  toolName: string | null = null;
  toolWidth = 0;
  toolColour = "";

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

  constructor(private readonly tileWidth: number) {
    this.canvas = requiredElement(GameCanvas.DEFAULT_ID);
    this.pauseButton = requiredElement("pauseRequest");

    // Add the listeners
    document.addEventListener("keydown", (e) => this.onKeyDown(e));
    document.addEventListener("keyup", (e) => this.onKeyUp(e));

    this.canvas.addEventListener("mouseenter", () => this.onMouseEnter());
    this.canvas.addEventListener("mouseleave", () => this.onMouseLeave());

    document.querySelectorAll<HTMLElement>(".toolButton").forEach((button) => {
      button.addEventListener("click", (e) => this.onToolButton(e, button));
    });

    const requests: [HTMLElement, string][] = [
      [requiredElement("budgetRequest"), Messages.BUDGET_REQUESTED],
      [requiredElement("evalRequest"), Messages.EVAL_REQUESTED],
      [requiredElement("disasterRequest"), Messages.DISASTER_REQUESTED],
      [this.pauseButton, Messages.PAUSE_REQUESTED],
      [requiredElement("screenshotRequest"), Messages.SCREENSHOT_WINDOW_REQUESTED],
      [requiredElement("settingsRequest"), Messages.SETTINGS_WINDOW_REQUESTED],
      [requiredElement("saveRequest"), Messages.SAVE_REQUESTED],
      [requiredElement("debugRequest"), Messages.DEBUG_WINDOW_REQUESTED],
    ];
    for (const [button, message] of requests) {
      button.addEventListener("click", () => this._emitEvent(message));
    }
  }

  // The pause button offers whatever the simulation isn't doing
  showPaused(paused: boolean): void {
    this.pauseButton.textContent = paused ? "Play" : "Pause";
  }

  clearTool(): void {
    // Clearing the query tool gives the canvas the pointer cursor of the other tools, not the default cursor it has
    // before any tool is chosen. Giving it the default would change what the player sees, which this module's
    // conversion leaves alone.
    if (this.toolName === "query") {
      this.canvas.classList.remove("helpPointer");
      this.canvas.classList.add("pointer");
    }

    this.toolName = null;
    this.toolWidth = 0;
    this.toolColour = "";
    deselectToolButtons();
  }

  private onKeyDown(e: KeyboardEvent): void {
    const key = heldKey(e.keyCode);
    if (key !== null) {
      this[key] = true;
      e.preventDefault();
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    const key = heldKey(e.keyCode);
    if (key !== null) {
      this[key] = false;
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
    this._emitEvent(Messages.TOOL_CLICKED, {x: this.mouseX, y: this.mouseY, start: true} satisfies ToolClick);

    this.lastDragX = Math.floor(this.mouseX / this.tileWidth);
    this.lastDragY = Math.floor(this.mouseY / this.tileWidth);

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
  }

  private onMouseMove(e: MouseEvent): void {
    const coords = this.relativeCoordinates(e);
    this.mouseX = coords.x;
    this.mouseY = coords.y;

    // A drag continues from the tile last reported: the game fills in the tiles a fast move skips
    if (this.dragging) {
      const x = Math.floor(this.mouseX / this.tileWidth);
      const y = Math.floor(this.mouseY / this.tileWidth);

      if (x !== this.lastDragX || y !== this.lastDragY) {
        this._emitEvent(Messages.TOOL_CLICKED, {x: this.mouseX, y: this.mouseY, start: false} satisfies ToolClick);
        this.lastDragX = x;
        this.lastDragY = y;
      }
    }
  }

  private onCanvasClick(e: MouseEvent): void {
    if (!isToolPress(e) || this.mouseX === -1 || this.mouseY === -1 || this.dragging) {
      return;
    }

    this._emitEvent(Messages.TOOL_CLICKED, {x: this.mouseX, y: this.mouseY, start: true} satisfies ToolClick);
    e.preventDefault();
  }

  private onToolButton(e: MouseEvent, button: HTMLElement): void {
    deselectToolButtons();

    // Add highlight
    button.classList.remove("unselected");
    button.classList.add("selected");

    this.toolName = button.dataset.tool ?? null;
    this.toolWidth = Number(button.dataset.size);
    this.toolColour = button.dataset.colour ?? "";
    requiredElement(TOOL_OUTPUT_ID).textContent = "Tools";

    if (this.toolName !== "query") {
      this.canvas.classList.remove("helpPointer");
      this.canvas.classList.add("pointer");
    } else {
      this.canvas.classList.remove("pointer");
      this.canvas.classList.add("helpPointer");
    }

    e.preventDefault();
  }
}

EventEmitter(InputStatus);
