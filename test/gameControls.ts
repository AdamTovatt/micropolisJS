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

import type { BudgetChoice } from "../src/budgetWindow";
import { CAR_SHARE_STEPS } from "../src/carShare";
import type { CarShareStep } from "../src/carShare";
import type { MessageOf } from "../src/cityState";
import type { DebugAction } from "../src/debugWindow";
import { Emitter } from "../src/emitter";
import type { MouseOutline } from "../src/gameCanvas";
import { ControlParts, ControlPlayers, ControlView, GameControls } from "../src/gameControls";
import type { ChosenTool, InputEvents, PanState } from "../src/inputStatus";
import {
  type BudgetRecord, type Command, type CursorTool, type DisasterKind, type EvaluationRecord, type Query,
  type QueryAnswer, type SessionLog, type SettingsRecord, SPEEDS, type StateMessageType, type TileReportAnswer,
} from "../src/protocol";
import type { ScreenshotArea } from "../src/screenshotWindow";
import type { ClientSettings, SettingsChoice } from "../src/settingsWindow";
import * as UiMessages from "../src/uiMessages";
import type { PixelPoint, TilePoint } from "../src/viewPosition";
import { WindowManager } from "../src/windowManager";
import { FakeWindow } from "./helpers/fakeWindow";

// The CSS pixels a tile is drawn on the fake view, which shows the map from its top-left, and the canvas's size
const TILE = 16;
const CANVAS_WIDTH = 640;
// Two steps of the Cars slider
const TENTH = CAR_SHARE_STEPS[1];
const HALF = CAR_SHARE_STEPS[3];
const CANVAS_HEIGHT = 480;

// The map's size in tiles, which is smaller than the canvas, so the view shows a margin past it
const MAP_WIDTH = 30;
const MAP_HEIGHT = 20;

const ROAD: ChosenTool = {name: "road", width: 1};
const RESIDENTIAL: ChosenTool = {name: "residential", width: 3};
const QUERY: ChosenTool = {name: "query", width: 1};
const WALKWAY: ChosenTool = {name: "walkway", width: 1};
// A ninth of a tile, in CSS pixels
const NINTH = TILE / 3;

// The player's input, as the test makes it: the tool, the pointer and the pan, the keys pressed, and the events the
// controls hear
class FakeInput extends Emitter<InputEvents> {
    tool: ChosenTool | null = null;
    erasing = false;
    pointer: PixelPoint | null = null;
    pan: PanState = "free";
    scroll: TilePoint = {x: 0, y: 0};
    escape = false;

    announce<Event extends keyof InputEvents>(event: Event,
                                              ...value: undefined extends InputEvents[Event] ? [] : [InputEvents[Event]]):
        void {
        this.emit(event, ...value);
    }

    takeScroll(): TilePoint {
        const scroll = this.scroll;
        this.scroll = {x: 0, y: 0};
        return scroll;
    }

    takeEscape(): boolean {
        const pressed = this.escape;
        this.escape = false;
        return pressed;
    }

    clearTool(): void {
        this.tool = null;
    }

    toolColourOf(tool: CursorTool): string {
        return `${tool} colour`;
    }
}

// The map's view, drawn from its top-left at TILE pixels a tile, which counts the pixels it turned into tiles
class FakeView implements ControlView {
    scrolled: TilePoint[] = [];
    zooms: {steps: number, point: PixelPoint | null}[] = [];
    conversions = 0;

    scrollBy(x: number, y: number): void {
        this.scrolled.push({x, y});
    }

    zoomBy(steps: number, point: PixelPoint | null): void {
        this.zooms.push({steps, point});
    }

    tileOnCanvasUnder(x: number, y: number, cellsPerTile: number): TilePoint | null {
        this.conversions++;
        if (x >= CANVAS_WIDTH || y >= CANVAS_HEIGHT) {
            return null;
        }

        return {x: Math.floor(x * cellsPerTile / TILE), y: Math.floor(y * cellsPerTile / TILE)};
    }

    screenshotVisible(): string {
        return "data:visible";
    }

    screenshotMap(): string {
        return "data:all";
    }
}

// What this player told the others of their hover box
interface Reported {
    tool: CursorTool | null;
    size: number;
    tile: TilePoint | null;
}

// The other players, one of whom hovers a road at (2, 3)
class FakePlayers implements ControlPlayers {
    reported: Reported[] = [];

