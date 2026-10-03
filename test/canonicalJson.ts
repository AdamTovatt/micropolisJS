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

import { canonicalJson } from "../src/canonicalJson";
import { hashSavedState } from "../src/stateHash";

// The cases docs/state-hash.md specifies, which the C# port reproduces

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

    it("is the SHA-256 of the canonical text's UTF-8 bytes, in lowercase hexadecimal", async () => {
        // sha256 of the bytes {"a":"é","b":1}, computed with coreutils' sha256sum
        expect(await hashSavedState({b: 1, a: "é"}))
            .toBe("aa58fba8483623bed37c1b02edfccbdd9a53123837c20bfa4cb4049993a2872e");
    });
});
