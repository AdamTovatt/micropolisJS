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

import { readdirSync, readFileSync } from "fs";
import { basename, join } from "path";

import { budgetRecord, type BudgetSource } from "../src/budgetRecord";
import { newsMessage } from "../src/cityHost";
import { commandRejection } from "../src/commands";
import { evaluationRecord, type EvaluationSource } from "../src/evaluationRecord";
import {
    type BudgetRecord, clientMessageTypes, commandTypes, cursorReport, type EvaluationRecord, LOCAL_PLAYER,
    type NewsMessage, type NewsPlace, parseErrorResponse, parsePlayerResponse, parseServerMessage, parseSessionResponse,
    queryAnswerTypes, queryTypes, recordTypes,
    serverMessageTypes, type SettingsRecord, signInRequest, type StateMessage, stateMessageTypes,
} from "../src/protocol";
import { answerQueryWithoutCity, queryRejection } from "../src/queries";
import { SaveFormat } from "../src/savedGame";
import { settingsRecord, type SettingsSource } from "../src/settingsRecord";
import { plainSavedState } from "../src/stateHash";
import { hostedCity } from "./helpers/hostedCity";
import { repositoryPath } from "./helpers/repository";
import { buildCity, YEAR } from "./helpers/simulations";

// The examples and reader cases are shared with the server's tests: protocol/README.md describes them
const SOCKET_EXAMPLES = repositoryPath("protocol/examples/socket");
const CLIENT_EXAMPLES = repositoryPath("protocol/examples/client");
const SESSION_EXAMPLES = repositoryPath("protocol/examples/session");
const COMMAND_EXAMPLES = repositoryPath("protocol/examples/commands");
const QUERY_EXAMPLES = repositoryPath("protocol/examples/queries");
const RECORD_EXAMPLES = repositoryPath("protocol/examples/records");
const STATE_EXAMPLES = repositoryPath("protocol/examples/state");
const ANSWER_EXAMPLES = repositoryPath("protocol/examples/answers");

// The game's map, which every command example's tiles lie on
const MAP_WIDTH = 120;
const MAP_HEIGHT = 100;

function exampleFiles(directory: string): string[] {
    return readdirSync(directory).filter((file) => file.endsWith(".json")).sort();
}

// Each session body by its example's file name, read and written back by the protocol's own code. The client only
// writes a sign-in, so it writes one with the example's name.
const SESSION_BODIES: Record<string, (wire: string) => string> = {
    "sign-in-request": (wire) => JSON.stringify(signInRequest(JSON.parse(wire).name)),
    "session-response": (wire) => JSON.stringify(parseSessionResponse(JSON.parse(wire))),
    "player-response": (wire) => JSON.stringify(parsePlayerResponse(JSON.parse(wire))),
    "error-response": (wire) => JSON.stringify(parseErrorResponse(JSON.parse(wire))),
};

// The client reads only the server's answers
const SESSION_BODIES_READ = ["session-response", "player-response", "error-response"];

interface ReaderCases {
    rejected: {case: string; text: string}[];
    accepted: {case: string; text: string; canonical: string}[];
    rejectedSessionBodies: {case: string; body: string; text: string}[];
}

const readerCases: ReaderCases = JSON.parse(readFileSync(repositoryPath("protocol/reader-cases.json"), "utf8"));

// One message's exact wire text on one line, then a newline, in UTF-8 without a byte order mark
function readWireText(path: string): string {
    const bytes = readFileSync(path);
    const text = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(bytes);

    if (!text.endsWith("\n") || /[\r\n]/.test(text.slice(0, -1)) || text.startsWith("\uFEFF")) {
        throw new Error(`${path} must be one line of UTF-8 without a byte order mark, ending in a newline`);
    }

    return text.slice(0, -1);
}

