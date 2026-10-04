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

import type { CityDriver } from "./citySource";
import type { OriginLimits } from "./viewPosition";

// The end-to-end runner's hold on the game, installed on the window in debug mode. The runner holds the city source's
// step driver, lands its input, and moves the city on only through advance, so each step lands where it did on the
// last run. It changes city state only through the commands the game sends and the steps the source's driver takes:
// input reaches the game as real mouse and keyboard. Every call that reaches the city goes through the source's
// asynchronous driver channel, so the runner awaits it.

// What the hook needs of the game
interface HookedGame {
  sendToolPaths(): void;
  onCommandResult(listener: () => void): void;
  gameCanvas: {getTileOrigin(): {x: number, y: number}, getOriginLimits(): OriginLimits, readonly tileWidth: number,
               readonly mapCurrent: boolean};
  notificationBar: {dismiss(): void};
}

export interface Advanced {
  // The year-end budget was paid with the player's values during these steps, and the game opens its review on its
  // next tick. The city stepped on regardless: no window holds it.
  budgetReviewDue: boolean;
}

export interface View {
  // The map tile drawn at the canvas's top-left corner
  originX: number;
  originY: number;
  // How far the origin may move each way
  limits: OriginLimits;
  // A tile's width and height on the canvas, in CSS pixels, at the zoom the view is at
  tileWidth: number;
}

class TestHook {
  private driver: CityDriver | null = null;
  private game: HookedGame | null = null;
  private steps = 0;
  // The commands the attached game has applied
  private commands = 0;

  // The hold the page started with, once the runner has asked for one
  private startHold: Promise<void> | null = null;

  // Called as the page creates its city source, before any city starts
  attachDriver(driver: CityDriver): void {
    this.driver = driver;
  }

  // Holds the driver as the page starts, before it starts or joins any city: a page opened with a city's link joins the
  // city as it starts, before the runner could hold it, and the city would step unheld until the runner did
  holdAtStart(): void {
    const hold = this.holdDriver();
    // A hold that fails is the runner's to report, as it waits on it, not the page's console's in the meantime
    hold.catch(() => {});
    this.startHold = hold;
  }

  // Once the hold the page started with is in place. Fails as the hold did, or when the page started with none, since
  // a runner that went on would take a city stepping on its own for a held one.
  async untilHeldAtStart(): Promise<void> {
    if (this.startHold === null) {
      throw new Error("The page started without holding its driver: the runner asks for that before the page loads");
    }

    await this.startHold;
  }

  // Called by the game as it starts, before its first command
  attach(game: HookedGame): void {
    this.game = game;
    this.commands = 0;
    game.onCommandResult(() => {
      if (this.game === game) {
        this.commands++;
      }
    });
  }

  // Stops the source's step driver, from the city's next step: before a city starts, from its first. This is not the
  // game's pause: the game speed is untouched. While it is held, the game's tick leaves the input to the runner.
  async holdDriver(): Promise<void> {
    await this.attachedDriver().hold();
  }

  async releaseDriver(): Promise<void> {
    await this.attachedDriver().release();
  }

  // Sends the tool paths the player has drawn, one tool command each, and applies the commands sent. While the driver is
  // held, the game's tick leaves this to the runner, so a run's input becomes the same commands on every run.
  async applyInput(): Promise<void> {
    this.attachedGame().sendToolPaths();
    await this.attachedDriver().flush();
  }

  // Applies the input the game has yet to send, then takes this many steps at the city's own speed. Fails when the
  // city doesn't step at all, or when city time didn't advance as far as the steps imply.
  async advance(steps: number): Promise<Advanced> {
    const game = this.attachedGame();
    const driver = this.attachedDriver();
    // Before anything is sent, so a call refused changes nothing. The source checks both again: a city in the browser
    // with checkStepCount in cityTimeModel.ts, which the page can't import, since it imports the simulation, and a city
    // on the server with CityTimeModel in Micropolis.Rules.
    if (!Number.isInteger(steps) || steps < 0) {
      throw new Error(`Steps are taken in whole numbers, got ${steps}`);
    }

    if (!driver.isHeld()) {
      throw new Error("Advance needs the driver held, or the driver's steps would land at times of its own");
    }

    game.sendToolPaths();
    const result = await driver.advance(steps);
    this.steps += result.steps;

    if (result.error !== null) {
      throw new Error(result.error);
    }

    return {budgetReviewDue: result.budgetReviewDue};
  }

  // Hides the notification bar, which closes on wall time, so a screenshot shows the same frame however long the run
  // took. It has no control a player could close it with.
  dismissNotification(): void {
    this.attachedGame().notificationBar.dismiss();
  }

  // Every step advance has taken, including those of an advance that then failed
  stepsTaken(): number {
    return this.steps;
  }

  // The save, as the object a save file holds, which is kept nowhere: the Save button keeps the city in the server's
  // store, past a limit on how often
  async save(): Promise<object> {
    this.requireGame();
    return JSON.parse(await this.attachedDriver().savedGame()) as object;
  }

  // The commands the game has applied since it started, rejected ones included: one entry each in its command log
  commandsApplied(): number {
    this.requireGame();
    return this.commands;
  }

  async cityTime(): Promise<number> {
    this.requireGame();
    return this.attachedDriver().cityTime();
  }

  view(): View {
    const game = this.attachedGame();
    const origin = game.gameCanvas.getTileOrigin();

    return {originX: origin.x, originY: origin.y, limits: game.gameCanvas.getOriginLimits(),
            tileWidth: game.gameCanvas.tileWidth};
  }

  // Whether the map shows what the canvas last painted from, drawn to the end. A paint leaves the map as it is while
  // the GPU is still drawing the frame before, so a runner that waits for the paint waits for this too.
  mapCurrent(): boolean {
    return this.attachedGame().gameCanvas.mapCurrent;
  }

  private attachedGame(): HookedGame {
    this.requireGame();
    return this.game!;
  }

  // Fails when no game has started, before a call reaches the driver, whose own failure wouldn't say so
  private requireGame(): void {
    if (this.game === null) {
      throw new Error("No game has started");
    }
  }

  private attachedDriver(): CityDriver {
    if (this.driver === null) {
      throw new Error("No city source's driver is attached");
    }

    return this.driver;
  }
}

declare global {
  interface Window {
    micropolisTestHook?: TestHook;
    // Set by the runner before the page's scripts run, to have the hook hold the driver as the page starts
    micropolisHoldDriverAtStart?: boolean;
  }
}

function installTestHook(): void {
  window.micropolisTestHook = new TestHook();
}

// Attaches the source's driver to the hook, if one is installed, and holds it there and then when the runner asked: the
// hold goes out before anything the page sends to start or join a city, so it holds the city from its first step
function attachDriverToTestHook(driver: CityDriver): void {
  const hook = window.micropolisTestHook;
  if (hook === undefined) {
    return;
  }

  hook.attachDriver(driver);
  if (window.micropolisHoldDriverAtStart === true) {
    hook.holdAtStart();
  }
}

// Attaches a starting game to the hook, if one is installed
function attachToTestHook(game: HookedGame): void {
  window.micropolisTestHook?.attach(game);
}

export { attachDriverToTestHook, attachToTestHook, installTestHook, TestHook };
