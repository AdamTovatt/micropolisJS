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

import { repositoryPath } from "./repository";

// The random stream's reference vectors, shared with the C# port: conformance/README.md describes them. Every list
// is checked non-empty, so a vector the file lost fails here rather than passing over nothing.

// The vectors' shape, with seeds and 32-bit words as the file writes them (hex strings) or as numbers
interface Vectors<Word> {
    seeds: {seed: Word; seeded: Word[]; outputs: Word[]; jumped: Word[]}[];
    getRandom: {seed: Word; callsPerMaximum: number; maxima: number[]; outputs: number[]};
    getRandomAtTheBoundary: {seed: Word; maximum: number; outputs: number[]};
    getRandom16Signed: {seed: Word; outputs: number[]};
    getERandom: {seed: Word; maximum: number; outputs: number[]};
    getChance: {seed: Word; mask: number; outputs: boolean[]};
}

export type RandomVectors = Vectors<number>;
export type RandomVectorsFile = Vectors<string>;

function word(text: string): number {
    if (!/^0x[0-9a-f]{8}$/.test(text)) {
        throw new Error(`A reference word must be 0x and eight lowercase hex digits, got ${text}`);
    }

    return Number(text);
}

function words(texts: string[], expectedLength?: number): number[] {
    if (texts.length === 0 || (expectedLength !== undefined && texts.length !== expectedLength)) {
        throw new Error(`Expected ${expectedLength ?? "some"} reference words, got ${texts.length}`);
    }

    return texts.map(word);
}

// A section with its seed read, once each of its lists is found non-empty
function withSeed<Section extends {seed: string}>(name: string, section: Section | undefined):
        Omit<Section, "seed"> & {seed: number} {
    if (section === undefined) {
        throw new Error(`The reference vectors have no ${name}`);
    }

    Object.entries(section).forEach(([key, value]) => {
        if (Array.isArray(value) && value.length === 0) {
            throw new Error(`The reference vector ${name}.${key} is empty`);
        }
    });

    return {...section, seed: word(section.seed)};
}

export function parseRandomVectors(text: string): RandomVectors {
    const file: RandomVectorsFile = JSON.parse(text);

    if (!Array.isArray(file.seeds) || file.seeds.length === 0) {
        throw new Error("The reference vectors have no seeds");
    }

    return {
        seeds: file.seeds.map((vector) => ({
            seed: word(vector.seed),
            seeded: words(vector.seeded, 4),
            outputs: words(vector.outputs),
            jumped: words(vector.jumped, 4),
        })),
        getRandom: withSeed("getRandom", file.getRandom),
        getRandomAtTheBoundary: withSeed("getRandomAtTheBoundary", file.getRandomAtTheBoundary),
        getRandom16Signed: withSeed("getRandom16Signed", file.getRandom16Signed),
        getERandom: withSeed("getERandom", file.getERandom),
        getChance: withSeed("getChance", file.getChance),
    };
}

export function loadRandomVectors(): RandomVectors {
    return parseRandomVectors(readFileSync(repositoryPath("conformance/random.json"), "utf8"));
}
