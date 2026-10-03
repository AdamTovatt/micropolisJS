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
import { join } from "path";

import { parseServerMessage, serverMessageTypes } from "../src/protocol";
import { repositoryPath } from "./helpers/repository";

// The examples and reader cases are shared with the server's tests: protocol/README.md describes them
const EXAMPLES_DIRECTORY = repositoryPath("protocol/examples");

const exampleFiles = readdirSync(EXAMPLES_DIRECTORY).filter((file) => file.endsWith(".json")).sort();

interface ReaderCases {
    rejected: {case: string; text: string}[];
    accepted: {case: string; text: string; canonical: string}[];
}

const readerCases: ReaderCases = JSON.parse(readFileSync(repositoryPath("protocol/reader-cases.json"), "utf8"));

// One message's exact wire text on one line, then a newline, in UTF-8 without a byte order mark
function readWireText(file: string): string {
    const bytes = readFileSync(join(EXAMPLES_DIRECTORY, file));
    const text = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(bytes);

    if (!text.endsWith("\n") || /[\r\n]/.test(text.slice(0, -1)) || text.startsWith("\uFEFF")) {
        throw new Error(`${file} must be one line of UTF-8 without a byte order mark, ending in a newline`);
    }

    return text.slice(0, -1);
}

describe("the protocol", () => {

    it.each(exampleFiles)("reads %s and writes it back to identical bytes", (file) => {
        const wire = readWireText(file);
        const written = JSON.stringify(parseServerMessage(wire));

        // Both comparisons are needed: the text one shows a readable difference, and the byte one also covers the
        // final newline and the encoding
        expect(written).toBe(wire);
        expect(Buffer.from(written + "\n", "utf8").equals(readFileSync(join(EXAMPLES_DIRECTORY, file)))).toBe(true);
    });

    it("has an example of every server message type", () => {
        const exampleTypes = exampleFiles.map((file) => JSON.parse(readWireText(file)).type);
        const distinctExampleTypes = exampleTypes.filter((type, i) => exampleTypes.indexOf(type) === i);

        expect(serverMessageTypes().length).toBeGreaterThan(0);
        expect(distinctExampleTypes.sort()).toEqual(serverMessageTypes().sort());
    });

    it.each(readerCases.rejected)("rejects a message with $case", ({text}) => {
        expect(() => parseServerMessage(text)).toThrow("Not a server message");
    });

    it.each(readerCases.accepted)("reads a message with $case and writes it in the protocol's order", ({text, canonical}) => {
        expect(JSON.stringify(parseServerMessage(text))).toBe(canonical);
    });
});
