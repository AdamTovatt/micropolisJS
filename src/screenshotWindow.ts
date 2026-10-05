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

import { isChecked, requiredElement } from "./domElements";
import { ClosableWindow } from "./windowBase";

// What the picture shows: the part of the map in view, or all of it
export type ScreenshotArea = "visible" | "all";

// Asks what to take a picture of. It closes with the area chosen, which the game takes a picture of in the client, or
// null when cancelled.
export class ScreenshotWindow extends ClosableWindow<[], ScreenshotArea | null> {
  constructor(opacityLayerID: string, windowID: string) {
    super(opacityLayerID, windowID, null);

    this.closeOnClick("screenshotCancel");

    requiredElement("screenshotForm", HTMLFormElement).addEventListener("submit", (event) => {
      event.preventDefault();
      this.closeWith(isChecked("screenshotVisible") ? "visible" : "all");
    });
  }

  protected fill(): void {}
}
