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

import { requiredElement } from "./domElements";
import { DISASTER_WINDOW_CLOSED } from "./uiMessages";
import { DISASTER_KINDS, type DisasterKind } from "./protocol";
import { ClosableWindow } from "./windowBase";

// The value of the option that triggers no disaster, #disasterNone
const NONE = "none";

// The option of each disaster, #disasterMonster and so on, whose value is its kind
export function disasterOptionID(kind: DisasterKind): string {
  return `disaster${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
}

// The disaster the chosen option's value names, or null for none. Tested under node; the window only reads the value
// from the DOM.
export function chosenDisaster(value: string): DisasterKind | null {
  if (value === NONE) {
    return null;
  }

  const kind = DISASTER_KINDS.find((each) => each === value);
  if (kind === undefined) {
    throw new Error(`No disaster has the option value ${value}`);
  }

  return kind;
}

// The disasters the player may trigger. Closing emits the disaster chosen, which the game sends as a triggerDisaster
// command, or null for none or when cancelled.
export class DisasterWindow extends ClosableWindow {
  constructor(opacityLayerID: string, windowID: string) {
    super(opacityLayerID, windowID, DISASTER_WINDOW_CLOSED, "disasterSelect");

    requiredElement("disasterNone", HTMLOptionElement).value = NONE;
    for (const kind of DISASTER_KINDS) {
      requiredElement(disasterOptionID(kind), HTMLOptionElement).value = kind;
    }

    this.closeOnClick("disasterCancel");

    requiredElement("disasterForm", HTMLFormElement).addEventListener("submit", (event) => {
      event.preventDefault();
      this.close(chosenDisaster(requiredElement("disasterSelect", HTMLSelectElement).value));
    });
  }

  open(): void {
    this._toggleDisplay();
  }

  close(disaster: DisasterKind | null = null): void {
    super.close(disaster);
  }
}
