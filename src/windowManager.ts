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

// The game's windows, shown one at a time. A window showing holds the keyboard and the mouse: the arrow keys don't
// scroll the map, there is no hover box, and no other window opens. No window holds the city, which keeps stepping
// behind every one of them.

// A window as the game drives it. Closing one emits its closed event, whose handler calls closed() before acting on
// the player's choice, so that the handler may open another window in its place.
interface GameWindow {
  open(...args: unknown[]): void;
  close(): void;
}

// The mark on the Budget button that a year-end budget review is due
interface ReviewMarker {
  setLit(lit: boolean): void;
}

class WindowManager {
  private shown: GameWindow | null = null;

  // budgetValues gives the arguments the budget window opens with
  constructor(private readonly budgetWindow: GameWindow, private readonly budgetValues: () => unknown[],
              private readonly reviewMarker: ReviewMarker) {}

  // Opens a window unless one is already showing, and says whether it did. A window that opens unasked, such as the
  // touch warning, is not shown at all when another is showing.
  open(window: GameWindow, ...args: unknown[]): boolean {
    if (this.shown !== null)
      return false;

    this.shown = window;
    window.open(...args);
    return true;
  }

  // Opens the budget window unless another is showing, and says whether it did. Opening it, however the player asked,
  // is the review of any that fell due.
  openBudget(): boolean {
    if (!this.open(this.budgetWindow, ...this.budgetValues()))
      return false;

    this.reviewMarker.setLit(false);
    return true;
  }

  // The year end paid for the services with the player's values, which the player is offered to review. The budget
  // window never opens unasked, since in a shared city it would open for every player at once: the marker shows until
  // this player opens it.
  budgetReviewDue(): void {
    this.reviewMarker.setLit(true);
  }

  closed(): void {
    this.shown = null;
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


export type { GameWindow, ReviewMarker };
export { WindowManager };