describe("the protocol", () => {

    it.each(exampleFiles(SOCKET_EXAMPLES))("reads the message %s and writes it back to identical bytes", (file) => {
        expectRoundTrip(join(SOCKET_EXAMPLES, file), (wire) => JSON.stringify(parseServerMessage(wire)));
    });

    it.each(exampleFiles(SESSION_EXAMPLES))("reads the session body %s and writes it back to identical bytes", (file) => {
        expectRoundTrip(join(SESSION_EXAMPLES, file), SESSION_BODIES[basename(file, ".json")]);
    });

    it("has an example of every session body and no other", () => {
        expect(exampleFiles(SESSION_EXAMPLES).map((file) => basename(file, ".json")).sort())
            .toEqual(Object.keys(SESSION_BODIES).sort());
    });

    it.each(readerCases.rejectedSessionBodies.filter(({body}) => SESSION_BODIES_READ.includes(body)))(
        "rejects $case", ({body, text}) => {
            expect(() => SESSION_BODIES[body](text)).toThrow("Not what the server sends");
        });

    it("has an example of every server message type", () => {
        const exampleTypes = exampleFiles(SOCKET_EXAMPLES).map((file) => JSON.parse(readWireText(join(SOCKET_EXAMPLES, file))).type);
        const distinctExampleTypes = exampleTypes.filter((type, i) => exampleTypes.indexOf(type) === i);

        expect(serverMessageTypes().length).toBeGreaterThan(0);
        expect(distinctExampleTypes.sort()).toEqual(serverMessageTypes().sort());
    });

    it.each(readerCases.rejected)("rejects a message with $case", ({text}) => {
        expect(() => parseServerMessage(text)).toThrow("Not what the server sends");
    });

    it.each(readerCases.accepted)("reads a message with $case and writes it in the protocol's order", ({text, canonical}) => {
        expect(JSON.stringify(parseServerMessage(text))).toBe(canonical);
    });
});

describe("the protocol's messages a player sends", () => {

    // test/webSocketCitySource.ts checks that the source writes each of its messages with the example's fields, in
    // order. A message may have an example of each of its shapes.
    it("has an example of every message type a player sends, and no other", () => {
        const exampleTypes = exampleFiles(CLIENT_EXAMPLES).map((file) => JSON.parse(readWireText(join(CLIENT_EXAMPLES, file))).type);

        expect(Array.from(new Set(exampleTypes)).sort()).toEqual(clientMessageTypes().sort());
    });

    // The city client, not the source, writes a hover box, so the protocol's own writer pins its bytes
    it.each(exampleFiles(CLIENT_EXAMPLES).filter((file) => file.startsWith("cursor")))(
        "writes the hover box %s to identical bytes", (file) => {
            expectRoundTrip(join(CLIENT_EXAMPLES, file), (wire) => JSON.stringify(cursorReport(JSON.parse(wire).cursor)));
        });
});

describe("the protocol's commands", () => {

    // The simulation takes a command as it arrived once it has validated it, so writing it back pins the example's
    // wire text
    it.each(exampleFiles(COMMAND_EXAMPLES))("reads the command %s, which the simulation accepts, and writes it back to identical bytes",
        (file) => {
            expectRoundTrip(join(COMMAND_EXAMPLES, file), (wire) => {
                const command: unknown = JSON.parse(wire);
                expect(commandRejection(command, MAP_WIDTH, MAP_HEIGHT)).toBeNull();
                return JSON.stringify(command);
            });
        });

    it("has an example of every command type", () => {
        const exampleTypes = exampleFiles(COMMAND_EXAMPLES).map((file) => JSON.parse(readWireText(join(COMMAND_EXAMPLES, file))).type);
        const distinctExampleTypes = exampleTypes.filter((type, i) => exampleTypes.indexOf(type) === i);

        expect(commandTypes().length).toBeGreaterThan(0);
        expect(distinctExampleTypes.sort()).toEqual(commandTypes().sort());
    });
});

