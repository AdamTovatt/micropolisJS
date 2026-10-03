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

import { clockOf, ClockedSimulation, impliedCityTime } from "./cityTimeModel";
import { BUDGET_REVIEW_DUE } from "./messages";
import { StepDriver } from "./stepDriver";
import { Storage } from "./storage.js";

// The end-to-end runner's hold on the game, installed on the window in debug mode. The runner holds the step driver,
// lands its input, and moves the city on only through advance, so each step lands where it did on the last run. It
// changes city state only through the commands the game sends and the step the driver calls: input reaches the game as
// real mouse and keyboard.

// What the hook needs of the game
interface HookedGame {
  stepDriver: StepDriver;
  isStepping(): boolean;
  stepSimulation(): void;
  sendToolPaths(): void;
  commandQueue: {applyCommands(): unknown};
  saveData(): object;
  simulation: ClockedSimulation & {
    isPaused(): boolean;
    addEventListener(event: string, listener: () => void): void;
    removeEventListener(event: string, listener: () => void): void;
  };
  gameCanvas: {getTileOrigin(): {x: number, y: number}};
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
  // A tile's width and height on the canvas, in pixels
  tileWidth: number;
}

function notSteppingReason(game: HookedGame): string {
  return game.simulation.isPaused() ? "it is paused" : "the page is hidden, or too small to play";
}

class TestHook {
  private game: HookedGame | null = null;
  private held = false;
  private steps = 0;

  // Called by the game as it starts, before its first step. A hold taken before the game started applies from its
  // first step, so no step runs before the runner says so.
  attach(game: HookedGame): void {
    this.game = game;

    if (this.held) {
      game.stepDriver.hold();
    }
  }

  // Stops the browser's step driver. This is not the game's pause: the game speed is untouched.
  holdDriver(): void {
    this.held = true;
    this.game?.stepDriver.hold();
  }

  releaseDriver(): void {
    this.held = false;
    this.game?.stepDriver.release();
  }

  // Sends the tool paths the player has drawn and applies the commands sent, as the game's next tick would. With the
  // driver held, a command applies at the same step whenever that happens, so this changes only when the runner sees
  // the city change: at once, rather than on the next tick.
  applyInput(): void {
    const game = this.attachedGame();

    game.sendToolPaths();
    game.commandQueue.applyCommands();
  }

  // Applies the input the game has yet to send, then takes this many steps, calling the step the driver calls, at the
  // city's own speed. Fails when the city doesn't step at all, or when city time didn't advance as far as the steps
  // imply.
  advance(steps: number): Advanced {
    const game = this.attachedGame();

    if (!Number.isInteger(steps) || steps < 0) {
      throw new Error(`Advance takes a whole number of steps, got ${steps}`);
    }

    if (!game.stepDriver.isHeld()) {
      throw new Error("Advance needs the driver held, or the driver's steps would land at times of its own");
    }

    // Before the check that the city steps: the input may be the Pause button
    this.applyInput();

    if (!game.isStepping()) {
      throw new Error(`The city is not stepping: ${notSteppingReason(game)}`);
    }

    let budgetReviewDue = false;
    const onReviewDue = () => {
      budgetReviewDue = true;
    };
    game.simulation.addEventListener(BUDGET_REVIEW_DUE, onReviewDue);

    const before = clockOf(game.simulation);
    try {
      for (let i = 0; i < steps; i++) {
        game.stepSimulation();
        this.steps++;
      }
    } finally {
      game.simulation.removeEventListener(BUDGET_REVIEW_DUE, onReviewDue);
    }

    const expected = impliedCityTime(before, steps);
    const reached = game.simulation._cityTime;
    if (reached !== expected) {
      throw new Error(`The city stalled: ${steps} steps should advance city time from ${before.cityTime} to ` +
                      `${expected}, but it reached ${reached}`);
    }

    return {budgetReviewDue};
  }

  // Every step advance has taken, including those of an advance that then failed
  stepsTaken(): number {
    return this.steps;
  }

  // The save, as the object the game writes to storage
  save(): object {
    return JSON.parse(Storage.serialise(this.attachedGame().saveData()));
  }

  cityTime(): number {
    return this.attachedGame().simulation._cityTime;
  }

  view(): View {
    const game = this.attachedGame();
    const origin = game.gameCanvas.getTileOrigin();

    return {originX: origin.x, originY: origin.y, tileWidth: game.tileSet.tileWidth};
  }

  private attachedGame(): HookedGame {
    if (this.game === null) {
      throw new Error("No game has started");
    }

    return this.game;
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

// Attaches a starting game to the hook, if one is installed
function attachToTestHook(game: HookedGame): void {
  window.micropolisTestHook?.attach(game);
}

export { attachToTestHook, installTestHook, TestHook };
