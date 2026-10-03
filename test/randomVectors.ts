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

import { readFileSync } from "fs";

import { parseRandomVectors, RandomVectorsFile } from "./helpers/randomVectors";
import { repositoryPath } from "./helpers/repository";

// The guards in the vector reader, so the random stream's tests cannot pass over vectors the file lost

const fileText = readFileSync(repositoryPath("conformance/random.json"), "utf8");

type Change = (file: RandomVectorsFile) => void;

// The shared file with one change
function broken(change: Change): string {
    const file: RandomVectorsFile = JSON.parse(fileText);
    change(file);
    return JSON.stringify(file);
}

const brokenFiles: [string, Change, string][] = [
    ["no seeds", (file) => { file.seeds = []; }, "no seeds"],
    ["a seed with no outputs", (file) => { file.seeds[0].outputs = []; }, "reference words"],
    ["a state of three words", (file) => { file.seeds[1].jumped.pop(); }, "Expected 4"],
    ["a word in upper case", (file) => { file.seeds[2].seeded[0] = "0x2FEB6E95"; }, "eight lowercase hex digits"],
    ["a decimal seed", (file) => { file.getRandom.seed = "42"; }, "eight lowercase hex digits"],
    ["no getRandom outputs", (file) => { file.getRandom.outputs = []; }, "getRandom.outputs is empty"],
    ["no getChance outputs", (file) => { file.getChance.outputs = []; }, "getChance.outputs is empty"],
    ["no getERandom section", (file) => { Reflect.deleteProperty(file, "getERandom"); }, "no getERandom"],
];

describe("the reference vector reader", () => {

    it("reads the shared file", () => {
        const vectors = parseRandomVectors(fileText);

        expect(vectors.seeds[0].seeded).toHaveLength(4);
        expect(vectors.getChance.seed).toBe(42);
    });

    it.each(brokenFiles)("rejects a file with %s", (_, change, message) => {
        expect(() => parseRandomVectors(broken(change))).toThrow(message);
    });
});
