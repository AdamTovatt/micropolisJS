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

import type { CityStatus } from "./cityStatus";
import { checkStepCount, ClockedSimulation, takeSteps } from "./cityTimeModel";
import type { AdvanceResult, CityStart, SessionLog, StartedCity } from "./citySource";
import { CommandRecorder, LogStart } from "./commandLog";
import { CommandQueue, CommandTarget } from "./commandQueue";
import { MapGenerator } from "./mapGenerator.js";
import * as Messages from "./messages";
import {
  BudgetRecord, CommandResult, DemandMessage, EvaluationRecord, NewsMessage, OverlayLayer, PlayerId, QueryAnswer,
  SettingsRecord, SPEEDS, SpriteView, StateMessage, StatusRecord, TileChange,
} from "./protocol";
import { answerQueryWithoutCity } from "./queries";
import { Random } from "./random";
import { SavedGame, SaveFormat } from "./savedGame";
import { Simulation } from "./simulation.js";
import { plainSavedState, Saveable } from "./stateHash";
import { StepDriver } from "./stepDriver";

// The simulation's side of a city source in the browser, wherever the source runs it. It owns the city: the
// simulation, the queue its commands apply through, the session's command log, and the step driver that steps it in
// real time. It runs its own loop, and hands the state messages each turn produced to publish, after the turn's steps.

// What the host reads of the simulation, which is JavaScript, so its reader declares the shape
interface HostedSimulation extends CommandTarget, ClockedSimulation, Saveable {
  readonly seed: number;
  readonly spriteManager: {getSpriteList(): HostedSprite[]};
  getMap(): HostedMap;
  getDate(): {month: number, year: number};
  isPaused(): boolean;
  answerQuery(query: unknown): QueryAnswer;
  evaluationRecord(): EvaluationRecord;
  budgetRecord(): BudgetRecord;
  settingsRecord(): SettingsRecord;
  addEventListener(event: string, listener: (value: never) => void): void;
}

interface HostedMap {
  readonly width: number;
  readonly height: number;
  getTileValuesForPainting(x: number, y: number, w: number, h: number, result: number[]): number[];
}

// A sprite as the simulation keeps it: its position, and the type's drawing offset from it (baseSprite.js)
interface HostedSprite {
  readonly type: number;
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly xOffset: number;
  readonly yOffset: number;
  readonly width: number;
}

// The news the simulation sends: where it happened is a place, or a sprite to follow
interface SimulationNews {
  subject: string;
  data?: {x: number, y: number, showable?: true, trackable?: true, sprite?: {type: number}};
}

// The news as the client reads it: a sprite to follow is named by its type, of which the map holds at most one
export function newsMessage(news: SimulationNews): NewsMessage {
  const data = news.data;
  if (data === undefined) {
    return {type: "news", subject: news.subject};
  }

  if (data.trackable) {
    return {type: "news", subject: news.subject, data: {x: data.x, y: data.y, trackable: true, sprite: data.sprite!.type}};
  }

  if (data.showable) {
    return {type: "news", subject: news.subject, data: {x: data.x, y: data.y, showable: true}};
  }

  return {type: "news", subject: news.subject, data: {x: data.x, y: data.y}};
}

// The state the host sent last, of the messages it sends only when they change, as JSON text
type Sent = Partial<Record<"sprites" | "date" | "evaluation" | "budget" | "settings", string>>;

// A city the host runs, and what it has sent of it
class HostedCity {
  readonly queue: CommandQueue;
  readonly recorder: CommandRecorder;
  // The year-end budget reviews that have fallen due since the city started
  budgetReviewsDue = 0;

  // The map's raw values as last sent, row by row, or null before the whole map is sent
  private tiles: number[] | null = null;
  private readonly buffer: number[] = [];
  private readonly sent: Sent = {};
  // The latest status record and demand since the last messages, which replace any before them
  private status: StatusRecord | null = null;
  private demand: DemandMessage | null = null;
  // The events since the last messages, in the order the simulation sent them: one overlay message per layer
  private events: StateMessage[] = [];

