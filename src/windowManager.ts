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

import type { GameWindow } from "./windowBase";

// The game's windows, shown one at a time. A window showing holds the keyboard and the mouse: the arrow keys don't
// scroll the map, there is no hover box, and no other window opens. No window holds the city, which keeps stepping
// behind every one of them.
export class WindowManager {
  private shown: GameWindow<never, unknown> | null = null;

  // Opens a window unless one is already showing, and returns the player's choice to come, or null when it didn't
  // open. A window that opens unasked, such as the touch warning, is not shown at all when another is showing. The
  // manager lets go of the input as the window closes, before the choice arrives, so a choice may open another window.
  // A window that fails to open holds nothing, and its failure is thrown to whoever opened it.
  open<Args extends unknown[], Choice>(window: GameWindow<Args, Choice>, ...args: Args): Promise<Choice> | null {
    if (this.shown !== null)
      return null;

    let chosen: (choice: Choice) => void = () => {};
    const choice = new Promise<Choice>((resolve) => {
      chosen = resolve;
    });

    this.shown = window;
    try {
      window.open((closedWith) => {
        this.shown = null;
        chosen(closedWith);
      }, ...args);
    } catch (error) {
      this.shown = null;
      throw error;
    }

    return choice;
  }

  // Closes the window showing, as Escape does
  closeShown(): void {
    if (this.shown !== null)
      this.shown.close();
  }

  holdsInput(): boolean {
    return this.shown !== null;
  }
}
