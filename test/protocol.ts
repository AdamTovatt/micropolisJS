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

import {
    clientMessageTypes, commandTypes, cursorReport, parseErrorResponse, parsePlayerResponse, parseServerMessage,
    parseSessionResponse, queryAnswerTypes, queryTypes, recordTypes, serverMessageTypes, signInRequest,
    stateMessageTypes,
} from "../src/protocol";
import { repositoryPath } from "./helpers/repository";

// The examples and reader cases are shared with the server's tests: protocol/README.md describes them
const SOCKET_EXAMPLES = repositoryPath("protocol/examples/socket");
const CLIENT_EXAMPLES = repositoryPath("protocol/examples/client");
const SESSION_EXAMPLES = repositoryPath("protocol/examples/session");
const COMMAND_EXAMPLES = repositoryPath("protocol/examples/commands");
const QUERY_EXAMPLES = repositoryPath("protocol/examples/queries");
const RECORD_EXAMPLES = repositoryPath("protocol/examples/records");
const STATE_EXAMPLES = repositoryPath("protocol/examples/state");
const ANSWER_EXAMPLES = repositoryPath("protocol/examples/answers");

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

    // The client writes a command as plain JSON, so writing it back pins the example's wire text. ProtocolTests checks
    // that the server accepts each one.
    it.each(exampleFiles(COMMAND_EXAMPLES))("reads the command %s and writes it back to identical bytes", (file) => {
        expectRoundTrip(join(COMMAND_EXAMPLES, file), (wire) => JSON.stringify(JSON.parse(wire)));
    });

    it("has an example of every command type", () => {
        const exampleTypes = exampleFiles(COMMAND_EXAMPLES).map((file) => JSON.parse(readWireText(join(COMMAND_EXAMPLES, file))).type);
        const distinctExampleTypes = exampleTypes.filter((type, i) => exampleTypes.indexOf(type) === i);

        expect(commandTypes().length).toBeGreaterThan(0);
        expect(distinctExampleTypes.sort()).toEqual(commandTypes().sort());
    });
});

describe("the protocol's queries", () => {

    // As a command's, and ProtocolTests checks that the server accepts each one
    it.each(exampleFiles(QUERY_EXAMPLES))("reads the query %s and writes it back to identical bytes", (file) => {
        expectRoundTrip(join(QUERY_EXAMPLES, file), (wire) => JSON.stringify(JSON.parse(wire)));
    });

    it("has an example of every query type", () => {
        const exampleTypes = exampleFiles(QUERY_EXAMPLES).map((file) => JSON.parse(readWireText(join(QUERY_EXAMPLES, file))).type);
        const distinctExampleTypes = exampleTypes.filter((type, i) => exampleTypes.indexOf(type) === i);

        expect(queryTypes().length).toBeGreaterThan(0);
        expect(distinctExampleTypes.sort()).toEqual(queryTypes().sort());
    });
});

// ProtocolTests checks that the server writes each record, answer and state message as its examples have it

describe("the protocol's records", () => {

    it("has an example of every record type and no other", () => {
        const exampleTypes = exampleFiles(RECORD_EXAMPLES).map((file) => JSON.parse(readWireText(join(RECORD_EXAMPLES, file))).type);

        expect(recordTypes().length).toBeGreaterThan(0);
        expect(exampleTypes.sort()).toEqual(recordTypes().sort());
    });
});

describe("the protocol's answers", () => {

    it("has an example of every answer type and no other", () => {
        const exampleTypes = exampleFiles(ANSWER_EXAMPLES).map((file) => JSON.parse(readWireText(join(ANSWER_EXAMPLES, file))).type);

        expect(queryAnswerTypes().length).toBeGreaterThan(0);
        expect(exampleTypes.sort()).toEqual(queryAnswerTypes().sort());
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
});

// Reads the example, writes it back, and expects the same bytes
function expectRoundTrip(path: string, readAndWrite: (wire: string) => string): void {
    const written = readAndWrite(readWireText(path));

    // Both comparisons are needed: the text one shows a readable difference, and the byte one also covers the final
    // newline and the encoding
    expect(written).toBe(readWireText(path));
    expect(Buffer.from(written + "\n", "utf8").equals(readFileSync(path))).toBe(true);
}
