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

import type { Cars, PaintableMover } from "./cars";
import type { CityDriver } from "./citySource";
import type {
  BudgetForecastAnswer, EvaluationRecord, FireStationReach, StatusRecord, TilePosition, TileReportAnswer,
} from "./protocol";
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
               readonly mapCurrent: boolean, wholeLayerEachFrame: boolean};
  monsterTV: {readonly current: boolean};
  cars: Pick<Cars, "driven" | "moversHeld" | "add" | "addWalks">;
  readonly moversPainted: readonly PaintableMover[];
  readonly frameCounts: FrameCounts;
  notificationBar: {dismiss(): void};
  toolToast: {dismiss(): void};
  statusPanel: {show(status: StatusRecord): void};
  budgetWindow: {write(forecast: BudgetForecastAnswer): void};
  evaluationWindow: {write(record: EvaluationRecord): void};
  queryWindow: {write(report: TileReportAnswer): void};
  readonly hoverTile: {x: number, y: number} | null;
}

export interface Advanced {
  // The year-end budget was paid with the player's values during these steps, and the game opens its review on its
  // next tick. The city stepped on regardless: no window holds it.
  budgetReviewDue: boolean;
}

// The frames the page has gone through since the game started: the turns of its animation loop, and the frames of
// them the map's painter drew, which falls behind the turns when nothing changed or the GPU was still drawing
export interface FrameCounts {
  animated: number;
  painted: number;
}

export interface View {
  // The view's origin: the point of the map at the canvas's top-left corner, in tiles, which may lie between tiles. The
  // map is drawn from it snapped to whole device pixels (drawnOrigin in viewPosition.ts).
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
    // Before anything is sent, so a call refused changes nothing. The server checks both again, with CityTimeModel in
    // Micropolis.Rules.
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

  // Hides the notification bar and the tool toast, which close on wall time, so a screenshot shows the same frame
  // however long the run took. Neither has a control a player could close it with.
  dismissNotification(): void {
    const game = this.attachedGame();
    game.notificationBar.dismiss();
    game.toolToast.dismiss();
  }

  // Shows a status record in the status panel as the city's own would show, for a layout check at a status a city
  // reaches only after long play. It changes no city state, and the city's next status record shows over it.
  showStatus(status: StatusRecord): void {
    this.attachedGame().statusPanel.show(status);
  }

  // Writes an evaluation record into the evaluation window as the city's own would show, for a layout check at an
  // evaluation a city reaches only after long play. It changes no city state, and the window shows the city's own the
  // next time it opens.
  showEvaluation(record: EvaluationRecord): void {
    this.attachedGame().evaluationWindow.write(record);
  }

  // Writes a forecast's figures into the budget window as the answer to its own would show, for a layout check at
  // figures a city reaches only after long play. It changes no city state, and the window's next forecast shows over
  // it.
  showBudgetForecast(forecast: BudgetForecastAnswer): void {
    this.attachedGame().budgetWindow.write(forecast);
  }

  // Writes a tile report into the query window as the city's own would show, for a layout check at a report no tile
  // of a city gives at once. It changes no city state, and the window shows the city's own the next time it opens.
  showTileReport(report: TileReportAnswer): void {
    this.attachedGame().queryWindow.write(report);
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

  // The city's state hash, as the rules compute it
  async stateHash(): Promise<string> {
    this.requireGame();
    return this.attachedDriver().stateHash();
  }

  // What a fire station centred at the station tile would give the target tile, as the rules work it out without
  // changing the city
  async fireStationReach(station: TilePosition, target: TilePosition): Promise<FireStationReach> {
    this.requireGame();
    return this.attachedDriver().fireStationReach(station, target);
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

  // The map tile under the pointer that this player's hover box is drawn at, as of the game's last tick, or null while
  // none is drawn
  hoverTile(): {x: number, y: number} | null {
    return this.attachedGame().hoverTile;
  }

  // How far each car driving has driven, in tiles: none, while the page's clock stands still, as the runner fixes it
  carsDriven(): number[] {
    return this.attachedGame().cars.driven();
  }

  // How many cars, carriages of trains and walkers the page holds, the cars waiting to appear among them, which the cap
  // counts
  moversHeld(): number {
    return this.attachedGame().cars.moversHeld();
  }

  // How many cars and carriages of trains the map's view was last painted with
  carsInView(): number {
    return this.attachedGame().moversPainted.filter(({kind}) => kind !== "walker").length;
  }

  // How many walkers the map's view was last painted with
  walkersInView(): number {
    return this.attachedGame().moversPainted.filter(({kind}) => kind === "walker").length;
  }

  // How many carriages of trains the map's view was last painted with
  trainCarsInView(): number {
    return this.attachedGame().moversPainted.filter(({kind}) => kind === "rail").length;
  }

  // Adds cars to those driving, as the city's trips do, for the render benchmark to drive more of them than a city
  // sends. It changes no city state: cars are the client's alone.
  addCars(...trips: Parameters<Cars["add"]>): void {
    this.attachedGame().cars.add(...trips);
  }

  // Adds walkers to those walking, as the city's walks do, for a test to draw them where it chooses. It changes no
  // city state: walkers are the client's alone.
  addWalks(...walks: Parameters<Cars["addWalks"]>): void {
    this.attachedGame().cars.addWalks(...walks);
  }

  frameCounts(): FrameCounts {
    return {...this.attachedGame().frameCounts};
  }

  // Has every paint of the map draw its layer whole, or only where it changed, as the game does, for the render
  // benchmark to time the drawing of the map itself. It changes nothing a player sees.
  drawWholeLayerEachFrame(whole: boolean): void {
    this.attachedGame().gameCanvas.wholeLayerEachFrame = whole;
  }

  // Whether the map, and the monster TV while it shows, show what they last painted from, drawn to the end. A paint
  // leaves a view as it is while the GPU is still drawing the frame before, so a runner that waits for the paint waits
  // for this too.
  viewsCurrent(): boolean {
    const game = this.attachedGame();
    return game.gameCanvas.mapCurrent && game.monsterTV.current;
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
