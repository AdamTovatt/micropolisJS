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

import { expect, Page } from "@playwright/test";
import { readFileSync } from "fs";

import { CommandLog, joinSessions, parseLog } from "../src/commandLog";
import type { Advanced, View } from "../src/testHook";

// The runner's player: plays the game in the page through real mouse and keyboard input, while the test hook holds the
// step driver, and moves the city on only through the hook's advance. Every input lands between the same two steps on
// every run, which is what makes a checkpoint reproducible.

export interface Tile {
  x: number;
  y: number;
}

// A save, as the game writes it to storage, in the parts the runner reads. The map's tiles are raw tile values, row
// by row.
export interface SaveData {
  map: {width: number, height: number, tiles: number[]};
  budget: {totalFunds: number, cityTax: number, policePercent: number};
  [key: string]: unknown;
}

export type Tool = "residential" | "commercial" | "industrial" | "coal" | "nuclear" | "police" | "fire" | "road" |
  "rail" | "wire" | "port" | "stadium" | "airport" | "park" | "bulldozer" | "query";

export type Difficulty = "Easy" | "Med" | "Hard";

const CANVAS = "#MicropolisCanvas";

export class Player {
  // Steps taken through the hook since the count was last read
  private stepsTaken = 0;
  // The command logs of the sessions ended so far, in order. A reload ends a session: the game it loads starts a log
  // of its own.
  private readonly sessionLogs: CommandLog[] = [];
  // The commands those sessions applied
  private commandsBefore = 0;

  constructor(readonly page: Page) {}

  // Opens the page in debug mode, with more of a query string if given, and holds the driver before the game exists,
  // so it never steps unasked
  async open(query = ""): Promise<void> {
    await this.page.goto(`/?debug=1${query === "" ? "" : `&${query}`}`);
    await this.holdOnceHooked();
  }

  // Starts a new game on the seed's map through the splash screen and the start form
  async startNewGame(seed: number, name: string, difficulty: Difficulty): Promise<void> {
    await this.open(`seed=${seed}`);
    await expect(this.page.locator("#splashSeed")).toHaveText(String(seed));
    await this.page.click("#splashPlay");
    await this.page.fill("#nameForm", name);
    await this.page.check(`#difficulty${difficulty}`);
    await this.page.click("#playit");
    await this.waitForGame();
  }

  // Ends the session, then reloads the page and loads the game saved in storage, as a player would
  async reloadSavedGame(): Promise<void> {
    await this.endSession();
    await this.page.reload();
    await this.holdOnceHooked();
    await this.page.click("#splashLoad");
    await this.waitForGame();
  }

  async waitForGame(): Promise<void> {
    await this.page.locator(CANVAS).waitFor();
    await this.page.waitForFunction(() => {
      try {
        window.micropolisTestHook!.view();
        return true;
      } catch {
        return false;
      }
    });
  }

  // Ends the session, and joins its command log to those of the sessions before it, in order: the run's log, from
  // where the first session started
  async runLog(): Promise<CommandLog> {
    await this.endSession();
    return joinSessions(this.sessionLogs);
  }

  // The commands applied since the run began, in every session: the entries of the run's log so far
  async commandsApplied(): Promise<number> {
    return this.commandsBefore + await this.page.evaluate(() => window.micropolisTestHook!.commandsApplied());
  }

  // Takes exactly this many steps. A year-end budget review falling due on the way fails the run, since its window
  // would take the input meant for the city: with auto-budget on, one falls due only when the city can't pay.
  async advance(steps: number): Promise<void> {
    const advanced = await this.hookAdvance(steps);

    if (advanced.budgetReviewDue) {
      throw new Error(`A year-end budget review fell due within ${steps} steps`);
    }
  }