  constructor(readonly name: string, readonly simulation: HostedSimulation, logStart: LogStart) {
    this.recorder = new CommandRecorder(simulation, logStart);
    this.queue = new CommandQueue(simulation, this.recorder);

    simulation.addEventListener(Messages.FRONT_END_MESSAGE, (news: SimulationNews) => {
      this.events.push(newsMessage(news));
    });
    simulation.addEventListener(Messages.COMMAND_RESULT, (result: CommandResult) => {
      this.events.push({type: "commandResult", result: {...result}});
    });
    simulation.addEventListener(Messages.BUDGET_REVIEW_DUE, () => {
      this.budgetReviewsDue++;
      this.events.push({type: "budgetReviewDue"});
    });
    simulation.addEventListener(Messages.OVERLAY_UPDATED, ({layer}: {layer: OverlayLayer}) => {
      if (!this.events.some((event) => event.type === "overlayUpdated" && event.layer === layer)) {
        this.events.push({type: "overlayUpdated", layer});
      }
    });
    simulation.addEventListener(Messages.CITY_STATUS_UPDATED, (status: CityStatus) => {
      this.status = {type: "status", ...status};
    });
    simulation.addEventListener(Messages.VALVES_UPDATED,
                                (valves: {residential: number, commercial: number, industrial: number}) => {
      this.demand = {type: "demand", residential: valves.residential, commercial: valves.commercial,
                     industrial: valves.industrial};
    });
  }

  // The state messages since the last call: the whole map the first time, then the tiles that changed; the sprites,
  // date and records that differ from those sent last; then the status and demand published since, and the events in
  // the order they came
  messages(): StateMessage[] {
    const simulation = this.simulation;
    const messages: StateMessage[] = [];

    const tiles = this.tileMessage();
    if (tiles !== null) {
      messages.push(tiles);
    }

    const sprites: SpriteView[] = simulation.spriteManager.getSpriteList().map((sprite) => ({
      type: sprite.type, frame: sprite.frame, x: sprite.x + sprite.xOffset, y: sprite.y + sprite.yOffset,
      width: sprite.width,
    }));
    const date = simulation.getDate();
    const changing: StateMessage[] = [
      {type: "sprites", sprites},
      {type: "date", month: date.month, year: date.year},
      simulation.evaluationRecord(),
      simulation.budgetRecord(),
      simulation.settingsRecord(),
    ];
    changing.forEach((message) => {
      const type = message.type as keyof Sent;
      const text = JSON.stringify(message);
      if (this.sent[type] !== text) {
        this.sent[type] = text;
        messages.push(message);
      }
    });

    if (this.status !== null) {
      messages.push(this.status);
      this.status = null;
    }

    if (this.demand !== null) {
      messages.push(this.demand);
      this.demand = null;
    }

    messages.push(...this.events);
    this.events = [];
    return messages;
  }

  // The whole map, the first time, and after that the tiles whose raw values changed, or null for none
  private tileMessage(): StateMessage | null {
    const map = this.simulation.getMap();
    const values = map.getTileValuesForPainting(0, 0, map.width, map.height, this.buffer);

    if (this.tiles === null) {
      this.tiles = [...values];
      return {type: "map", width: map.width, height: map.height, tiles: [...values]};
    }

    const changes: TileChange[] = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i] !== this.tiles[i]) {
        this.tiles[i] = values[i];
        changes.push({x: i % map.width, y: Math.floor(i / map.width), value: values[i]});
      }
    }

    return changes.length === 0 ? null : {type: "tiles", changes};
  }
}

// The city a start describes, under its name, and the log its session starts from
function startCity(start: CityStart): {name: string, simulation: HostedSimulation, logStart: LogStart} {
  if ("seed" in start) {
    const map = MapGenerator(Random.mapStream(start.seed));
    const simulation: HostedSimulation = new Simulation(map, start.level, SPEEDS.medium, start.seed);
    return {name: start.name, simulation, logStart: {seed: start.seed, level: start.level}};
  }

  const savedGame: SavedGame = SaveFormat.parse(start.save);
  if (typeof savedGame.name !== "string") {
    throw new Error("The save names no city");
  }

  const simulation: HostedSimulation = Simulation.fromSave(savedGame);
  // The session's log starts from the city as loaded
  return {name: savedGame.name, simulation, logStart: {save: plainSavedState(simulation)}};
}

// What drives the host's loop: the time now, in milliseconds, and a way to run a callback again soon. The browser's
// is performance.now and setTimeout; a test's runs the loop by hand.
export interface Ticker {
  now(): number;
  later(callback: () => void): void;
}

// The browser's ticker, in the page or in a worker
export function browserTicker(): Ticker {
  return {now: () => performance.now(), later: (callback) => setTimeout(callback, 0)};
}

export class CityHost {
  private city: HostedCity | null = null;
  private readonly driver = new StepDriver();
  private viewerVisible = true;

