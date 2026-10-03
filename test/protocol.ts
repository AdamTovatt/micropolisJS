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
import { commandRejection } from "../src/commands";
import { evaluationRecord, type EvaluationSource } from "../src/evaluationRecord";
import {
    type BudgetRecord, commandTypes, type EvaluationRecord, parseErrorResponse, parsePlayerResponse, parseServerMessage,
    parseSessionResponse, queryTypes, recordTypes, serverMessageTypes, type SettingsRecord, signInRequest,
} from "../src/protocol";
import { queryRejection } from "../src/queries";
import { settingsRecord, type SettingsSource } from "../src/settingsRecord";
import { repositoryPath } from "./helpers/repository";

// The examples and reader cases are shared with the server's tests: protocol/README.md describes them
const SOCKET_EXAMPLES = repositoryPath("protocol/examples/socket");
const SESSION_EXAMPLES = repositoryPath("protocol/examples/session");
const COMMAND_EXAMPLES = repositoryPath("protocol/examples/commands");
const QUERY_EXAMPLES = repositoryPath("protocol/examples/queries");
const RECORD_EXAMPLES = repositoryPath("protocol/examples/records");

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

// Reads the example, writes it back, and expects the same bytes
function expectRoundTrip(path: string, readAndWrite: (wire: string) => string): void {
    const written = readAndWrite(readWireText(path));

    // Both comparisons are needed: the text one shows a readable difference, and the byte one also covers the final
    // newline and the encoding
    expect(written).toBe(readWireText(path));
    expect(Buffer.from(written + "\n", "utf8").equals(readFileSync(path))).toBe(true);
}
