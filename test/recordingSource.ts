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

import { Subscribers, trackingHold } from "../src/citySource";
import type { CitySource } from "../src/citySource";
import { Query, QueryAnswer, StateMessage } from "../src/protocol";
import { answerTo } from "./helpers/queryAnswers";
import { RecordingBuilder, withNames } from "./recordings/recordingFile";
import { RecordingSource } from "./recordings/recordingSource";

// How the recording script records a source, on a source the test drives: the guards that keep a recording one a test
// can play back, and the same every time it is made

const DATE: StateMessage = {type: "date", month: 1, year: 1900};
const REJECTED: QueryAnswer = {type: "rejected", reason: "no city has started"};
const FORECAST: Query = {type: "budgetForecast"};

// A source whose state the test delivers when it likes, which answers each query when the test says, with the answer
// given, and holds each flush until the test lets it go
function stubSource() {
    const subscribers = new Subscribers();
    const pending: ((answer: QueryAnswer) => void)[] = [];
    const flushes: (() => void)[] = [];
    let cities = 0;
    const source: CitySource = {
        player: "a player's id",
        driver: trackingHold({
            hold: async () => {},
            release: async () => {},
            flush: () => new Promise((resolve) => flushes.push(() => {
                subscribers.deliver([DATE]);
                resolve();
            })),
            advance: async () => ({steps: 1, budgetReviewDue: false, error: null}),
            cityTime: async () => 0,
            savedGame: async () => "",
        }),
        subscribe: (listener) => subscribers.subscribe(listener),
        start: async () => ({name: "Town", seed: 1, city: `city id ${++cities}`}),
        send: () => {},
        ask: (_, reply) => pending.push(reply),
        save: async () => {
            throw new Error("The city failed");
        },
        download: async () => "a save's text",
        commandLog: async () => ({log: {}, step: 0}),
    };

    return {
        source,
        deliver: (message: StateMessage) => subscribers.deliver([message]),
        answer: (answer: QueryAnswer) => pending.shift()!(answer),
        finishFlush: () => flushes.shift()!(),
    };
}

describe("the recording source", () => {

    it("records each call with the state delivered during it, what it returned, and what it threw", async () => {
        const {source, finishFlush} = stubSource();
        const recording = new RecordingSource(source);

        await recording.start({name: "Town", seed: 1, level: 0});
        recording.send({type: "setAutoBudget", on: false});
        const flushing = recording.driver.flush();
        finishFlush();
        await flushing;
        await expect(recording.save()).rejects.toThrow("The city failed");

        expect(recording.take()).toEqual([
            {call: "start", arguments: [{name: "Town", seed: 1, level: 0}], messages: [],
             returns: {name: "Town", seed: 1, city: "city id 1"}},
            {call: "send", arguments: [{type: "setAutoBudget", on: false}]},
            {call: "flush", arguments: [], messages: [DATE]},
            {call: "save", arguments: [], messages: [], throws: "The city failed"},
        ]);
    });

    it("keeps the id of every city it started, in order", async () => {
        const recording = new RecordingSource(stubSource().source);

        await recording.start({name: "Town", seed: 1, level: 0});
        await recording.start({name: "Town", seed: 2, level: 0});

        expect(recording.cities).toEqual(["city id 1", "city id 2"]);
    });

    it("fails on state delivered outside any call", async () => {
        const {source, deliver} = stubSource();
        const recording = new RecordingSource(source);
        await recording.driver.hold();

        deliver(DATE);

        expect(() => recording.take()).toThrow("The source delivered state outside any call");
    });

    it("fails on a call made while another waits on its answer", async () => {
        const {source, finishFlush} = stubSource();
        const recording = new RecordingSource(source);
        const flushing = recording.driver.flush();

        await expect(recording.driver.advance(1)).rejects.toThrow("advance was made while flush waited on its answer");
        finishFlush();
        await flushing;
        expect(() => recording.take()).toThrow("advance was made while flush waited on its answer");
    });

    it("records a query where it was asked, though its answer comes after the next call", async () => {
        const {source, answer} = stubSource();
        const recording = new RecordingSource(source);

        const asked = answerTo(recording, FORECAST);
        await recording.driver.hold();
        answer(REJECTED);
        await asked;

        expect(recording.take()).toEqual([
            {query: FORECAST, answer: REJECTED},
            {call: "hold", arguments: [], messages: []},
        ]);
    });

    it("records a query asked again between two calls once, and again after the next call", async () => {
        const {source, answer} = stubSource();
        const recording = new RecordingSource(source);

        for (let i = 0; i < 2; i++) {
            const asked = answerTo(recording, FORECAST);
            answer(REJECTED);
            await asked;
        }

        await recording.driver.hold();
        const asked = answerTo(recording, FORECAST);
        answer(REJECTED);
        await asked;

        expect(recording.take()).toEqual([
            {query: FORECAST, answer: REJECTED},
            {call: "hold", arguments: [], messages: []},
            {query: FORECAST, answer: REJECTED},
        ]);
    });

    it("fails on a query answered twice, differently, between two calls", async () => {
        const {source, answer} = stubSource();
        const recording = new RecordingSource(source);
        const first = answerTo(recording, FORECAST);
        const second = answerTo(recording, FORECAST);

        answer(REJECTED);
        answer({type: "rejected", reason: "another reason"});
        await Promise.all([first, second]);

        expect(() => recording.take())
            .toThrow('The query {"type":"budgetForecast"} was answered twice, differently, between two calls');
    });

    it("fails on a query never answered", () => {
        const recording = new RecordingSource(stubSource().source);

        recording.ask(FORECAST, () => {});

        expect(() => recording.take()).toThrow("was never answered");
    });
});

describe("naming the ids the server makes up", () => {

    const names = new Map([["0f3a", "player"], ["9c1e", "city"]]);

    it("replaces each string that is an id with its name, wherever it is", () => {
        expect(withNames({player: "0f3a", list: ["9c1e", "other"], nested: {city: "9c1e"}}, names))
            .toEqual({player: "player", list: ["city", "other"], nested: {city: "city"}});
    });

    it("fails on an id left inside a longer string, which it can't name", () => {
        expect(() => withNames({text: "joined 9c1e"}, names))
            .toThrow("The server's id 9c1e for city is in the recording where it can't be named");
    });
});

describe("a scenario's recording", () => {

    const opening = [{call: "hold" as const, arguments: [], messages: []}];

    it("keeps the opening its branches share, and each branch", () => {
        const recording = new RecordingBuilder("newCity", "player");
        recording.add("a", {opening, branch: []});
        recording.add("b", {opening, branch: [{call: "flush", arguments: [], messages: []}]});

        expect(recording.build()).toEqual({player: "player", opening, branches: {
            a: [], b: [{call: "flush", arguments: [], messages: []}],
        }});
    });

    it("fails on a branch whose opening recorded differently", () => {
        const recording = new RecordingBuilder("newCity", "player");
        recording.add("a", {opening, branch: []});

        expect(() => recording.add("b", {opening: [], branch: []}))
            .toThrow('The opening of newCity recorded differently for branch "b"');
    });
});
