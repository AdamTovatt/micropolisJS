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
import { SCREENSHOT_WINDOW_CLOSED } from "./uiMessages";
import { ClosableWindow } from "./windowBase";

// What the picture shows: the part of the map in view, or all of it
export type ScreenshotArea = "visible" | "all";

// Asks what to take a picture of. Closing emits the area chosen, which the game takes a picture of in the client, or
// null when cancelled.
export class ScreenshotWindow extends ClosableWindow {
  constructor(opacityLayerID: string, windowID: string) {
    super(opacityLayerID, windowID, SCREENSHOT_WINDOW_CLOSED);

    this.closeOnClick("screenshotCancel");

    requiredElement("screenshotForm", HTMLFormElement).addEventListener("submit", (event) => {
      event.preventDefault();
      this.close(isChecked("screenshotVisible") ? "visible" : "all");
    });
  }

  open(): void {
    this._toggleDisplay();
  }

  close(area: ScreenshotArea | null = null): void {
    super.close(area);
  }
}