    reportCursor(tool: CursorTool | null, size: number, tile: TilePoint | null): void {
        this.reported.push({tool, size, tile});
    }

    outlines(toolColour: (tool: CursorTool) => string): MouseOutline[] {
        return [{x: 2, y: 3, width: 1, height: 1, colour: toolColour("road"), label: {name: "Ann", colour: "#123456"}}];
    }

    get last(): Reported {
        return this.reported[this.reported.length - 1];
    }
}

const BUDGET: BudgetRecord = {
    type: "budget", taxRate: 7, taxesCollected: 0, funds: 20000,
    funding: {road: 1, fire: 1, police: 1}, maintenance: {road: 0, fire: 0, police: 0},
};

const EVALUATION = {type: "evaluation", approval: 50} as EvaluationRecord;

const SETTINGS: SettingsRecord = {type: "settings", autoBudget: true, disasters: true, speed: SPEEDS.medium};

const LOG: SessionLog = {step: 120, log: {entries: []}};

// The city's records the windows open on, which a test may change as the city runs behind a window
class FakeCity {
    records: Partial<Record<StateMessageType, unknown>> = {budget: BUDGET, evaluation: EVALUATION, settings: SETTINGS};

    readonly map = {testBounds: (x: number, y: number) => x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT};

    current<T extends StateMessageType>(type: T): MessageOf<T> {
        return this.records[type] as MessageOf<T>;
    }
}

// A source that keeps the commands sent and the queries asked, and whose save, download and log the test settles
class FakeSource {
    sent: Command[] = [];
    asked: Query[] = [];
    held = false;
    saves = 0;
    saving: Promise<void> = Promise.resolve();
    downloads = 0;
    downloaded: Promise<string> = Promise.resolve("save text");
    log: Promise<SessionLog> = Promise.resolve(LOG);

    readonly driver = {isHeld: () => this.held};

    send(command: Command): void {
        this.sent.push(command);
    }

    ask(query: Query, answer: (answer: QueryAnswer) => void): void {
        this.asked.push(query);
        if (query.type === "tileReport") {
            answer({type: "tileReport", x: query.x, y: query.y} as TileReportAnswer);
        }
    }

    save(): Promise<void> {
        this.saves++;
        return this.saving;
    }

    download(): Promise<string> {
        this.downloads++;
        return this.downloaded;
    }

    commandLog(): Promise<SessionLog> {
        return this.log;
    }
}

function setUp() {
    const input = new FakeInput();
    const view = new FakeView();
    const budget = new FakeWindow<[BudgetRecord], BudgetChoice | null>(null);
    const city = new FakeCity();
    const reviewMarker = {lit: false, setLit(lit: boolean) { this.lit = lit; }};
    const windows = new WindowManager();
    const gameWindows = {
        budget,
        evaluation: new FakeWindow<[EvaluationRecord], void>(undefined),
        disaster: new FakeWindow<[], DisasterKind | null>(null),
        debug: new FakeWindow<[], DebugAction[]>([]),
        settings: new FakeWindow<[SettingsRecord, ClientSettings], SettingsChoice | null>(null),
        screenshot: new FakeWindow<[], ScreenshotArea | null>(null),
        screenshotLink: new FakeWindow<[string], void>(undefined),
        save: new FakeWindow<[], void>(undefined),
        touchWarning: new FakeWindow<[], void>(undefined),
        query: new FakeWindow<[TileReportAnswer], void>(undefined),
    };
    const source = new FakeSource();
    const players = new FakePlayers();
    const page = {alerts: [] as string[], files: [] as {fileName: string, text: string}[], pauses: 0, minimapToggles: 0,
                  alert(message: string) { this.alerts.push(message); },
                  saveFile(fileName: string, text: string) { this.files.push({fileName, text}); },
                  togglePause() { this.pauses++; },
                  toggleMinimap() { this.minimapToggles++; }};
    const autoBulldoze = {on: true, isOn() { return this.on; }, set(on: boolean) { this.on = on; }};
    const carShare = {kept: HALF, step() { return this.kept; }, set(step: CarShareStep) { this.kept = step; }};

    const parts: ControlParts = {input, view, windows, gameWindows, reviewMarker, source, city, players, page,
                                 autoBulldoze, carShare, seed: 1234, saveFileName: "Town.json"};
    const controls = new GameControls(parts);
    controls.setViewerVisible(true);

    return {controls, input, view, windows, budget, gameWindows, reviewMarker, source, city, players, page,
            autoBulldoze, carShare};
}

