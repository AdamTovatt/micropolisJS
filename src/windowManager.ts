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

// The game's windows, shown one at a time. A window showing holds the keyboard and the mouse: the arrow keys don't
// scroll the map, there is no hover box, and no other window opens. Only the budget window holds the city as well;
// the city keeps stepping behind every other window.

// A window as the game drives it. Closing one emits its closed event, whose handler calls closed() before acting on
// the player's choice, so that the handler may open another window in its place.
interface GameWindow {
  open(...args: unknown[]): void;
  close(): void;
}

class WindowManager {
  private shown: GameWindow | null = null;

  // budgetDue says whether the simulation awaits the player's year-end budget values; budgetValues gives the
  // arguments the budget window opens with
  constructor(private readonly budgetWindow: GameWindow, private readonly budgetDue: () => boolean,
              private readonly budgetValues: () => unknown[]) {}

  // Opens a window unless one is already showing. A window that opens unasked, such as the nag, is not shown at all
  // when another is showing, so it can't take the budget window's place while the budget holds the city.
  open(window: GameWindow, ...args: unknown[]): void {
    if (this.shown !== null)
      return;

    this.shown = window;
    window.open(...args);
  }

  openBudget(): void {
    this.open(this.budgetWindow, ...this.budgetValues());
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

  holdsCity(): boolean {
    return this.shown === this.budgetWindow;
  }

  // The year-end budget falls due during a step, maybe while another window shows. Called after each run of steps, it
  // opens the budget window once no window shows, and the simulation holds its phases until it has the player's values.
  openDue(): void {
    if (this.budgetDue())
      this.openBudget();
  }
}


export type { GameWindow };
export { WindowManager };
