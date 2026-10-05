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

import { readdirSync } from "fs";
import type { CommandLog } from "./helpers/commandLog";
import { repositoryJson, repositoryPath } from "./helpers/repository";
import { canonicalJson, gameSaveHash, hashSavedState } from "./helpers/stateHash";

// The cases conformance/canonicalJson.json holds, which the C# tests read too: a number by its IEEE double's bits, a
// string by its UTF-16 code units, and a document by its JSON, each with its canonical text
interface CanonicalCases {
    numbers: {bits: string, text: string}[];
    strings: {codeUnits: number[], text: string}[];
    documents: {json: string, text: string}[];
}

const CASES = repositoryJson<CanonicalCases>("conformance/canonicalJson.json");

function numberOfBits(bits: string): number {
    const view = new DataView(new ArrayBuffer(8));
    view.setBigUint64(0, BigInt(bits));
    return view.getFloat64(0);
}

describe("the canonical text of the conformance cases", () => {

    it.each([
        ["numbers", CASES.numbers.map(({bits, text}) => ({value: numberOfBits(bits), text}))],
        ["strings", CASES.strings.map(({codeUnits, text}) => ({value: String.fromCharCode(...codeUnits), text}))],
        ["documents", CASES.documents.map(({json, text}) => ({value: JSON.parse(json) as unknown, text}))],
    ])("is the text the file gives for each of its %s", (_, cases) => {
        expect(cases.length).toBeGreaterThan(0);
        const wrong = cases.map(({value, text}) => ({value, expected: text, actual: canonicalJson(value)}))
            .filter(({expected, actual}) => actual !== expected);

        expect(wrong).toEqual([]);
    });
});

// The cases docs/state-hash.md specifies, which CanonicalJson in the C# rules reproduces
describe("the canonical text", () => {

    it("sorts keys by UTF-16 code unit at every level, with no whitespace", () => {
        expect(canonicalJson({b: 1, a: {d: [3, {f: 1, e: 2}], c: null}, B: true, _z: false}))
            .toBe('{"B":true,"_z":false,"a":{"c":null,"d":[3,{"e":2,"f":1}]},"b":1}');
    });

    it("writes numbers in their shortest round-trip form", () => {
        expect(canonicalJson([0, -7, 1200, 16.8, 0.1 * 3, 0.007, 1e21, 1.5e-7, 123456789012, -0.5]))
            .toBe("[0,-7,1200,16.8,0.30000000000000004,0.007,1e+21,1.5e-7,123456789012,-0.5]");
    });

    it("writes negative zero as 0", () => {
        expect(canonicalJson(-0)).toBe("0");
    });

    it("escapes strings as JSON.stringify does", () => {
        expect(canonicalJson(["a\"b\\c", "\b\f\n\r\t", "\u0001\u001f", "\ud800", "é→😀"]))
            .toBe('["a\\"b\\\\c","\\b\\f\\n\\r\\t","\\u0001\\u001f","\\ud800","é→😀"]');
    });

    it.each([
        ["undefined", {a: undefined}, "the state.a"],
        ["NaN", [NaN], "the state[0]"],
        ["an infinity", {a: [1, Infinity]}, "the state.a[1]"],
        ["a function", {a: () => 1}, "the state.a"],
        ["an object that isn't plain data", {a: new Date(0)}, "the state.a"],
        ["an array with a hole", Object.assign(new Array(3), {0: 1, 2: 3}), "the state[1]"],
    ])("rejects %s, naming where it is", (_, value, path) => {
        expect(() => canonicalJson(value)).toThrow(`Cannot canonicalize ${path}`);
    });

    it("accepts objects with no prototype", () => {
        const object = Object.create(null);
        object.a = 1;
        expect(canonicalJson(object)).toBe('{"a":1}');
    });
});

describe("the state hash", () => {

    it("is the SHA-256 of the canonical text's UTF-8 bytes, in lowercase hexadecimal", () => {
        // sha256 of the bytes {"a":"é","b":1}, computed with coreutils' sha256sum
        expect(hashSavedState({b: 1, a: "é"})).toBe("aa58fba8483623bed37c1b02edfccbdd9a53123837c20bfa4cb4049993a2872e");
    });
});

// Each fixture's saves as the C# rules wrote them to conformance/saves/, with the checkpoints its log holds there: its
// first as built and its last after its run
const FIXTURE_SAVES = readdirSync(repositoryPath("conformance/saves")).map((file) => {
    const [fixture, point] = file.split(".");
    const checkpoints = repositoryJson<CommandLog>(`conformance/logs/${fixture}.log.json`).checkpoints;
    return {file, checkpoint: point === "built" ? checkpoints[0] : checkpoints[checkpoints.length - 1]};
});

describe("the state hash of a fixture's save", () => {

    it.each(FIXTURE_SAVES)("is its log's checkpoint, for $file", ({file, checkpoint}) => {
        expect(hashSavedState(repositoryJson<object>(`conformance/saves/${file}`))).toBe(checkpoint.hash);
    });
});

describe("the state hash of a game's save", () => {

    it("is the hash of the save without the city's name and the save version", () => {
        expect(gameSaveHash({name: "Town", version: 9, b: 1, a: "é"})).toBe(hashSavedState({b: 1, a: "é"}));
    });

    it.each([["name", {version: 9, a: 1}], ["version", {name: "Town", a: 1}]])(
        "is refused for a save without its %s", (key, save) => {
            expect(() => gameSaveHash(save)).toThrow(`this one lacks ${key}`);
        });
});
