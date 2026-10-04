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

import { isChecked, requiredElement } from "./domElements";
import { DEBUG_WINDOW_CLOSED } from "./uiMessages";
import { ClosableWindow } from "./windowBase";

// What the player chose in the window
export interface DebugChoices {
  addFunds: boolean;
  downloadLog: boolean;
}

// The actions the window closes with: adding funds, which the game sends as a command, and downloading the session's
// command log
export type DebugAction = "addFunds" | "downloadLog";

// The actions the choices ask for, funds first. Tested under node; the window only reads the choices from the DOM.
export function debugActions(choices: DebugChoices): DebugAction[] {
  const actions: DebugAction[] = [];

  if (choices.addFunds) {
    actions.push("addFunds");
  }

  if (choices.downloadLog) {
    actions.push("downloadLog");
  }

  return actions;
}

// The debug actions, in debug mode. Closing emits the actions chosen, none when cancelled.
export class DebugWindow extends ClosableWindow {
  constructor(opacityLayerID: string, windowID: string) {
    super(opacityLayerID, windowID, DEBUG_WINDOW_CLOSED);

    this.closeOnClick("debugCancel");

    requiredElement("debugForm", HTMLFormElement).addEventListener("submit", (event) => {
      event.preventDefault();
      this.close(debugActions({addFunds: isChecked("fundsYes"), downloadLog: isChecked("logYes")}));
    });
  }

  // The log downloads only when asked for each time, never because it was the last time
  open(): void {
    requiredElement("logNo", HTMLInputElement).checked = true;
    this._toggleDisplay();
  }

  close(actions: DebugAction[] = []): void {
    super.close(actions);
  }
}
