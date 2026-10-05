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

import { requiredElement, toggleShown } from "./domElements";

// A window as the game drives it: it opens with the arguments Args and closes with the player's choice, a Choice,
// which it hands to closed once it has hidden. Closing it unasked, as Escape does, closes it as cancelled.
// windowManager.ts shows them one at a time.
export interface GameWindow<Args extends unknown[], Choice> {
  open(closed: (choice: Choice) => void, ...args: Args): void;
  close(): void;
}

// The base of the game's windows: a window over the opacity layer that opens with the arguments Args, fills itself
// from them and shows, and closes with the player's choice, a Choice. It hides, then hands the choice to whoever opened
// it, so that a choice that opens another window starts from a hidden opacity layer. Closing it unasked, as Escape and
// a cancel button do, closes it with the choice it was built to cancel with.
export abstract class ClosableWindow<Args extends unknown[], Choice> implements GameWindow<Args, Choice> {
  private readonly opacityLayer: HTMLElement;
  private readonly windowElement: HTMLElement;
  // Who hears the choice of the window showing, or null while it is hidden
  private closed: ((choice: Choice) => void) | null = null;

  // cancelled is the choice the window closes with unasked; focusID names the element that takes the focus when the
  // window shows, by default its submit button
  constructor(opacityLayerID: string, windowID: string, private readonly cancelled: Choice,
              private readonly focusID: string | null = null) {
    this.opacityLayer = requiredElement(opacityLayerID);
    this.windowElement = requiredElement(windowID);
  }

  open(closed: (choice: Choice) => void, ...args: Args): void {
    this.fill(...args);
    this.closed = closed;
    this.toggleDisplay();
  }

  close(): void {
    this.closeWith(this.cancelled);
  }

  // Writes what the window opens with into the DOM, before it shows
  protected abstract fill(...args: Args): void;

  // A window showing closes once: its forms and buttons are hidden with it
  protected closeWith(choice: Choice): void {
    const closed = this.closed;
    if (closed === null) {
      throw new Error("A window that isn't showing can't close");
    }

    this.closed = null;
    this.toggleDisplay();
    closed(choice);
  }

  protected closeOnSubmit(formID: string): void {
    requiredElement(formID, HTMLFormElement).addEventListener("submit", (event) => {
      event.preventDefault();
      this.close();
    });
  }

  // Closes as cancelled when the button is clicked, as a cancel button does, instead of submitting its form
  protected closeOnClick(buttonID: string): void {
    requiredElement(buttonID).addEventListener("click", (event) => {
      event.preventDefault();
      this.close();
    });
  }

  // Shows the opacity layer and the window when they are hidden, and hides them when they show. Each window's
  // markup starts hidden by its class. A window that shows gives the focus to its focus element, so that Enter
  // answers a window focused on its submit button.
  private toggleDisplay(): void {
    toggleShown(this.opacityLayer);

    if (toggleShown(this.windowElement)) {
      const focused = this.focusID === null ?
        this.windowElement.querySelector<HTMLInputElement>("input[type=submit]") : requiredElement(this.focusID);
      focused?.focus();
    }
  }
}
