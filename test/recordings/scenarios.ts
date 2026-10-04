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

import type { CitySource, CityStart } from "../../src/citySource";
import { Command, CommandResult, OverlayLayer, Query, SPEEDS, TilePosition } from "../../src/protocol";
import { CYCLES_IN_A_YEAR, FAST_CYCLE, STEPS_PER_CITY_TIME, YEAR } from "../helpers/cityTimes";
import { answerTo } from "../helpers/queryAnswers";

// What the recording script (record.ts) does with the city source it records, which the client's tests then do with
// the fake that plays the recording back (test/helpers/fakeCitySource.ts). Each scenario is a recording: an opening,
// the calls every branch starts with, which a test makes through the function here, and its branches, the calls a
// test goes on to make. A test makes its branch's calls through the client code it tests, so a change to what the
// client sends fails the test until the recordings are made again.

// What a branch is recorded with: the source, and another player in the same city
export interface RecordingSession {
    source: CitySource;
    // Sends the command as another player in the city, and resolves once the city has it, which its state messages
    // show only as the city applies it
    fromAnotherPlayer(command: Command): Promise<void>;
}

export interface Scenario {
    opening(source: CitySource): Promise<void>;
    branches: Record<string, (session: RecordingSession) => Promise<void>>;
}

export const SEED = 2026;

// The city every scenario with a city starts: a new city on the seed's map, at medium speed
export const NEW_CITY: CityStart = {name: "Town", seed: SEED, level: 0};

// A road on clear land of the seed's map
export const ROAD: Command = {type: "tool", tool: "road", path: [{x: 30, y: 49}], autoBulldoze: true};

const AUTO_BUDGET_OFF: Command = {type: "setAutoBudget", on: false};
const AUTO_BUDGET_ON: Command = {type: "setAutoBudget", on: true};

const speed = (value: number): Command => ({type: "setSpeed", speed: value});

// A command the simulation rejects, which it applies and logs all the same
export const UNKNOWN_COMMAND = {type: "noSuchCommand"} as unknown as Command;

// The centre of the town's first residential zone
export const RESIDENTIAL_CENTRE: TilePosition = {x: 29, y: 46};

// The layer the town's overlay shows, which changes as the town's industry and power plant pollute
export const TOWN_OVERLAY: OverlayLayer = "pollution";

// A coal plant powering a row of zones along a road, on clear land of the seed's map, each building placed by its
// centre tile, at fast speed: it has residents and pollution within a year
const TOWN_COMMANDS: Command[] = [
    speed(SPEEDS.fast),
    {type: "tool", tool: "coal", path: [{x: 25, y: 46}], autoBulldoze: true},
    ...[29, 32, 35].map((x): Command => ({type: "tool", tool: "residential", path: [{x, y: 46}], autoBulldoze: true})),
    ...[38, 41].map((x): Command => ({type: "tool", tool: "commercial", path: [{x, y: 46}], autoBulldoze: true})),
    ...[44, 47].map((x): Command => ({type: "tool", tool: "industrial", path: [{x, y: 46}], autoBulldoze: true})),
    {type: "tool", tool: "road", path: Array.from({length: 21}, (_, i) => ({x: 28 + i, y: 48})), autoBulldoze: true},
];

// The new city, held, so it steps only as the driver advances it
export async function openNewCity(source: CitySource): Promise<void> {
    await source.driver.hold();
    await source.start(NEW_CITY);
}

// The new city with the town built, every tool succeeding
export async function openTown(source: CitySource): Promise<void> {
    const results: CommandResult[] = [];
    source.subscribe((message) => {
        if (message.type === "commandResult") {
            results.push(message.result);
        }
    });

    await openNewCity(source);
    TOWN_COMMANDS.forEach((command) => source.send(command));
    await source.driver.flush();

    const failed = results.filter((result) => result.outcome !== "ok");
    if (results.length !== TOWN_COMMANDS.length || failed.length > 0) {
        throw new Error(`The town wasn't built as laid out: ${JSON.stringify(failed)}`);
    }
}

// Branches that only send commands and apply them
function sending(...steps: (Command | "flush")[]): (session: RecordingSession) => Promise<void> {
    return async ({source}) => {
        for (const step of steps) {
            if (step === "flush") {
                await source.driver.flush();
            } else {
                source.send(step);
            }
        }
    };
}

