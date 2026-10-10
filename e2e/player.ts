/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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

import { type CursorTool, type FireStationReach, NINTHS_PER_SIDE, type WalkwayKind } from "../src/protocol";
import type { Advanced, View } from "../src/testHook";
import { steppedZoom } from "../src/viewPosition";
import type { TilePoint } from "../src/viewPosition";
import { CommandLog, joinSessions, parseLog } from "../test/helpers/commandLog";
import { CITY_LINK, type Forwarded, GameServer } from "./gameServer";

// The runner's player: plays the game in the page through real mouse and keyboard input, while the test hook holds the
// step driver, and moves the city on only through the hook's advance. Every input lands between the same two steps on
// every run, which is what makes a checkpoint reproducible.

export interface Tile {
  x: number;
  y: number;
}

// A save, as the object the game's save file holds, in the parts the runner reads. The map's tiles are raw tile values, row
// by row.
export interface GameSave {
  map: {width: number, height: number, tiles: number[], walkways: {x: number, y: number, ninths: number}[]};
  budget: {totalFunds: number, cityTax: number, policePercent: number, fireEffect: number};
  [key: string]: unknown;
}

// A file the page gave the player, by the name it suggested
export interface DownloadedFile {
  name: string;
  text: string;
}

// A tool the player can hold, as its button's data-tool names it
export type Tool = CursorTool;

export type Difficulty = "Easy" | "Med" | "Hard";

const CANVAS_ID = "MicropolisCanvas";
const CANVAS = `#${CANVAS_ID}`;

// The most drags panTo makes, though the farthest pan across the map at the closest zoom takes fewer
const MAX_PAN_DRAGS = 40;

declare global {
  interface Window {
    // Where the pointer last moved on the page, in CSS pixels, which the runner puts back after a pan
    runnerPointer?: {x: number, y: number};
  }
}

// The cursor over the map, as the player sees it
export async function mapCursor(page: Page): Promise<string> {
  return page.locator(CANVAS).evaluate((canvas) => getComputedStyle(canvas).cursor);
}

// An origin along an axis held within the view's limits there, as the view holds it
export function heldWithin(origin: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, origin));
}

// The most arrow key presses setSlider makes, past the widest slider's steps
const MAX_SLIDER_PRESSES = 200;

// The pixels a notch of a mouse wheel turns, as Chromium reports it
const WHEEL_NOTCH = 100;

export class Player {
  // Steps taken through the hook since the count was last read
  private stepsTaken = 0;
  // The command logs of the sessions ended so far, in order. A reload ends a session: the game it loads starts a log
  // of its own.
  private readonly sessionLogs: CommandLog[] = [];
  // The commands those sessions applied
  private commandsBefore = 0;
  // Whether each page opened holds its driver as it starts
  private holdingAtStart = false;
  // Whether each page opened keeps where the pointer last moved
  private trackingPointer = false;

  private constructor(readonly page: Page, private readonly server: GameServer, private readonly name: string,
                      readonly forwarded: Forwarded) {}

  // A player who plays on the game server under the name, which the page's requests go to, and which the page opens
  // signed in to (GameServer.forward), whose forwarding a spec may watch
  static async onServer(server: GameServer, page: Page, name: string): Promise<Player> {
    return new Player(page, server, name, await server.forward(page, name));
  }

