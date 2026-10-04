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

import type { CityStart } from "../src/citySource";
import { QueryAnswer, StateMessage } from "../src/protocol";
import { expectPlayedThrough, FakeCitySource, playback } from "./helpers/fakeCitySource";
import { answerTo } from "./helpers/queryAnswers";
import { Recording } from "./helpers/recordings";
import { NEW_CITY } from "./recordings/scenarios";

// The fake city source, on a recording laid out here rather than one the recording script made

const DATE: StateMessage = {type: "date", month: 1, year: 1900};
const POPULATION: StateMessage = {type: "population", population: 40};
const REJECTED: QueryAnswer = {type: "rejected", reason: "no city has started"};
const FORECAST: QueryAnswer = {
    type: "budgetForecast",
    budget: {type: "budget", taxRate: 7, taxesCollected: 0, funds: 20000, maintenance: {road: 0, fire: 0, police: 0},
             funding: {road: 1, fire: 1, police: 1}},
    costs: {road: 0, fire: 0, police: 0}, fundsChange: 0, fundsAfterYear: 20000,
};

const START: CityStart = {name: "Town", seed: 1, level: 0};

const RECORDING: Recording = {
    player: "player",
    opening: [
        {query: {type: "budgetForecast"}, answer: REJECTED},
        {call: "hold", arguments: [], messages: []},
        {call: "start", arguments: [START], messages: [DATE], returns: {name: "Town", seed: 1, city: "city"}},
        {query: {type: "budgetForecast"}, answer: FORECAST},
    ],
    branches: {
        "advance": [
            {call: "send", arguments: [{type: "setAutoBudget", on: false}]},
            {call: "advance", arguments: [16], messages: [POPULATION],
             returns: {steps: 16, budgetReviewDue: false, error: null}},
        ],
        "save fails": [
            {call: "save", arguments: [], messages: [POPULATION], throws: "The city failed"},
        ],
    },
};

function fake(branch: string) {
    const source = new FakeCitySource(RECORDING, branch, "The recording");
    const delivered: StateMessage[] = [];
    source.subscribe((message) => delivered.push(message));
    return {source, delivered};
}

// The fake with the recording's opening played: held, and started
async function started(branch: string) {
    const played = fake(branch);
    await played.source.driver.hold();
    await played.source.start(START);
    return played;
}

describe("the fake city source", () => {

    it("plays the opening and the branch, delivering each call's messages before it resolves", async () => {
        const {source, delivered} = fake("advance");

        await source.driver.hold();
        expect(await source.start(START)).toEqual({name: "Town", seed: 1, city: "city"});
        expect(delivered).toEqual([DATE]);
        source.send({type: "setAutoBudget", on: false});
        const advancing = source.driver.advance(16);
        expect(delivered).toEqual([DATE, POPULATION]);

        expect(await advancing).toEqual({steps: 16, budgetReviewDue: false, error: null});
        expect(source.unplayed()).toEqual([]);
    });

    it("sends commands as the player the recording's source did", () => {
        expect(fake("advance").source.player).toBe("player");
    });

    it("answers a query with the answer recorded since the last call, as often as it is asked", async () => {
        const {source} = fake("advance");

        expect(await answerTo(source, {type: "budgetForecast"})).toEqual(REJECTED);
        await source.driver.hold();
        await source.start(START);

        expect(await answerTo(source, {type: "budgetForecast"})).toEqual(FORECAST);
        expect(await answerTo(source, {type: "budgetForecast"})).toEqual(FORECAST);
    });

    it("answers after the question, never during it, as a source running a city does", async () => {
        const {source} = await started("advance");
        const answers: QueryAnswer[] = [];

        source.ask({type: "budgetForecast"}, (answer) => answers.push(answer));
        expect(answers).toEqual([]);

        await Promise.resolve();
        expect(answers).toEqual([FORECAST]);
    });

    it("refuses a query recorded at another point", async () => {
        const {source} = fake("advance");
        await source.driver.hold();

        expect(() => source.ask({type: "budgetForecast"}, () => {}))
            .toThrow('The recording has no answer to the query {"type":"budgetForecast"} after call 1');
    });

    it("refuses a call other than the next recorded, naming both", async () => {
        const {source} = fake("advance");
        await source.driver.hold();

        await expect(source.start({name: "Town", seed: 2, level: 0})).rejects.toThrow(
            'The recording has start({"name":"Town","seed":1,"level":0}) next, but ' +
            'start({"name":"Town","seed":2,"level":0}) was made after call 1');
    });

    it("refuses a call past the end of the branch", async () => {
        const {source} = await started("save fails");
        await expect(source.save()).rejects.toThrow();

        await expect(source.driver.flush())
            .rejects.toThrow("The recording has no more calls, but flush() was made after call 3");
    });

    it("throws what the recorded call threw, after delivering its messages", async () => {
        const {source, delivered} = await started("save fails");

        await expect(source.save()).rejects.toThrow("The city failed");
        expect(delivered).toEqual([DATE, POPULATION]);
    });

    it("lists the calls not yet made", async () => {
        const {source} = fake("advance");
        await source.driver.hold();

        expect(source.unplayed().map(({call}) => call)).toEqual(["start", "send", "advance"]);
    });

    it("tells whether its driver is held from its own last hold or release", async () => {
        const {source} = fake("advance");
        expect(source.driver.isHeld()).toBe(false);
        await source.driver.hold();
        expect(source.driver.isHeld()).toBe(true);
    });

    it("has no branch the recording doesn't", () => {
        expect(() => fake("no such branch")).toThrow("The recording has no such branch");
    });
});

// On a recording the recording script made: the release branch of a new city, held as it starts
describe("the check that a test played its branch through", () => {

    async function openAndRelease(release: boolean): Promise<void> {
        const source = playback("newCity", "release");
        await source.driver.hold();
        await source.start(NEW_CITY);
        if (release) {
            await source.driver.release();
        }
    }

    it("passes a test that made every call", async () => {
        await openAndRelease(true);

        expect(() => expectPlayedThrough()).not.toThrow();
    });

    it("fails a test that stopped short, naming the calls it didn't make", async () => {
        await openAndRelease(false);

        expect(() => expectPlayedThrough()).toThrow("release()");
    });

    it("checks each fake once", async () => {
        await openAndRelease(false);
        expect(() => expectPlayedThrough()).toThrow();

        expect(() => expectPlayedThrough()).not.toThrow();
    });
});