describe("the protocol's queries", () => {

    it.each(exampleFiles(QUERY_EXAMPLES))("reads the query %s, which the simulation accepts, and writes it back to identical bytes",
        (file) => {
            expectRoundTrip(join(QUERY_EXAMPLES, file), (wire) => {
                const query: unknown = JSON.parse(wire);
                expect(queryRejection(query, MAP_WIDTH, MAP_HEIGHT)).toBeNull();
                return JSON.stringify(query);
            });
        });

    it("has an example of every query type", () => {
        const exampleTypes = exampleFiles(QUERY_EXAMPLES).map((file) => JSON.parse(readWireText(join(QUERY_EXAMPLES, file))).type);
        const distinctExampleTypes = exampleTypes.filter((type, i) => exampleTypes.indexOf(type) === i);

        expect(queryTypes().length).toBeGreaterThan(0);
        expect(distinctExampleTypes.sort()).toEqual(queryTypes().sort());
    });
});

// Each record type, written by the simulation's own code from an evaluation holding the example's fields
const RECORD_WRITERS: Record<string, (wire: string) => string> = {
    evaluation: (wire) => {
        const example: EvaluationRecord = JSON.parse(wire);
        const evaluation: EvaluationSource = {
            cityYes: example.approval,
            cityPop: example.population,
            cityPopDelta: example.migration,
            cityAssessedValue: example.assessedValue,
            cityClass: example.cityClass,
            cityScore: example.score,
            cityScoreDelta: example.scoreDelta,
            cityScoreBreakdown: example.scoreBreakdown,
            getProblemNumber: (place) => example.problems[place] ?? null,
        };
        return JSON.stringify(evaluationRecord(evaluation, example.level));
    },
    budget: (wire) => {
        const example: BudgetRecord = JSON.parse(wire);
        const budget: BudgetSource = {
            cityTax: example.taxRate,
            taxFund: example.taxesCollected,
            totalFunds: example.funds,
            maintenance: () => example.maintenance,
            percents: () => example.funding,
        };
        return JSON.stringify(budgetRecord(budget));
    },
    settings: (wire) => {
        const example: SettingsRecord = JSON.parse(wire);
        const simulation: SettingsSource = {
            budget: {autoBudget: example.autoBudget},
            disasterManager: {disastersEnabled: example.disasters},
            getSpeed: () => example.speed,
        };
        return JSON.stringify(settingsRecord(simulation));
    },
};

describe("the protocol's records", () => {

    it.each(exampleFiles(RECORD_EXAMPLES))("writes the record %s back to identical bytes", (file) => {
        expectRoundTrip(join(RECORD_EXAMPLES, file), (wire) => RECORD_WRITERS[JSON.parse(wire).type](wire));
    });

    it("has an example of every record type and no other", () => {
        const exampleTypes = exampleFiles(RECORD_EXAMPLES).map((file) => JSON.parse(readWireText(join(RECORD_EXAMPLES, file))).type);

        expect(Object.keys(RECORD_WRITERS).sort()).toEqual(recordTypes().sort());
        expect(exampleTypes.sort()).toEqual(recordTypes().sort());
    });
});