  // Steps chunk steps at a time until the year-end budget review falls due, then waits for the game to open it. The
  // city steps on through the year end, and stops at the end of the chunk it fell in, the same step on every run.
  // Fails if it hasn't fallen due within maxSteps.
  async advanceUntilBudgetReview(maxSteps: number, chunk: number): Promise<void> {
    for (let taken = 0; taken < maxSteps; taken += chunk) {
      if ((await this.hookAdvance(chunk)).budgetReviewDue) {
        await this.page.locator("#budget").waitFor();
        return;
      }
    }

    throw new Error(`No year-end budget review fell due within ${maxSteps} steps`);
  }

  // The steps taken since the last call
  takeStepCount(): number {
    const steps = this.stepsTaken;
    this.stepsTaken = 0;
    return steps;
  }

  async releaseDriver(): Promise<void> {
    await this.page.evaluate(() => window.micropolisTestHook!.releaseDriver());
  }

  async holdDriver(): Promise<void> {
    await this.page.evaluate(() => window.micropolisTestHook!.holdDriver());
  }

  async cityTime(): Promise<number> {
    return this.page.evaluate(() => window.micropolisTestHook!.cityTime());
  }

  async save(): Promise<SaveData> {
    return await this.page.evaluate(() => window.micropolisTestHook!.save()) as SaveData;
  }

  // The build the page was served from, as the Settings window shows it
  async buildId(): Promise<string> {
    return ((await this.page.locator("#buildDisplay").textContent()) ?? "").replace(/^\s*Build:\s*/, "").trim();
  }

  async selectTool(tool: Tool): Promise<void> {
    await this.page.click(`#${tool}Button`);
  }

  // Clicks a tile with the selected tool. A building's tile is the one in from its top-left corner, where the
  // game's outline puts the pointer.
  async clickTile(tile: Tile): Promise<void> {
    const point = await this.tilePoint(tile);
    await this.page.mouse.click(point.x, point.y);
    await this.applyInput();
  }

  // Drags the selected tool from one tile to another along a row or column, with the pointer on every tile on the way
  async dragTiles(from: Tile, to: Tile): Promise<void> {
    if (from.x !== to.x && from.y !== to.y) {
      throw new Error("A drag runs along a row or a column");
    }

    const start = await this.tilePoint(from);
    const end = await this.tilePoint(to);
    const tiles = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);

