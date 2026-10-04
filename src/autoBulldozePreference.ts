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

import { PageStore, StoredText } from "./storage";

export const AUTO_BULLDOZE_KEY = "micropolisJSAutoBulldoze";

// The player's auto-bulldoze setting, on until the player turns it off. It belongs to the player, not the city: it is
// kept under its own key, never in a city save, and sent with each tool command. A store that can't be read or written,
// such as one that is full or disabled, leaves the setting held for this game only (StoredText).
export class AutoBulldozePreference {
  private readonly text: StoredText;
  private on: boolean;

  constructor(store: PageStore | null) {
    this.text = new StoredText(store, AUTO_BULLDOZE_KEY);
    this.on = this.text.read() !== "false";
  }

  isOn(): boolean {
    return this.on;
  }

  set(on: boolean): void {
    this.on = on;
    this.text.write(String(on));
  }
}