// A value's fields, in order, down through objects and the first item of each list, as text
function shapeOf(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.length === 0 ? "" : shapeOf(value[0])}]`;
    }

    if (value !== null && typeof value === "object") {
        return `{${Object.entries(value).map(([key, field]) => `${key}: ${shapeOf(field)}`).join(", ")}}`;
    }

    return value === null ? "null" : typeof value;
}

describe("the protocol's answers", () => {

    // An answer of each type, as the simulation writes it, about a city with residents or before any city has started
    const city = buildCity(1, 1);
    const ANSWERS: Record<string, () => unknown> = {
        overlay: () => city.answerQuery({type: "overlay", layer: "crime"}),
        tileReport: () => city.answerQuery({type: "tileReport", x: 29, y: 14}),
        budgetForecast: () => city.answerQuery({type: "budgetForecast", road: 40, fire: 100}),
        mapPreview: () => answerQueryWithoutCity({type: "mapPreview", seed: 2026}),
        rejected: () => city.answerQuery({type: "mapPreview", seed: -1}),
    };

    it("has an example of every answer type and no other", () => {
        const exampleTypes = exampleFiles(ANSWER_EXAMPLES).map((file) => JSON.parse(readWireText(join(ANSWER_EXAMPLES, file))).type);

        expect(Object.keys(ANSWERS).sort()).toEqual(queryAnswerTypes().sort());
        expect(exampleTypes.sort()).toEqual(queryAnswerTypes().sort());
    });

    it.each(exampleFiles(ANSWER_EXAMPLES))("is written by the simulation with the fields of the example %s, in order", (file) => {
        const example = JSON.parse(readWireText(join(ANSWER_EXAMPLES, file))) as {type: string};

        expect(shapeOf(ANSWERS[example.type]())).toBe(shapeOf(example));
    });
});

describe("the protocol's state messages", () => {

    const exampleTypes = () => exampleFiles(STATE_EXAMPLES)
        .map((file) => JSON.parse(readWireText(join(STATE_EXAMPLES, file))).type as string);

    // A record is a state message too, whose examples are the records'
    it("has an example of every state message type, the records' among the records", () => {
        const types = exampleTypes().filter((type, i, all) => all.indexOf(type) === i);

        expect(types.filter((type) => recordTypes().includes(type))).toEqual([]);
        expect([...types, ...recordTypes()].sort()).toEqual(stateMessageTypes().sort());
    });

    // What city hosts publish over a year and a half of a town with residents, auto-budget off, a monster, a tornado, a
    // fire, an earthquake, which the news shows, and a road, and of a new city, whose advisor asks for zones
    let published: StateMessage[];
    beforeAll(() => {
        const town = hostedCity();
        town.host.start({save: SaveFormat.serialise({...plainSavedState(buildCity(1, 1)), name: "Town"})});
        town.host.hold();
        town.host.send(LOCAL_PLAYER, {type: "setAutoBudget", on: false});
        town.host.send(LOCAL_PLAYER, {type: "triggerDisaster", kind: "monster"});
        town.host.send(LOCAL_PLAYER, {type: "triggerDisaster", kind: "tornado"});
        town.host.send(LOCAL_PLAYER, {type: "triggerDisaster", kind: "fire"});
        town.host.send(LOCAL_PLAYER, {type: "triggerDisaster", kind: "earthquake"});
        town.host.send(LOCAL_PLAYER, {type: "tool", tool: "road", path: [{x: 40, y: 52}, {x: 41, y: 52}],
                                      autoBulldoze: true});
        for (let taken = 0; taken < YEAR * 1.5; taken += 16) {
            expect(town.host.advance(16).error).toBeNull();
        }

        const newCity = hostedCity();
        newCity.host.start({name: "New", seed: 1, level: 0});
        newCity.host.hold();
        expect(newCity.host.advance(YEAR).error).toBeNull();

        published = [...town.published, ...newCity.published];
    });

    // News about a place the TV neither shows nor follows is high pollution's, which neither city reaches, so it is
    // written straight from the simulation's news
    const PLACE_NEWS = "news-place.json";

    it.each(exampleFiles(STATE_EXAMPLES).filter((file) => file !== PLACE_NEWS))(
        "is written by the city host with the fields of the example %s, in order", (file) => {
            const example = JSON.parse(readWireText(join(STATE_EXAMPLES, file))) as StateMessage;
            const ofType = published.filter((message) => message.type === example.type).map(shapeOf);

            expect(ofType).toContain(shapeOf(example));
        });

    it(`writes news about a place with the fields of the example ${PLACE_NEWS}, in order`, () => {
        const example = JSON.parse(readWireText(join(STATE_EXAMPLES, PLACE_NEWS))) as NewsMessage;

        expect(JSON.stringify(newsMessage({subject: example.subject, data: example.data as NewsPlace})))
            .toBe(JSON.stringify(example));
    });
});

// Reads the example, writes it back, and expects the same bytes
function expectRoundTrip(path: string, readAndWrite: (wire: string) => string): void {
    const written = readAndWrite(readWireText(path));

    // Both comparisons are needed: the text one shows a readable difference, and the byte one also covers the final
    // newline and the encoding
    expect(written).toBe(readWireText(path));
    expect(Buffer.from(written + "\n", "utf8").equals(readFileSync(path))).toBe(true);
}
