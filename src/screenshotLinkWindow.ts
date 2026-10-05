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
import { ClosableWindow } from "./windowBase";

// Shows the link to a picture of the map the player took
export class ScreenshotLinkWindow extends ClosableWindow<[string], void> {
  constructor(opacityLayerID: string, windowID: string) {
    super(opacityLayerID, windowID, undefined);
    this.closeOnSubmit("screenshotLinkForm");
  }

  protected fill(screenshotLink: string): void {
    requiredElement("screenshotLink", HTMLAnchorElement).href = screenshotLink;
  }
}