// The scenarios by name, whose names and branch names the compiler checks a test's playback against
export const SCENARIOS = {

    // No city: the splash screen's map preview
    noCity: {
        opening: async () => {},
        branches: {
            "map preview": async ({source}) => {
                await answerTo(source, {type: "mapPreview", seed: SEED});
            },
        },
    },

    newCity: {
        opening: openNewCity,
        branches: {
            "nothing": async () => {},
            "release": async ({source}) => {
                await source.driver.release();
            },
            "flush": sending("flush"),
            "budget forecast": async ({source}) => {
                await answerTo(source, {type: "budgetForecast", road: 50});
            },

            // The Save button's
            "save": async ({source}) => {
                await source.save();
            },

            // The test hook's
            "input, then flush": async ({source}) => {
                await source.driver.advance(5);
                source.send(AUTO_BUDGET_OFF);
                source.send(ROAD);
                await source.driver.flush();
            },
            "input, then advance": async ({source}) => {
                await source.driver.advance(5);
                source.send(AUTO_BUDGET_OFF);
                source.send(ROAD);
                await source.driver.advance(5);
            },
            "ten city times": async ({source}) => {
                await source.driver.advance(10 * STEPS_PER_CITY_TIME);
                await source.driver.cityTime();
            },
            "pause, flush, advance": async ({source}) => {
                source.send(speed(SPEEDS.paused));
                await source.driver.flush();
                await source.driver.advance(1);
            },
            "pause, advance": async ({source}) => {
                source.send(speed(SPEEDS.paused));
                await source.driver.advance(1);
            },
            "auto-budget off, an unknown command, flush": sending(AUTO_BUDGET_OFF, UNKNOWN_COMMAND, "flush"),
            "auto-budget off, advance": async ({source}) => {
                source.send(AUTO_BUDGET_OFF);
                await source.driver.advance(1);
            },
            "auto-budget off, flush, on, flush": sending(AUTO_BUDGET_OFF, "flush", AUTO_BUDGET_ON, "flush"),

            // The speed control's
            "auto-budget off, flush": sending(AUTO_BUDGET_OFF, "flush"),
            "pause": sending(speed(SPEEDS.paused)),
            "pause, flush, medium, flush": sending(speed(SPEEDS.paused), "flush", speed(SPEEDS.medium), "flush"),
            "fast, flush": sending(speed(SPEEDS.fast), "flush"),
            "slow, flush, pause, flush, slow, flush":
                sending(speed(SPEEDS.slow), "flush", speed(SPEEDS.paused), "flush", speed(SPEEDS.slow), "flush"),
            "pause, flush, flush, fast, flush":
                sending(speed(SPEEDS.paused), "flush", "flush", speed(SPEEDS.fast), "flush"),
            "another player's slow, flush, another player's pause, flush, slow, flush": async (session) => {
                await session.fromAnotherPlayer(speed(SPEEDS.slow));
                await session.source.driver.flush();
                await session.fromAnotherPlayer(speed(SPEEDS.paused));
                await session.source.driver.flush();
                session.source.send(speed(SPEEDS.slow));
                await session.source.driver.flush();
            },
        },
    },

    town: {
        opening: openTown,
        branches: {
            "tile reports": async ({source}) => {
                await answerTo(source, {type: "tileReport", ...RESIDENTIAL_CENTRE});
                await answerTo(source, {type: "tileReport", x: -1, y: RESIDENTIAL_CENTRE.y});
            },

            // The test hook's: a year-end budget falls due only in a city with residents
            "a year, auto-budget off, a year": async ({source}) => {
                await source.driver.advance(YEAR);
                source.send(AUTO_BUDGET_OFF);
                await source.driver.advance(YEAR);
            },
            "a year, auto-budget off, a year and a half": async ({source}) => {
                await source.driver.advance(YEAR);
                source.send(AUTO_BUDGET_OFF);
                await source.driver.advance(YEAR);
                await source.driver.advance(YEAR / 2);
            },

            // The overlay, asked for at once, then after each cycle that recomputed it, and at the end
            "a year of overlays": async ({source}) => {
                let announced = false;
                source.subscribe((message) => {
                    announced ||= message.type === "overlayUpdated" && message.layer === TOWN_OVERLAY;
                });
                const query: Query = {type: "overlay", layer: TOWN_OVERLAY};

                await answerTo(source, query);
                for (let cycle = 0; cycle < CYCLES_IN_A_YEAR; cycle++) {
                    announced = false;
                    await source.driver.advance(FAST_CYCLE);
                    if (announced) {
                        await answerTo(source, query);
                    }
                }

                await answerTo(source, query);
            },
        },
    },
} satisfies Record<string, Scenario>;

export type ScenarioName = keyof typeof SCENARIOS;

export type BranchName<Name extends ScenarioName> = keyof typeof SCENARIOS[Name]["branches"] & string;