  // publish takes each non-empty list of state messages, in the order the host produced them. The ticker runs the
  // host's loop, from the first city's start on.
  constructor(private readonly publish: (messages: StateMessage[]) => void, private readonly ticker: Ticker) {}

  // Starts the city, replacing any before it, and publishes its state, the whole map included. A save that won't load
  // throws, and leaves the city before it.
  start(start: CityStart): StartedCity {
    const {name, simulation, logStart} = startCity(start);

    const first = this.city === null;
    this.city = new HostedCity(name, simulation, logStart);
    // A held driver stays held, so the end-to-end runner decides when the new city steps
    this.driver.idle();
    this.sendState();

    if (first) {
      this.ticker.later(this.loop);
    }

    return {name, seed: simulation.seed};
  }

  send(player: PlayerId, command: unknown): void {
    this.requireCity().queue.send(player, command);
  }

  ask(query: unknown): QueryAnswer {
    return this.city === null ? answerQueryWithoutCity(query) : this.city.simulation.answerQuery(query);
  }

  setViewerVisible(visible: boolean): void {
    this.viewerVisible = visible;
  }

  // The saved game's text: the city's name beside what the simulation saves, stamped with the save's version
  save(): string {
    const city = this.requireCity();
    const saveData = {name: city.name};
    city.simulation.save(saveData);
    return SaveFormat.serialise(saveData);
  }

  async commandLog(): Promise<SessionLog> {
    const city = this.requireCity();
    const step = city.queue.stepIndex;
    const recorded = await city.recorder.log();
    return {log: recorded.log, step, unhashed: recorded.unhashed === null ? null : recorded.unhashed.message};
  }

  // One turn of the host's loop, which runs for as long as the ticker calls back: the commands sent since the last turn,
  // then the steps due by now, then the state they changed. A held driver leaves the commands and the steps to the
  // end-to-end runner.
  private readonly loop = (): void => {
    this.turn(this.ticker.now());
    this.ticker.later(this.loop);
  };

  private turn(now: number): void {
    const city = this.requireCity();
    let changed = false;
    if (!this.driver.isHeld()) {
      changed = city.queue.applyCommands().length > 0;
    }

    this.driver.run(now, () => this.notSteppingReason() === null, () => {
      city.queue.step();
      changed = true;
    });

    if (changed) {
      this.sendState();
    }
  }

  // The end-to-end runner's channel (CityDriver in citySource.ts)

  hold(): void {
    this.driver.hold();
  }

  release(): void {
    this.driver.release();
  }

  flush(): void {
    this.requireCity().queue.applyCommands();
    this.sendState();
  }

  advance(steps: number): AdvanceResult {
    let taken = 0;
    let budgetReviewDue = false;

    try {
      const city = this.requireCity();
      // Before anything is applied, so a call refused changes nothing
      checkStepCount(steps);

      if (!this.driver.isHeld()) {
        throw new Error("Advance needs the driver held, or the driver's steps would land at times of its own");
      }

      // Before the check that the city steps: the commands may be the Pause button's
      city.queue.applyCommands();

      const notStepping = this.notSteppingReason();
      if (notStepping !== null) {
        throw new Error(`The city is not stepping: ${notStepping}`);
      }

      const reviewsBefore = city.budgetReviewsDue;
      try {
        takeSteps(city.simulation, steps, () => {
          city.queue.step();
          taken++;
        });
      } finally {
        budgetReviewDue = city.budgetReviewsDue > reviewsBefore;
      }

      return {steps: taken, budgetReviewDue, error: null};
    } catch (e) {
      return {steps: taken, budgetReviewDue, error: e instanceof Error ? e.message : String(e)};
    } finally {
      if (this.city !== null) {
        this.sendState();
      }
    }
  }

  cityTime(): number {
    return this.requireCity().simulation._cityTime;
  }

  // Why the city isn't stepping, or null when it is. It steps unless it is paused, or the player can't see it: a city
  // no one watches waits rather than running on unseen.
  private notSteppingReason(): string | null {
    if (this.requireCity().simulation.isPaused()) {
      return "it is paused";
    }

    if (!this.viewerVisible) {
      return "the player can't see it";
    }

    return null;
  }

  private sendState(): void {
    const messages = this.requireCity().messages();
    if (messages.length > 0) {
      this.publish(messages);
    }
  }

  private requireCity(): HostedCity {
    if (this.city === null) {
      throw new Error("No city has started");
    }

    return this.city;
  }
}