// Lets the choices of the windows closed, and the source's promises settled, be acted on
function settled(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("the game's controls", () => {

    describe("hover box", () => {

        it("is drawn at the tile under the pointer, in the colour of the tool chosen, over the others' boxes", () => {
            const {controls, input} = setUp();
            input.tool = RESIDENTIAL;
            input.pointer = {x: 5 * TILE + 3, y: 7 * TILE + 15};

            controls.tick(0);

            expect(controls.hoverTile).toEqual({x: 5, y: 7});
            expect(controls.outlines()).toEqual([
                {x: 2, y: 3, width: 1, height: 1, colour: "road colour", label: {name: "Ann", colour: "#123456"}},
                {x: 5, y: 7, width: 3, height: 3, colour: "residential colour", label: null},
            ]);
        });

        it("is told to the other players at the tile it is drawn at, with the tool and its size", () => {
            const {controls, input, players} = setUp();
            input.tool = RESIDENTIAL;
            input.pointer = {x: 5 * TILE + 3, y: 7 * TILE + 15};

            controls.tick(0);

            expect(players.last).toEqual({tool: "residential", size: 3, tile: {x: 5, y: 7}});
        });

        // The count is the requirement itself, which CLAUDE.md states: one conversion a tick serves both boxes
        it("is worked out by one conversion of the pointer each tick, for the box drawn and the box told alike", () => {
            const {controls, input, view} = setUp();
            input.tool = ROAD;
            input.pointer = {x: 40, y: 40};

            controls.tick(0);

            expect(view.conversions).toBe(1);
        });

        it("follows the pointer from tick to tick", () => {
            const {controls, input, players} = setUp();
            input.tool = ROAD;
            input.pointer = {x: 40, y: 40};
            controls.tick(0);

            input.pointer = {x: 100, y: 40};
            controls.tick(1);

            expect(controls.hoverTile).toEqual({x: 6, y: 2});
            expect(players.last.tile).toEqual({x: 6, y: 2});
        });

        it.each<[string, (parts: ReturnType<typeof setUp>) => void]>([
            ["no tool is chosen", ({input}) => {
                input.tool = null;
            }],
            ["the pointer is off the canvas", ({input}) => {
                input.pointer = null;
            }],
            ["the pointer is past the canvas's right edge", ({input}) => {
                input.pointer = {x: CANVAS_WIDTH, y: 40};
            }],
            ["Space readies a pan", ({input}) => {
                input.pan = "ready";
            }],
            ["a pan holds the map", ({input}) => {
                input.pan = "held";
            }],
            ["a window holds the mouse", ({windows, gameWindows}) => {
                expect(windows.open(gameWindows.save)).not.toBeNull();
            }],
        ])("is neither drawn nor told while %s", (_, change) => {
            const parts = setUp();
            const {controls, input, players} = parts;
            input.tool = ROAD;
            input.pointer = {x: 40, y: 40};
            change(parts);

            controls.tick(0);

            expect(controls.hoverTile).toBeNull();
            expect(controls.outlines()).toHaveLength(1);
            expect(players.last.tile).toBeNull();
        });

        it("is drawn but not told while the player can't see the city", () => {
            const {controls, input, players} = setUp();
            input.tool = ROAD;
            input.pointer = {x: 40, y: 40};
            controls.setViewerVisible(false);

            controls.tick(0);

            expect(controls.hoverTile).toEqual({x: 2, y: 2});
            expect(players.last).toEqual({tool: "road", size: 1, tile: null});
        });
    });

    describe("keyboard", () => {

        it("scrolls the view by the tiles the keys held owe, a fraction of a tile included", () => {
            const {controls, input, view} = setUp();
            input.scroll = {x: 2.3125, y: -0.75};

            controls.tick(0);

            expect(view.scrolled).toEqual([{x: 2.3125, y: -0.75}]);
        });

        it("clears the tool with Escape while no window shows", () => {
            const {controls, input} = setUp();
            input.tool = ROAD;
            input.escape = true;

            controls.tick(0);

            expect(input.tool).toBeNull();
        });

        it("closes the window showing with Escape, as cancelled, keeping the tool", async () => {
            const {controls, input, windows, gameWindows, source} = setUp();
            input.tool = ROAD;
            input.announce(UiMessages.DISASTER_REQUESTED);
            input.escape = true;

            controls.tick(0);
            await settled();

            expect(gameWindows.disaster.showing).toBe(false);
            expect(windows.holdsInput()).toBe(false);
            expect(input.tool).toBe(ROAD);
            expect(source.sent).toEqual([]);
        });

        it("zooms the view around the point asked", () => {
            const {input, view} = setUp();

            input.announce(UiMessages.ZOOM_REQUESTED, {steps: 1, point: {x: 10, y: 20}});

            expect(view.zooms).toEqual([{steps: 1, point: {x: 10, y: 20}}]);
        });

        it("holds back a zoom while a window holds the input", () => {
            const {input, view} = setUp();
            input.announce(UiMessages.EVAL_REQUESTED);

            input.announce(UiMessages.ZOOM_REQUESTED, {steps: 1, point: null});

            expect(view.zooms).toEqual([]);
        });

        it("pauses and folds the minimap as asked", () => {
            const {input, page} = setUp();

            input.announce(UiMessages.PAUSE_REQUESTED);
            input.announce(UiMessages.MINIMAP_TOGGLE_REQUESTED);

            expect([page.pauses, page.minimapToggles]).toEqual([1, 1]);
        });
    });

    describe("tool", () => {

        it("sends the tiles a drag reached as one tool command at the next tick", () => {
            const {controls, input, source} = setUp();
            input.tool = ROAD;

            input.announce(UiMessages.TOOL_CLICKED, {x: 1 * TILE, y: 1 * TILE, start: true, erase: false});
            input.announce(UiMessages.TOOL_CLICKED, {x: 3 * TILE, y: 1 * TILE, start: false, erase: false});
            controls.tick(0);

            expect(source.sent).toEqual([{type: "tool", tool: "road", path: [{x: 1, y: 1}, {x: 2, y: 1}, {x: 3, y: 1}],
                                          autoBulldoze: true}]);
        });

        it("leaves the paths to the end-to-end runner while it holds the driver", () => {
            const {controls, input, source} = setUp();
            input.tool = ROAD;
            source.held = true;
            input.announce(UiMessages.TOOL_CLICKED, {x: TILE, y: TILE, start: true, erase: false});

            controls.tick(0);
            expect(source.sent).toEqual([]);
            controls.sendToolPaths();

            expect(source.sent).toEqual([{type: "tool", tool: "road", path: [{x: 1, y: 1}], autoBulldoze: true}]);
        });

        it("sends the auto-bulldoze preference with each tool command", () => {
            const {controls, input, source, autoBulldoze} = setUp();
            input.tool = RESIDENTIAL;
            autoBulldoze.on = false;

            input.announce(UiMessages.TOOL_CLICKED, {x: 5 * TILE, y: 5 * TILE, start: true, erase: false});
            controls.tick(0);

            expect(source.sent).toEqual([{type: "tool", tool: "residential", path: [{x: 5, y: 5}],
                                          autoBulldoze: false}]);
        });

        it("starts a drag again from the next tile after one past the canvas's edge", () => {
            const {controls, input, source} = setUp();
            input.tool = ROAD;

            input.announce(UiMessages.TOOL_CLICKED, {x: 1 * TILE, y: TILE, start: true, erase: false});
            input.announce(UiMessages.TOOL_CLICKED, {x: CANVAS_WIDTH, y: TILE, start: false, erase: false});
            input.announce(UiMessages.TOOL_CLICKED, {x: 3 * TILE, y: TILE, start: false, erase: false});
            controls.tick(0);

            expect(source.sent.map((command) => command.type === "tool" && command.path))
                .toEqual([[{x: 1, y: 1}], [{x: 3, y: 1}]]);
        });

        // A place off the map would have the city reject the whole path, the tiles on the map with it
        it.each([
            [ROAD, MAP_WIDTH - 2, MAP_WIDTH - 1, 1],
            [WALKWAY, 3 * MAP_WIDTH - 2, 3 * MAP_WIDTH - 1, 3],
        ] as const)("cuts a %j drag at the map's edge, the margin past it sending nothing", (tool, first, last, cells) => {
            const {controls, input, source} = setUp();
            input.tool = tool;
            const y = TILE / cells / 2;

            input.announce(UiMessages.TOOL_CLICKED, {x: (first + 0.5) * TILE / cells, y, start: true, erase: false});
            input.announce(UiMessages.TOOL_CLICKED, {x: (last + 2.5) * TILE / cells, y, start: false, erase: false});
            input.announce(UiMessages.TOOL_CLICKED, {x: (last + 0.5) * TILE / cells, y, start: false, erase: false});
            controls.tick(0);

            expect(source.sent.map((command) => "path" in command && command.path))
                .toEqual([[{x: first, y: 0}], [{x: last, y: 0}]]);
        });

        it("sends the ninths a walkway's drag reached as one walkway command, on the map's grid of ninths", () => {
            const {controls, input, source} = setUp();
            input.tool = WALKWAY;

            input.announce(UiMessages.TOOL_CLICKED, {x: 4.5 * NINTH, y: 7.5 * NINTH, start: true, erase: false});
            input.announce(UiMessages.TOOL_CLICKED, {x: 6.5 * NINTH, y: 7.5 * NINTH, start: false, erase: false});
            controls.tick(0);

            expect(source.sent).toEqual([{type: "walkway", kind: "path", path: [{x: 4, y: 7}, {x: 5, y: 7}, {x: 6, y: 7}]}]);
        });

        it.each([
            [ROAD, {type: "erase", tool: "road", path: [{x: 2, y: 3}]}],
            [RESIDENTIAL, {type: "erase", tool: "residential", path: [{x: 2, y: 3}]}],
            [WALKWAY, {type: "eraseWalkway", path: [{x: 7, y: 10}]}],
        ] as const)("sends a click with Shift held as the %j's eraser: %j", (tool, command) => {
            const {controls, input, source} = setUp();
            input.tool = tool;

            input.announce(UiMessages.TOOL_CLICKED, {x: 2.5 * TILE, y: 3.5 * TILE, start: true, erase: true});
            controls.tick(0);

            expect(source.sent).toEqual([command]);
        });

        // A press erases at the one tile, or ninth, under the pointer, whatever the tool puts down
        it.each([
            [RESIDENTIAL, false, {x: 2, y: 3, width: 3, height: 3, colour: "residential colour"}],
            [RESIDENTIAL, true, {x: 2, y: 3, width: 1, height: 1, colour: "bulldozer colour"}],
            [WALKWAY, false, {x: 7 / 3, y: 10 / 3, width: 1 / 3, height: 1 / 3, colour: "walkway colour"}],
            [WALKWAY, true, {x: 7 / 3, y: 10 / 3, width: 1 / 3, height: 1 / 3, colour: "bulldozer colour"}],
        ] as const)("outlines, for the %j, erasing %s, %j", (tool, erasing, box) => {
            const {controls, input} = setUp();
            input.tool = tool;
            input.erasing = erasing;
            input.pointer = {x: 2.5 * TILE, y: 3.5 * TILE};

            controls.tick(0);

            const outlines = controls.outlines();
            expect(outlines[outlines.length - 1]).toEqual({...box, label: null});
            expect(controls.hoverTile).toEqual({x: 2, y: 3});
        });

        it("shows the others an eraser as the bulldozer's box of one tile", () => {
            const {controls, input, players} = setUp();
            input.tool = RESIDENTIAL;
            input.erasing = true;
            input.pointer = {x: 2.5 * TILE, y: 3.5 * TILE};

            controls.tick(0);

            expect(players.last).toEqual({tool: "bulldozer", size: 1, tile: {x: 2, y: 3}});
        });

        it("asks for the report of the tile the query tool clicked, and shows it", () => {
            const {input, source, gameWindows} = setUp();
            input.tool = QUERY;

            input.announce(UiMessages.TOOL_CLICKED, {x: 4 * TILE, y: 6 * TILE, start: true, erase: false});

            expect(source.asked).toEqual([{type: "tileReport", x: 4, y: 6}]);
            expect(gameWindows.query.opened).toEqual([[{type: "tileReport", x: 4, y: 6}]]);
        });

        it("asks for no report of a tile in the margin past the map", () => {
            const {input, source} = setUp();
            input.tool = QUERY;

            input.announce(UiMessages.TOOL_CLICKED, {x: MAP_WIDTH * TILE, y: TILE, start: true, erase: false});

            expect(source.asked).toEqual([]);
        });
    });

    describe("windows", () => {

        it("open the evaluation on the city's evaluation record", () => {
            const {input, gameWindows} = setUp();

            input.announce(UiMessages.EVAL_REQUESTED);

            expect(gameWindows.evaluation.opened).toEqual([[EVALUATION]]);
        });

        it("send the budget chosen in the budget window", async () => {
            const {input, budget, source} = setUp();
            input.announce(UiMessages.BUDGET_REQUESTED);

            budget.choose({funding: {fire: 40}, tax: 9});
            await settled();

            expect(budget.opened).toEqual([[BUDGET]]);
            expect(source.sent).toEqual([{type: "setBudget", tax: 9, fire: 40}]);
        });

        it("say whether the budget window opened, which it doesn't over another", () => {
            const {controls, input, budget} = setUp();
            input.announce(UiMessages.EVAL_REQUESTED);

            expect(controls.openBudget()).toBe(false);
            expect(budget.opened).toEqual([]);
        });

        it("open the budget window on the budget as the city has it now", () => {
            const {controls, budget, city} = setUp();
            const later = {...BUDGET, funds: 500};
            city.records.budget = later;

            expect(controls.openBudget()).toBe(true);

            expect(budget.opened).toEqual([[later]]);
        });

        it("mark a year-end budget review due without opening the budget window", () => {
            const {controls, budget, windows, reviewMarker} = setUp();

            controls.budgetReviewDue();

            expect(reviewMarker.lit).toBe(true);
            expect(budget.opened).toEqual([]);
            expect(windows.holdsInput()).toBe(false);
        });

        it("keep the review marked when another falls due", () => {
            const {controls, reviewMarker} = setUp();
            controls.budgetReviewDue();

            controls.budgetReviewDue();

            expect(reviewMarker.lit).toBe(true);
        });

        it("clear the review's mark when the budget window opens, however the player asked", () => {
            const {controls, input, reviewMarker} = setUp();
            controls.budgetReviewDue();

            input.announce(UiMessages.BUDGET_REQUESTED);

            expect(reviewMarker.lit).toBe(false);
        });

        it("keep the review marked while the budget window can't open over another", () => {
            const {controls, input, reviewMarker} = setUp();
            controls.budgetReviewDue();
            input.announce(UiMessages.EVAL_REQUESTED);

            controls.openBudget();

            expect(reviewMarker.lit).toBe(true);
        });

        it.each<[string, DisasterKind | null, Command[]]>([
            ["triggers the disaster chosen", "fire", [{type: "triggerDisaster", kind: "fire"}]],
            ["triggers none when none is chosen", null, []],
        ])("send what the disaster window chose: %s", async (_, kind, sent) => {
            const {input, gameWindows, source} = setUp();
            input.announce(UiMessages.DISASTER_REQUESTED);

            gameWindows.disaster.choose(kind);
            await settled();

            expect(source.sent).toEqual(sent);
        });

        it("add funds and download the session's log as the debug window chose", async () => {
            const {input, gameWindows, source, page} = setUp();
            input.announce(UiMessages.DEBUG_WINDOW_REQUESTED);

            gameWindows.debug.choose(["addFunds", "downloadLog"]);
            await settled();

            expect(source.sent).toEqual([{type: "addFunds"}]);
            expect(page.files).toEqual([{fileName: "micropolis-log-120.json", text: JSON.stringify(LOG.log)}]);
        });

        it("say a session's log the source can't give out loud", async () => {
            const {input, gameWindows, source, page} = setUp();
            source.log = Promise.reject(new Error("The connection is down"));
            input.announce(UiMessages.DEBUG_WINDOW_REQUESTED);

            gameWindows.debug.choose(["downloadLog"]);
            await settled();

            expect(page.alerts).toEqual(["The command log couldn't be downloaded: The connection is down"]);
            expect(page.files).toEqual([]);
        });

        it("open the settings on the city's and the client's settings", () => {
            const {input, gameWindows} = setUp();

            input.announce(UiMessages.SETTINGS_WINDOW_REQUESTED);

            expect(gameWindows.settings.opened).toEqual([[SETTINGS, {autoBulldoze: true, carShare: HALF, seed: 1234}]]);
        });

        it("send the settings changed from what the window showed, though the city changed behind it", async () => {
            const {input, gameWindows, source, city, autoBulldoze} = setUp();
            input.announce(UiMessages.SETTINGS_WINDOW_REQUESTED);
            city.records.settings = {...SETTINGS, autoBudget: false};

            gameWindows.settings.choose({autoBudget: true, autoBulldoze: false, carShare: HALF, speed: SPEEDS.fast,
                                         disasters: true});
            await settled();

            expect(source.sent).toEqual([{type: "setSpeed", speed: SPEEDS.fast}]);
            expect(autoBulldoze.on).toBe(false);
        });

        // The share is the browser's alone: the other players' cars are their own
        it("keep the share of the trips that become cars chosen, and send nothing of it", async () => {
            const {input, gameWindows, source, carShare} = setUp();
            input.announce(UiMessages.SETTINGS_WINDOW_REQUESTED);

            gameWindows.settings.choose({autoBudget: true, autoBulldoze: true, carShare: TENTH, speed: SPEEDS.medium,
                                         disasters: true});
            await settled();

            expect([carShare.kept, source.sent]).toEqual([TENTH, []]);
        });

        it("change nothing when the settings window is cancelled", async () => {
            const {input, gameWindows, source, autoBulldoze, carShare} = setUp();
            input.announce(UiMessages.SETTINGS_WINDOW_REQUESTED);

            gameWindows.settings.close();
            await settled();

            expect(source.sent).toEqual([]);
            expect([autoBulldoze.on, carShare.kept]).toEqual([true, HALF]);
        });

        it.each<[ScreenshotArea, string]>([["visible", "data:visible"], ["all", "data:all"]])(
            "open the link to the picture of the area chosen, %s, in the screenshot window's place",
            async (area, link) => {
            const {input, gameWindows, windows} = setUp();
            input.announce(UiMessages.SCREENSHOT_WINDOW_REQUESTED);

            gameWindows.screenshot.choose(area);
            await settled();

            expect(gameWindows.screenshotLink.opened).toEqual([[link]]);
            expect(windows.holdsInput()).toBe(true);
        });

        it("open the save window once the server has kept the city, and save once while it does", async () => {
            const {input, gameWindows, source} = setUp();
            let kept: () => void = () => {};
            source.saving = new Promise((resolve) => {
                kept = resolve;
            });

            input.announce(UiMessages.SAVE_REQUESTED);
            input.announce(UiMessages.SAVE_REQUESTED);
            await settled();
            expect(gameWindows.save.opened).toEqual([]);
            kept();
            await settled();

            expect(source.saves).toBe(1);
            expect(gameWindows.save.opened).toEqual([[]]);
        });

        it("say a save the server refuses out loud", async () => {
            const {input, gameWindows, source, page} = setUp();
            source.saving = Promise.reject(new Error("Too many saves"));

            input.announce(UiMessages.SAVE_REQUESTED);
            await settled();

            expect(page.alerts).toEqual(["The city couldn't be saved: Too many saves"]);
            expect(gameWindows.save.opened).toEqual([]);
        });

        it("give the city's save as a file named after the city", async () => {
            const {input, page} = setUp();

            input.announce(UiMessages.DOWNLOAD_REQUESTED);
            await settled();

            expect(page.files).toEqual([{fileName: "Town.json", text: "save text"}]);
        });

        it("give one file for a download clicked again while the first is on its way", async () => {
            const {input, source, page} = setUp();
            let answered: (text: string) => void = () => {};
            source.downloaded = new Promise((resolve) => {
                answered = resolve;
            });

            input.announce(UiMessages.DOWNLOAD_REQUESTED);
            input.announce(UiMessages.DOWNLOAD_REQUESTED);
            await settled();
            expect(page.files).toEqual([]);
            answered("save text");
            await settled();

            expect(source.downloads).toBe(1);
            expect(page.files).toEqual([{fileName: "Town.json", text: "save text"}]);
        });

        it("say a download the server refuses out loud", async () => {
            const {input, source, page} = setUp();
            source.downloaded = Promise.reject(new Error("Too many downloads"));

            input.announce(UiMessages.DOWNLOAD_REQUESTED);
            await settled();

            expect(page.alerts).toEqual(["The city couldn't be downloaded: Too many downloads"]);
            expect(page.files).toEqual([]);
        });

        it("warn of touch", () => {
            const {controls, gameWindows, windows} = setUp();

            controls.warnOfTouch();

            expect(gameWindows.touchWarning.opened).toEqual([[]]);
            expect(windows.holdsInput()).toBe(true);
        });

        it("warn of touch not at all while another window shows", () => {
            const {controls, input, gameWindows} = setUp();
            input.announce(UiMessages.EVAL_REQUESTED);

            controls.warnOfTouch();

            expect(gameWindows.touchWarning.opened).toEqual([]);
        });
    });
});
