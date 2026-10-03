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

// The base of the game's windows: a window over the opacity layer, which windowManager.ts shows one at a time. A
// window emits its events through the event emitter. A TypeScript window extends ClosableWindow below, and a window
// still in JavaScript is built through ModalWindow.
export class WindowBase {
  declare addEventListener: (event: string, listener: (value: never) => void) => void;
  declare removeEventListener: (event: string, listener: (value: never) => void) => void;
  declare _emitEvent: (event: string, value?: unknown) => void;

  private readonly opacityLayer: HTMLElement;
  private readonly windowElement: HTMLElement;
  private readonly focusID: string | null;

  // focusID names the element that takes the focus when the window shows, by default its submit button
  constructor(opacityLayerID: string, windowID: string, focusID: string | null = null) {
    this.opacityLayer = requiredElement(opacityLayerID);
    this.windowElement = requiredElement(windowID);
    this.focusID = focusID;
  }

  // Shows the opacity layer and the window when they are hidden, and hides them when they show. Each window's
  // markup starts hidden by its class. A window that shows gives the focus to its focus element, so that Enter
  // answers a window focused on its submit button.
  _toggleDisplay(): void {
    toggle(this.opacityLayer);

    if (toggle(this.windowElement)) {
      const focused = this.focusID === null ?
        this.windowElement.querySelector<HTMLInputElement>("input[type=submit]") : requiredElement(this.focusID);
      focused?.focus();
    }
  }
}

EventEmitter(WindowBase);

// Shows a hidden element, as a block, as jQuery's toggle showed one hidden by a class, or hides one that shows, and
// says whether it shows now
function toggle(element: HTMLElement): boolean {
  const shows = getComputedStyle(element).display === "none";
  element.style.display = shows ? "block" : "none";
  return shows;
}

// A window that closes by hiding, then emitting its closed event, so that a handler that opens another window in its
// place starts from a hidden opacity layer
export class ClosableWindow extends WindowBase {
  constructor(opacityLayerID: string, windowID: string, private readonly closedEvent: string) {
    super(opacityLayerID, windowID);
  }

  // value goes with the closed event, such as the actions a window closes with
  close(value?: unknown): void {
    this._toggleDisplay();
    this._emitEvent(this.closedEvent, value);
  }

  protected closeOnSubmit(formID: string): void {
    requiredElement(formID, HTMLFormElement).addEventListener("submit", (event) => {
      event.preventDefault();
      this.close();
    });
  }
}

type WindowConstructor = new (opacityLayerID: string, windowID: string) => WindowBase;

// A window class for a window still in JavaScript: its constructor takes the opacity layer's id and the window's id,
// then calls constructorFunction on the new window, and the window adds its methods to the class's prototype. focusID
// names the element that takes the focus when the window shows, by default its submit button, with or without the
// leading # the JavaScript windows write.
export function ModalWindow(constructorFunction: (this: WindowBase) => void, focusID?: string): WindowConstructor {
  const focusElementID = focusID === undefined ? null : focusID.replace(/^#/, "");

  return class extends WindowBase {
    constructor(opacityLayerID: string, windowID: string) {
      super(opacityLayerID, windowID, focusElementID);
      constructorFunction.call(this);
    }
  };
}
