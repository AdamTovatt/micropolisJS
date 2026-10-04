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
import { QueryAnswer, StateMessage } from "../src/protocol";
import { answerTo } from "./helpers/queryAnswers";
import { withNames } from "./helpers/recordings";
import { RecordingBuilder, RecordingSource } from "./recordings/recordingSource";

// How the recording script records a source, on a source the test drives: the guards that keep a recording one a test
// can play back, and the same every time it is made

const DATE: StateMessage = {type: "date", month: 1, year: 1900};
const REJECTED: QueryAnswer = {type: "rejected", reason: "no city has started"};

// A source whose state the test delivers when it likes, and whose answer to each query is the next one given
function stubSource() {
    const subscribers = new Subscribers();
    const answers: QueryAnswer[] = [];
    const source: CitySource = {
        player: "a player's id",
        driver: trackingHold({
            hold: async () => {},
            release: async () => {},
            flush: async () => subscribers.deliver([DATE]),
            advance: async () => ({steps: 1, budgetReviewDue: false, error: null}),
            cityTime: async () => 0,
        }),
        subscribe: (listener) => subscribers.subscribe(listener),
        start: async () => ({name: "Town", seed: 1, city: "a city's id"}),
        send: () => {},
        ask: (_, reply) => reply(answers.shift()!),
        setViewerVisible: () => {},
        save: async () => {
            throw new Error("The city failed");
        },
        commandLog: async () => ({log: {}, step: 0, unhashed: null}),
    };

    return {source, deliver: (message: StateMessage) => subscribers.deliver([message]), answers};
}

describe("the recording source", () => {

    it("records each call with the state delivered during it, what it returned, and what it threw", async () => {
        const {source} = stubSource();
        const recording = new RecordingSource(source);

        await recording.start({name: "Town", seed: 1, level: 0});
        recording.send({type: "setAutoBudget", on: false});
        await recording.driver.flush();
        await expect(recording.save()).rejects.toThrow("The city failed");

        expect(recording.take()).toEqual([
            {call: "start", arguments: [{name: "Town", seed: 1, level: 0}], messages: [],
             returns: {name: "Town", seed: 1, city: "a city's id"}},
            {call: "send", arguments: [{type: "setAutoBudget", on: false}], messages: []},
            {call: "flush", arguments: [], messages: [DATE]},
            {call: "save", arguments: [], messages: [], throws: "The city failed"},
        ]);
        expect(recording.city).toBe("a city's id");
    });

    it("fails on state delivered outside any call", async () => {
        const {source, deliver} = stubSource();
        const recording = new RecordingSource(source);
        await recording.driver.hold();

        deliver(DATE);

        expect(() => recording.take()).toThrow("The source delivered state outside any call");
    });

    it("records a query asked again between two calls once", async () => {
        const {source, answers} = stubSource();
        const recording = new RecordingSource(source);
        answers.push(REJECTED, REJECTED);

        await answerTo(recording, {type: "budgetForecast"});
        await answerTo(recording, {type: "budgetForecast"});

        expect(recording.take()).toEqual([{query: {type: "budgetForecast"}, answer: REJECTED}]);
    });

    it("fails on a query answered twice, differently, between two calls", async () => {
        const {source, answers} = stubSource();
        const recording = new RecordingSource(source);
        answers.push(REJECTED, {type: "rejected", reason: "another reason"});
        await answerTo(recording, {type: "budgetForecast"});

        await expect(answerTo(recording, {type: "budgetForecast"}))
            .rejects.toThrow('The query {"type":"budgetForecast"} was answered twice, differently, between two calls');
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
