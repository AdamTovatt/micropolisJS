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
  // The saved game's text
  save(): Promise<string>;
  onCommandResult(listener: () => void): void;
  gameCanvas: {getTileOrigin(): {x: number, y: number}, getOriginLimits(): OriginLimits};
  tileSet: {tileWidth: number};
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
  // A tile's width and height on the canvas, in pixels
  tileWidth: number;
}

class TestHook {
  private driver: CityDriver | null = null;
  private game: HookedGame | null = null;
  private steps = 0;
  // The commands the attached game has applied
  private commands = 0;

  // Called as the page creates its city source, before any city starts
  attachDriver(driver: CityDriver): void {
    this.driver = driver;
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
    // Before anything is sent, so a call refused changes nothing. The source checks both again, with checkStepCount in
    // cityTimeModel.ts, which the page can't import: it imports the simulation.
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

  // Every step advance has taken, including those of an advance that then failed
  stepsTaken(): number {
    return this.steps;
  }

  // The save, as the object the game writes to storage
  async save(): Promise<object> {
    return JSON.parse(await this.attachedGame().save()) as object;
  }

  // The commands the game has applied since it started, rejected ones included: one entry each in its command log
  commandsApplied(): number {
    // Only to fail when no game has started
    this.attachedGame();
    return this.commands;
  }

  async cityTime(): Promise<number> {
    // Only to fail when no game has started
    this.attachedGame();
    return this.attachedDriver().cityTime();
  }

  view(): View {
    const game = this.attachedGame();
    const origin = game.gameCanvas.getTileOrigin();

    return {originX: origin.x, originY: origin.y, limits: game.gameCanvas.getOriginLimits(),
            tileWidth: game.tileSet.tileWidth};
  }

  private attachedGame(): HookedGame {
    if (this.game === null) {
      throw new Error("No game has started");
    }

    return this.game;
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
  }
}

function installTestHook(): void {
  window.micropolisTestHook = new TestHook();
}

// Attaches the source's driver to the hook, if one is installed
function attachDriverToTestHook(driver: CityDriver): void {
  window.micropolisTestHook?.attachDriver(driver);
}

// Attaches a starting game to the hook, if one is installed
function attachToTestHook(game: HookedGame): void {
  window.micropolisTestHook?.attach(game);
}

export { attachDriverToTestHook, attachToTestHook, installTestHook, TestHook };
