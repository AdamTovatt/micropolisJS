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

import * as fs from "fs";
import * as path from "path";
import { cityFromSave, cityFromSeed, Level, SaveData, Speed } from "../headless/city";
import { BenchmarkCase, bytesPerStep, CaseList, caseSave, measureMessageBytes, MeasuredBytes, messageBytes }
  from "../headless/messageBytes";
import { advance } from "../headless/runner";
import { plainSavedState, stateHash } from "../src/stateHash";

const readFile = (file: string) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

// The examples of the files the C# benchmark and this measurement hand each other, which the C# tests read too
const example = (name: string) => JSON.parse(readFile(`server/Micropolis.Benchmarks/examples/${name}`));

const SUBURB: BenchmarkCase = {name: "suburb", speed: "medium", save: "conformance/saves/suburb.run.json",
                               disastersEnabled: true};
const NEW_CITY: BenchmarkCase = {name: "new city (seed 0)", speed: "slow", seed: 0, level: "hard"};

describe("the message bytes", () => {

    it("count each message as the UTF-8 bytes of its JSON text", () => {
        // "é" is two bytes in UTF-8
        expect(messageBytes([{type: "date", month: 1, year: 1900}, {type: "news", subject: "é"}]))
            .toBe('{"type":"date","month":1,"year":1900}'.length + '{"type":"news","subject":"é"}'.length + 1);
    });

    it("start a fixture from its save, with the disasters the case gives", () => {
        const save = caseSave(SUBURB, readFile) as {disasters: {disastersEnabled: boolean}};
        const saved = JSON.parse(readFile("conformance/saves/suburb.run.json"));

        expect(save.disasters.disastersEnabled).toBe(true);
        expect({...save, disasters: saved.disasters}).toEqual(saved);
    });

    it("refuse a fixture saved at another speed than its case's", () => {
        expect(() => caseSave({...SUBURB, speed: "fast"}, readFile))
            .toThrow("conformance/saves/suburb.run.json is saved at medium, but its case runs it at fast");
    });

    it("start a new city on the seed's map, at the level and speed the case names", () => {
        expect(caseSave(NEW_CITY, readFile)).toEqual(plainSavedState(cityFromSeed(0, Level.hard, Speed.slow)));
    });

    it("count only the steps after the warmup, one batch after each", async () => {
        const save = caseSave(SUBURB, readFile);
        const total = async (warmup: number, steps: number) => (await bytesPerStep(save, warmup, steps)).bytesPerStep * steps;

        // A warmup's steps send in one batch what they changed, which counts towards no step after it
        expect(await total(0, 96)).toBeCloseTo(await total(0, 48) + await total(48, 48), 6);
        expect(await total(48, 48)).toBeGreaterThan(0);
    });

    it("give the state hash the city ends at, after the warmup and the steps", async () => {
        const save = caseSave(SUBURB, readFile);
        const city = cityFromSave(save as SaveData);
        advance(city, 48);

        expect((await bytesPerStep(save, 16, 32)).hash).toBe(await stateHash(city));
    });

    it("fail naming why the city stopped", async () => {
        const paused = caseSave(SUBURB, readFile) as {simulation: {speed: number}};
        paused.simulation.speed = Speed.paused;

        await expect(bytesPerStep(paused, 16, 32))
            .rejects.toThrow("The city stopped after 0 of 16 steps: The city is not stepping: it is paused");
    });

    it("measure the example case list into the example's shape", async () => {
        const caseList: CaseList = example("caseList.json");
        const expected: MeasuredBytes = example("messageBytes.json");

        const measured = await measureMessageBytes(caseList, readFile);

        expect(measured).toEqual({...expected, cases: expected.cases.map((measuredCase) => ({
            ...measuredCase, bytesPerStep: expect.any(Number), hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        }))});
    });
});