  // Opens the page in debug mode, with more of a query string if given, and holds the driver before the game exists, so
  // it never steps unasked
  async open(query = ""): Promise<void> {
    await this.holdEachPageAtStart();
    await this.trackThePointerOnEachPage();
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

  // Ends the session, then leaves the page and opens it again at the same address, as a player would: the city's link
  // in it joins the city again, which the game server loads from its store, held from its first step. The page opens
  // again only once the player is offline, so the server has unloaded the city: a join before the city was unloaded
  // would find it still loaded, and its log would go on from where the session before began.
  async reloadCity(): Promise<void> {
    await this.endSession();
    const address = this.page.url();
    await this.page.goto("about:blank");
    await this.server.untilOffline(this.name);
    await this.page.goto(address);
    await this.holdOnceHooked();
    await this.waitForGame();
  }

  // Chooses the file with the splash screen's Load
  async loadSaveFile(file: string): Promise<void> {
    const chooser = this.page.waitForEvent("filechooser");
    await this.page.click("#splashLoad");
    await (await chooser).setFiles(file);
  }

  // Waits for the game to show: the city's link in the page's address, as a city on the game server puts it there, and
  // the map
  async waitForGame(): Promise<void> {
    await expect(this.page, "the city's link, of a city on the game server").toHaveURL(CITY_LINK);
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

  // Takes exactly this many steps. A year-end budget review falling due on the way fails the run: with auto-budget on,
  // one falls due only when the city couldn't pay for its services, which turns auto-budget off, and no stage plans
  // for that.
  async advance(steps: number): Promise<void> {
    const advanced = await this.hookAdvance(steps);

    if (advanced.budgetReviewDue) {
      throw new Error(`A year-end budget review fell due within ${steps} steps`);
    }
  }

  // Steps chunk steps at a time until the year-end budget review falls due, then opens it from the Budget button, which
  // marks it due until it opens. The city steps on through the year end, and stops at the end of the chunk it fell in,
  // the same step on every run. Fails if it hasn't fallen due within maxSteps. The notification bar's offer of the
  // review is no way in: whether it shows depends on the news the year end brings.
  async advanceUntilBudgetReview(maxSteps: number, chunk: number): Promise<void> {
    await this.advanceUntilBudgetDue(maxSteps, chunk);
    const budgetButton = this.page.locator("#budgetRequest");
    await budgetButton.click();
    await this.page.locator("#budget").waitFor();
    await expect(budgetButton, "the Budget button, once the budget opened").not.toHaveClass(/\breviewDue\b/);
  }

  // Steps chunk steps at a time until the year-end budget review falls due, and leaves the Budget button marking it due.
  // Fails if it hasn't fallen due within maxSteps.
  async advanceUntilBudgetDue(maxSteps: number, chunk: number): Promise<void> {
    for (let taken = 0; taken < maxSteps; taken += chunk) {
      if ((await this.hookAdvance(chunk)).budgetReviewDue) {
        await expect(this.page.locator("#budgetRequest"), "the Budget button, marking the review due")
          .toHaveClass(/\breviewDue\b/);
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

  // The save the game server's store keeps for the city the page plays, which the Save button writes
  storedSave(): GameSave {
    const city = CITY_LINK.exec(this.page.url())?.[1];
    if (city === undefined) {
      throw new Error("Only a city whose link the page's address holds is kept in the game server's store");
    }

    const stored = this.server.storedCity(city);
    if (stored === null) {
      throw new Error(`The game server's store keeps no city ${city}`);
    }

    return JSON.parse(stored) as GameSave;
  }

  async save(): Promise<GameSave> {
    return await this.page.evaluate(() => window.micropolisTestHook!.save()) as GameSave;
  }

  // The city's state hash, as the game server's rules compute it
  async stateHash(): Promise<string> {
    return this.page.evaluate(() => window.micropolisTestHook!.stateHash());
  }

  // What a fire station centred at the station tile would give the target tile, as the game server's rules work it out
  // without changing the city
  async fireStationReach(station: Tile, target: Tile): Promise<FireStationReach> {
    return this.page.evaluate(({at, to}) => window.micropolisTestHook!.fireStationReach(at, to),
                              {at: station, to: target});
  }

  // The build the page was served from, as the Settings window shows it
  async buildId(): Promise<string> {
    return ((await this.page.locator("#buildDisplay span:not(.hudRowName)").textContent()) ?? "").trim();
  }

  async selectTool(tool: Tool): Promise<void> {
    await this.page.click(`#${tool}Button`);
  }

  // Chooses the kind of walkway the Walkway tool lays, on the strip over the tools that shows while it is held
  async selectWalkwayKind(kind: WalkwayKind): Promise<void> {
    await this.page.click(`#walkwayKinds [data-kind="${kind}"]`);
  }

  // Clicks a tile with the selected tool, with Shift held where erase says, which turns the tool into its eraser. A
  // building's tile is the one in from its top-left corner, where the game's outline puts the pointer.
  async clickTile(tile: Tile, erase = false): Promise<void> {
    const point = await this.tilePoint(tile);
    await this.withShift(erase, () => this.page.mouse.click(point.x, point.y));
    await this.applyInput();
  }

  // Drags the walkway from one ninth to another, on the map's grid of ninths, along a row or column of it, the pointer
  // seen on every ninth on the way, with Shift held where erase says, which erases ninth by ninth
  async dragNinths(from: Tile, to: Tile, erase = false): Promise<void> {
    if (from.x !== to.x && from.y !== to.y) {
      throw new Error("A drag runs along a row or a column");
    }

    const start = await this.ninthPoint(from);
    const end = await this.ninthPoint(to);
    const ninths = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);

    await this.withShift(erase, async () => {
      await this.page.mouse.move(start.x, start.y);
      await this.page.mouse.down();
      await this.page.mouse.move(end.x, end.y, {steps: Math.max(ninths, 1)});
      await this.page.mouse.up();
    });
    await this.applyInput();
  }

  // Does what is given with Shift held down, where held says, and up again after
  private async withShift(held: boolean, act: () => Promise<void>): Promise<void> {
    if (held) {
      await this.page.keyboard.down("Shift");
    }
    try {
      await act();
    } finally {
      if (held) {
        await this.page.keyboard.up("Shift");
      }
    }
  }

  // Drags the selected tool from one tile to another along a row or column. The pointer is seen on every tile on the
  // way, unless moves gives fewer: a fast mouse, seen only that many times between the ends.
  async dragTiles(from: Tile, to: Tile, moves?: number): Promise<void> {
    if (from.x !== to.x && from.y !== to.y) {
      throw new Error("A drag runs along a row or a column");
    }

    const start = await this.tilePoint(from);
    const end = await this.tilePoint(to);
    const tiles = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);

    await this.page.mouse.move(start.x, start.y);
    await this.page.mouse.down();
    await this.page.mouse.move(end.x, end.y, {steps: moves ?? Math.max(tiles, 1)});
    await this.page.mouse.up();
    await this.applyInput();
  }

  // Zooms with the mouse wheel over a tile, a notch a step: up to zoom in, down to zoom out. Fails unless the view
  // comes to the zoom step the notches lead to with the point of the map under the pointer still under it, as far as
  // the view's limits allow: at a limit the view stops, and the point under the pointer moves.
  //
  // With a tool held, it fails too unless the game draws the hover box on the tile before the zoom, and after it on the
  // tile this runner finds under the pointer: the view's origin may lie between tiles after a zoom, and the game must
  // find the tile under the pointer as it draws the map.
  async zoomWithWheel(tile: Tile, steps: number): Promise<void> {
    const point = await this.tilePoint(tile);
    const before = await this.view();
    const expected = steppedZoom(before.tileWidth, steps);
    const toolHeld = await this.page.locator(".toolButton.selected").count() > 0;
    await this.page.mouse.move(point.x, point.y);
    if (toolHeld) {
      await this.expectHoverOn(tile, "the hover box over the tile the wheel zooms over");
    }

    for (let notch = 0; notch < Math.abs(steps); notch++) {
      await this.page.mouse.wheel(0, steps > 0 ? -WHEEL_NOTCH : WHEEL_NOTCH);
    }

    await expect.poll(async () => (await this.view()).tileWidth, "the zoom the wheel led to").toBe(expected);
    const view = await this.view();
    const canvas = await this.canvasBox();
    const {minX, maxX, minY, maxY} = view.limits;
    // The point of the map under the pointer, in tiles from the origin, before and after
    const pointX = (point.x - canvas.x) / before.tileWidth - (point.x - canvas.x) / view.tileWidth;
    const pointY = (point.y - canvas.y) / before.tileWidth - (point.y - canvas.y) / view.tileWidth;
    const origin = "the origin that keeps the point under the pointer, within the limits";
    expect(view.originX, origin).toBeCloseTo(heldWithin(before.originX + pointX, minX, maxX), 9);
    expect(view.originY, origin).toBeCloseTo(heldWithin(before.originY + pointY, minY, maxY), 9);

    if (toolHeld) {
      await this.expectHoverOn(await this.tileUnder(point), "the hover box over the tile under the pointer, zoomed");
    }
  }

  // Fails unless the game comes to draw this player's hover box at the map tile given, the tile under the pointer, or
  // to draw none for null
  async expectHoverOn(tile: Tile | null, description: string): Promise<void> {
    await expect.poll(() => this.page.evaluate(() => window.micropolisTestHook!.hoverTile()), description)
      .toEqual(tile);
  }

  // The map tile under a point of the page, in CSS pixels, worked out from the view as tileCorner works it out
  async tileUnder(point: {x: number, y: number}): Promise<Tile> {
    const drawn = await this.drawnView();
    const canvas = await this.canvasBox();
    return {x: Math.floor((drawn.originX + (point.x - canvas.x) * drawn.pixelRatio) / drawn.tilePixels),
            y: Math.floor((drawn.originY + (point.y - canvas.y) * drawn.pixelRatio) / drawn.tilePixels)};
  }

  // Zooms with the + and - keys, a press a step. Fails unless the view comes to the zoom step the presses lead to.
  async zoomWithKeys(steps: number): Promise<void> {
    const expected = steppedZoom((await this.view()).tileWidth, steps);
    for (let press = 0; press < Math.abs(steps); press++) {
      await this.page.keyboard.press(steps > 0 ? "+" : "-");
    }

    await expect.poll(async () => (await this.view()).tileWidth, "the zoom the keys led to").toBe(expected);
  }

  // A tile's width on the canvas, in CSS pixels, at the zoom the view is at
  async tileWidth(): Promise<number> {
    return (await this.view()).tileWidth;
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

  // Sets a range input in the window showing with the arrow keys, a step a press, as a player can: the window holds the
  // keyboard, so the game leaves the keys to it
  async setSlider(selector: string, value: number): Promise<void> {
    const slider = this.page.locator(selector);
    const read = async () => Number(await slider.inputValue());
    const view = await this.view();

    await slider.focus();
    const key = await read() < value ? "ArrowRight" : "ArrowLeft";
    for (let presses = 0; await read() !== value && presses < MAX_SLIDER_PRESSES; presses++) {
      await this.page.keyboard.press(key);
    }

    expect(await read(), `${selector} set by keyboard`).toBe(value);
    expect(await this.view(), "the view, which the window's keys leave where it was").toEqual(view);
  }

  async saveGame(): Promise<void> {
    await this.page.click("#saveRequest");
    await this.page.click("#saveOK");
  }

  // The city's save as the Download button gives it
  downloadGame(): Promise<DownloadedFile> {
    return this.downloadFrom("#downloadRequest");
  }

  // The file a click on the element gives the player
  async downloadFrom(selector: string): Promise<DownloadedFile> {
    const [download] = await Promise.all([this.page.waitForEvent("download"), this.page.click(selector)]);
    return {name: download.suggestedFilename(), text: readFileSync(await download.path(), "utf8")};
  }

  // Waits for the canvas to be painted as the city now stands: a paint after now, then the map drawn to the end, which
  // a paint leaves for a later one while the GPU is still drawing the frame before
  async settle(): Promise<void> {
    await this.page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    await this.page.waitForFunction(() => window.micropolisTestHook!.viewsCurrent());
  }

  // A screenshot of the page showing nothing but the map's canvas: the panels over it, the marks and the panels' drop
  // shadows hidden for it
  async mapScreenshot(): Promise<Buffer> {
    const style = await this.page.addStyleTag({content: `body * { visibility: hidden; } ${CANVAS} { visibility: visible; }`});
    try {
      await this.settle();
      return await this.page.screenshot();
    } finally {
      await style.evaluate((element) => (element as Element).remove());
    }
  }

  // Dismisses the notification bar and the tool toast through the hook. Each closes on wall time, and has no control a
  // player could close it with: a click on the bar centres the map on the place it names.
  async dismissNotification(): Promise<void> {
    await this.page.evaluate(() => window.micropolisTestHook!.dismissNotification());
  }

  // Applies the commands the input sent at once, rather than on the game's next tick, so the city the runner reads next
  // has them. They apply at the same step either way.
  async applyInput(): Promise<void> {
    await this.page.evaluate(() => window.micropolisTestHook!.applyInput());
  }

  // Downloads the session's command log from the debug window, adding no funds, and keeps it. Fails unless the log
  // holds every command the game applied, one entry each.
  private async endSession(): Promise<void> {
    await this.page.click("#debugRequest");
    await this.page.check("#fundsNo");
    await this.page.check("#logYes");
    const log = parseLog(JSON.parse((await this.downloadFrom("#debugOK")).text));

    const applied = await this.page.evaluate(() => window.micropolisTestHook!.commandsApplied());
    if (log.entries.length !== applied) {
      throw new Error(`The session's log holds ${log.entries.length} commands, but the game applied ${applied}`);
    }

    this.sessionLogs.push(log);
    this.commandsBefore += applied;
  }

  // Waits for the hold the page started with: the hook holds the driver as the page creates its city source
  private async holdOnceHooked(): Promise<void> {
    await this.page.waitForFunction(() => window.micropolisTestHook !== undefined);
    await this.page.evaluate(() => window.micropolisTestHook!.untilHeldAtStart());
  }

  // Has every page opened from now on hold its driver as it starts, before any city it starts or joins takes a step
  private async holdEachPageAtStart(): Promise<void> {
    if (!this.holdingAtStart) {
      await this.page.addInitScript(() => {
        window.micropolisHoldDriverAtStart = true;
      });
      this.holdingAtStart = true;
    }
  }

  // Has every page opened from now on keep where the pointer last moved, which panTo puts it back to
  private async trackThePointerOnEachPage(): Promise<void> {
    if (!this.trackingPointer) {
      await this.page.addInitScript(() => {
        window.addEventListener("mousemove", (e) => {
          window.runnerPointer = {x: e.clientX, y: e.clientY};
        }, {capture: true});
      });
      this.trackingPointer = true;
    }
  }

  // The hook's advance, counting the steps it took even when it fails
  private async hookAdvance(steps: number): Promise<Advanced> {
    const outcome = await this.page.evaluate(async (n) => {
      const hook = window.micropolisTestHook!;
      const before = hook.stepsTaken();

      try {
        return {advanced: await hook.advance(n), steps: hook.stepsTaken() - before, error: null};
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

  // Pans the map with Space and the mouse, as a player does, until every tile given is in view and clear of the panels:
  // to the origin that puts the tiles' middle at the canvas's, on whole tiles, held within the view's limits.
  async showTiles(tiles: Tile[]): Promise<void> {
    const middle = (along: (tile: Tile) => number) =>
      (Math.min(...tiles.map(along)) + Math.max(...tiles.map(along))) / 2;
    const view = await this.view();
    const canvas = await this.canvasBox();
    const {minX, maxX, minY, maxY} = view.limits;
    await this.panTo({
      x: heldWithin(Math.floor(middle((tile) => tile.x) - canvas.width / view.tileWidth / 2), minX, maxX),
      y: heldWithin(Math.floor(middle((tile) => tile.y) - canvas.height / view.tileWidth / 2), minY, maxY),
    });

    const hidden = [];
    for (const tile of tiles) {
      if (await this.onCanvas(tile) === null) {
        hidden.push(tile);
      }
    }

    if (hidden.length > 0) {
      throw new Error(`Panning leaves ${hidden.map((tile) => `(${tile.x}, ${tile.y})`).join(", ")} out of view`);
    }
  }

  // Pans the view with Space and the mouse until its origin is the one given, which is within the view's limits, and
  // fails unless it comes there exactly. A pan keeps the point of the map the pointer grabbed under it, so a drag of
  // the pointer by the distance in CSS pixels from the origin to the one given brings the view there on every run,
  // whatever the timing, unlike a scroll key, which moves the view for as long as it is down. A drag longer than half
  // the canvas goes as several. Once the view is there the pointer goes back where it was, so the hover box shows on
  // the tile under it, as it would had the map moved under a pointer standing still.
  //
  // The browser moves the pointer by whole CSS pixels, so the origin must lie a whole number of them from the one
  // given, unless that one is a limit: a drag rounded up past a limit leaves the view stopped on it.
  private async panTo(stop: TilePoint): Promise<void> {
    const pointer = await this.page.evaluate(() => window.runnerPointer ?? null);
    const canvas = await this.canvasBox();
    const longestDrag = {x: Math.floor(canvas.width / 2), y: Math.floor(canvas.height / 2)};
    const start = await this.view();
    const {minX, maxX, minY, maxY} = start.limits;
    const atLimit = {x: stop.x === minX || stop.x === maxX, y: stop.y === minY || stop.y === maxY};
    for (const axis of ["x", "y"] as const) {
      const pixels = ((axis === "x" ? start.originX : start.originY) - stop[axis]) * start.tileWidth;
      if (!atLimit[axis] && !Number.isInteger(pixels)) {
        throw new Error(`The view's origin is ${pixels} CSS pixels along ${axis} from ${stop[axis]}, which a pan by ` +
                        "the whole pixels the browser moves the pointer by can't reach");
      }
    }

    // The pointer moves against the origin: dragging the map left moves the view right
    const dragAlong = (pixels: number, longest: number) =>
      Math.sign(pixels) * Math.min(Math.ceil(Math.abs(pixels)), longest);
    for (let drags = 0; ; drags++) {
      const {originX, originY, tileWidth} = await this.view();
      const remaining = {x: (originX - stop.x) * tileWidth, y: (originY - stop.y) * tileWidth};
      if (remaining.x === 0 && remaining.y === 0) {
        break;
      }

      if (drags === MAX_PAN_DRAGS) {
        throw new Error(`Panning never brought the view's origin to (${stop.x}, ${stop.y}): after ${drags} drags it ` +
                        `is at (${originX}, ${originY})`);
      }

      await this.dragTheMap({x: dragAlong(remaining.x, longestDrag.x), y: dragAlong(remaining.y, longestDrag.y)});
    }

    if (pointer !== null) {
      await this.page.mouse.move(pointer.x, pointer.y);
      expect(await this.page.evaluate(() => window.runnerPointer), "the pointer, back where it was before the pan")
        .toEqual(pointer);
    }
  }

  // Holds Space and drags the map by the CSS pixels given, from a point of the canvas no panel covers to another. The
  // search runs in the page, so it finds the canvas on top at a point as onCanvas does, by elementFromPoint.
  private async dragTheMap(drag: {x: number, y: number}): Promise<void> {
    const canvas = await this.canvasBox();
    const from = await this.page.evaluate(({box, by, step, id}) => {
      for (let y = box.y + step; y < box.y + box.height; y += step) {
        for (let x = box.x + step; x < box.x + box.width; x += step) {
          if (document.elementFromPoint(x, y)?.id === id && document.elementFromPoint(x + by.x, y + by.y)?.id === id) {
            return {x, y};
          }
        }
      }

      return null;
    }, {box: canvas, by: drag, step: 20, id: CANVAS_ID});
    if (from === null) {
      throw new Error(`No point of the canvas to drag the map by (${drag.x}, ${drag.y}) from`);
    }

    await this.page.mouse.move(from.x, from.y);
    await this.page.keyboard.down("Space");
    try {
      await expect.poll(() => mapCursor(this.page), "the hand over the map while Space is held").toBe("grab");
      await this.page.mouse.down();
      await this.page.mouse.move(from.x + drag.x, from.y + drag.y, {steps: 4});
      await this.page.mouse.up();
    } finally {
      await this.page.keyboard.up("Space");
    }
  }

  // The view's origin and tile width, in CSS pixels, as the hook reports them
  async view(): Promise<View> {
    return await this.page.evaluate(() => window.micropolisTestHook!.view());
  }

  // The tile at the canvas's top-left, as the map is drawn, which may show only a sliver of its square where the
  // origin lies between tiles, and from which the map counts the blocks it is drawn again in (DAMAGE_BLOCK)
  async firstTileInView(): Promise<Tile> {
    const drawn = await this.drawnView();
    return {x: Math.floor(drawn.originX / drawn.tilePixels), y: Math.floor(drawn.originY / drawn.tilePixels)};
  }

  // Each tile whose whole square is on the canvas, with its top-left corner on the canvas, in CSS pixels from the
  // canvas's
  async wholeTilesInView(): Promise<{tile: Tile, x: number, y: number}[]> {
    const canvas = await this.canvasBox();
    const drawn = await this.drawnView();
    // The tiles along an axis whose squares lie whole within the canvas's length, in CSS pixels, from the drawn origin
    const along = (origin: number, length: number) => {
      const first = Math.ceil(origin / drawn.tilePixels);
      const last = Math.floor((origin + length * drawn.pixelRatio) / drawn.tilePixels) - 1;
      return Array.from({length: Math.max(0, last - first + 1)}, (_, i) => first + i);
    };

    const tiles: {tile: Tile, x: number, y: number}[] = [];
    for (const y of along(drawn.originY, canvas.height)) {
      for (const x of along(drawn.originX, canvas.width)) {
        tiles.push({tile: {x, y}, x: (x * drawn.tilePixels - drawn.originX) / drawn.pixelRatio,
                    y: (y * drawn.tilePixels - drawn.originY) / drawn.pixelRatio});
      }
    }

    return tiles;
  }

  // Each tile whose whole square is on the canvas (wholeTilesInView), with the pixel of the page at its middle, in CSS
  // pixels
  async tileMiddlesInView(): Promise<{tile: Tile, middle: {x: number, y: number}}[]> {
    const canvas = await this.canvasBox();
    const {tileWidth} = await this.view();
    return (await this.wholeTilesInView()).map(({tile, x, y}) => ({
      tile, middle: {x: Math.floor(canvas.x + x + tileWidth / 2), y: Math.floor(canvas.y + y + tileWidth / 2)},
    }));
  }

  // The view as the map is drawn: the view's origin in device pixels of the map at the zoom, rounded to whole ones, as
  // the game draws the map from it, the device pixels a tile is drawn and the device pixels to the CSS pixel. Worked
  // out here from the origin, the tile width and the screen, not taken from the game's drawing, which is under test.
  private async drawnView(): Promise<{originX: number, originY: number, tilePixels: number, pixelRatio: number}> {
    const view = await this.view();
    const pixelRatio = await this.page.evaluate(() => window.devicePixelRatio || 1);
    const tilePixels = view.tileWidth * pixelRatio;
    return {originX: Math.round(view.originX * tilePixels), originY: Math.round(view.originY * tilePixels), tilePixels,
            pixelRatio};
  }

  // The map's canvas on the page, in CSS pixels
  async canvasBox(): Promise<{x: number, y: number, width: number, height: number}> {
    const canvas = await this.page.locator(CANVAS).boundingBox();
    if (canvas === null) {
      throw new Error("The game canvas is not on screen");
    }

    return canvas;
  }

  // The top-left corner of a tile on the page, in CSS pixels, worked out from the view's origin and tile width rather
  // than from the game's own mapping of pointer to tile, which is under test. The tile may be out of view.
  async tileCorner(tile: Tile): Promise<{x: number, y: number}> {
    const drawn = await this.drawnView();
    const canvas = await this.canvasBox();

    return {x: canvas.x + (tile.x * drawn.tilePixels - drawn.originX) / drawn.pixelRatio,
            y: canvas.y + (tile.y * drawn.tilePixels - drawn.originY) / drawn.pixelRatio};
  }

  // The centre of a tile on the screen, or the point the fractions of its width across and down give, or null when the
  // tile is out of view or under a panel
  private async onCanvas(tile: Tile, within = {x: 0.5, y: 0.5}): Promise<{x: number, y: number} | null> {
    const {tileWidth} = await this.view();
    const corner = await this.tileCorner(tile);

    const x = corner.x + tileWidth * within.x;
    const y = corner.y + tileWidth * within.y;

    const shown = await this.page.evaluate(({px, py, id}) => document.elementFromPoint(px, py)?.id === id,
                                           {px: x, py: y, id: CANVAS_ID});
    return shown ? {x, y} : null;
  }

  private async tilePoint(tile: Tile): Promise<{x: number, y: number}> {
    const point = await this.onCanvas(tile);
    if (point === null) {
      throw new Error(`Tile (${tile.x}, ${tile.y}) is out of view or under a panel`);
    }

    return point;
  }

  // The centre of a ninth of the map's grid of them on the screen
  private async ninthPoint(ninth: Tile): Promise<{x: number, y: number}> {
    const tile = {x: Math.floor(ninth.x / NINTHS_PER_SIDE), y: Math.floor(ninth.y / NINTHS_PER_SIDE)};
    const point = await this.onCanvas(tile, {x: (ninth.x % NINTHS_PER_SIDE + 0.5) / NINTHS_PER_SIDE,
                                             y: (ninth.y % NINTHS_PER_SIDE + 0.5) / NINTHS_PER_SIDE});
    if (point === null) {
      throw new Error(`Ninth (${ninth.x}, ${ninth.y}) is out of view or under a panel`);
    }

    return point;
  }
}

// The player a spec's pages play as when the spec has no need of another
export const TESTER = "Tester";

// A player of a new Easy city of the name on the seed's map, on the game server, with the notification bar dismissed.
// The driver is held from the start, so the map is the seed's, with no sprites, until the player moves the city on.
export async function startGame(server: GameServer, page: Page, seed: number, name: string): Promise<Player> {
  const player = await Player.onServer(server, page, TESTER);
  await player.startNewGame(seed, name, "Easy");
  await player.dismissNotification();
  return player;
}