    await this.page.mouse.move(start.x, start.y);
    await this.page.mouse.down();
    await this.page.mouse.move(end.x, end.y, {steps: Math.max(tiles, 1)});
    await this.page.mouse.up();
    await this.applyInput();
  }

  // Queries a tile with the query tool and reads one of the debug figures the query window shows, by the id of its
  // field, then closes the window
  async queryDebugFigure(tile: Tile, fieldId: string): Promise<number> {
    await this.selectTool("query");
    await this.clickTile(tile);
    const text = await this.page.locator(`#${fieldId}`).textContent();
    await this.page.click("#queryOK");

    return Number(text);
  }

  async pressPause(): Promise<void> {
    await this.page.click("#pauseRequest");
    await this.applyInput();
  }

  // Opens the settings, sets auto-budget, and closes them
  async setAutoBudget(on: boolean): Promise<void> {
    await this.page.click("#settingsRequest");
    await this.page.check(on ? "#autoBudgetYes" : "#autoBudgetNo");
    await this.page.click("#settingsOK");
    await this.applyInput();
  }

  // Accepts the budget window's values
  async confirmBudget(): Promise<void> {
    await this.page.click("#budgetOK");
    await this.applyInput();
  }

  async triggerDisaster(disaster: string): Promise<void> {
    await this.page.click("#disasterRequest");
    await this.page.selectOption("#disasterSelect", {label: disaster});
    await this.page.click("#disasterOK");
    await this.applyInput();
  }

  // Sets a range input with the mouse: presses on the track, which takes the thumb there, then drags a pixel at a time
  // until the input reads the value. The keyboard can't do it: the game takes the arrow keys for scrolling the map, on
  // the whole page.
  async setSlider(selector: string, value: number): Promise<void> {
    const slider = this.page.locator(selector);
    const box = await slider.boundingBox();
    if (box === null) {
      throw new Error(`${selector} is not on screen`);
    }

    const y = box.y + box.height / 2;
    let x = Math.round(box.x + box.width / 2);
    const read = async () => Number(await slider.inputValue());

    await this.page.mouse.move(x, y);
    await this.page.mouse.down();

    const direction = await read() < value ? 1 : -1;
    while (await read() !== value && x >= box.x && x <= box.x + box.width) {
      x += direction;
      await this.page.mouse.move(x, y);
    }

    await this.page.mouse.up();
    expect(await read(), `${selector} set by mouse`).toBe(value);
  }

  async saveGame(): Promise<void> {
    await this.page.click("#saveRequest");
    await this.page.click("#saveOK");
  }

  // Waits for the canvas to be painted as the city now stands
  async settle(): Promise<void> {
    await this.page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
  }

  // Applies the commands the input sent at once, rather than on the game's next tick, so the city the runner reads next
  // has them. They apply at the same step either way.
  private async applyInput(): Promise<void> {
    await this.page.evaluate(() => window.micropolisTestHook!.applyInput());
  }

  // Downloads the session's command log from the debug window, adding no funds, and keeps it. Fails unless the log
  // holds every command the game applied, one entry each.
  private async endSession(): Promise<void> {
    await this.page.click("#debugRequest");
    await this.page.check("#fundsNo");
    await this.page.check("#logYes");
    const [download] = await Promise.all([this.page.waitForEvent("download"), this.page.click("#debugOK")]);
    const log = parseLog(JSON.parse(readFileSync(await download.path(), "utf8")));

    const applied = await this.page.evaluate(() => window.micropolisTestHook!.commandsApplied());
    if (log.entries.length !== applied) {
      throw new Error(`The session's log holds ${log.entries.length} commands, but the game applied ${applied}`);
    }

    this.sessionLogs.push(log);
    this.commandsBefore += applied;
  }

  // Waits for the page to install the hook, then holds the driver
  private async holdOnceHooked(): Promise<void> {
    await this.page.waitForFunction(() => window.micropolisTestHook !== undefined);
    await this.holdDriver();
  }

  // The hook's advance, counting the steps it took even when it fails
  private async hookAdvance(steps: number): Promise<Advanced> {
    const outcome = await this.page.evaluate((n) => {
      const hook = window.micropolisTestHook!;
      const before = hook.stepsTaken();

      try {
        return {advanced: hook.advance(n), steps: hook.stepsTaken() - before, error: null};
      } catch (e) {
        return {advanced: null, steps: hook.stepsTaken() - before, error: (e as Error).message};
      }
    }, steps);

    this.stepsTaken += outcome.steps;
    if (outcome.advanced === null) {
      throw new Error(outcome.error ?? "The hook's advance failed");
    }

    return outcome.advanced;
  }

  // The centre of a tile on the screen, worked out from the view's origin rather than from the game's own mapping of
  // pointer to tile, which is the thing under test. Fails when the tile is out of view or under a panel.
  private async tilePoint(tile: Tile): Promise<{x: number, y: number}> {
    const view: View = await this.page.evaluate(() => window.micropolisTestHook!.view());
    const canvas = await this.page.locator(CANVAS).boundingBox();
    if (canvas === null) {
      throw new Error("The game canvas is not on screen");
    }

    const x = canvas.x + (tile.x - view.originX) * view.tileWidth + view.tileWidth / 2;
    const y = canvas.y + (tile.y - view.originY) * view.tileWidth + view.tileWidth / 2;

    const onCanvas = await this.page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.id === "MicropolisCanvas",
                                              [x, y]);
    if (!onCanvas) {
      throw new Error(`Tile (${tile.x}, ${tile.y}) is out of view or under a panel`);
    }

    return {x, y};
  }
}
