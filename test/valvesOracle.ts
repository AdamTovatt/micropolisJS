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

import { Valves } from "../src/valves.js";
import { lcg } from "./helpers/lcg";
import { differences as firstDifferences, outcomeDifference } from "./helpers/oracle";

// The original's setValves, from simulate.cpp in its MicropolisEngine, transcribed with each C type's arithmetic made
// explicit, as the oracle the port is compared with below: float arithmetic rounds every operation to 32 bits
// (Math.fround), the shorts and ints are whole numbers, and a (short) of a float drops the fraction (Math.trunc). One
// thing follows the port rather than simulate.cpp: its resRatio = min(indRatio, indRatioMax), a slip the 1989 C doesn't
// make, which the port leaves out, clamping each ratio on its own.

const f = Math.fround;

const TAX_TABLE = [200, 150, 120, 100, 80, 50, 30, 0, -10, -40, -100, -150, -200, -250, -300, -350, -400, -450, -500,
                   -550, -600];
const EXT_MARKET_PARAM_TABLE = [f(1.2), f(1.1), f(0.98)];

// What setValves reads and writes
interface Figures {
    gameLevel: number;
    cityTax: number;
    resPop: number;
    comPop: number;
    indPop: number;
    // The previous census's populations, the histories' entries at 1
    resHist: number;
    comHist: number;
    indHist: number;
    resValve: number;
    comValve: number;
    indValve: number;
    resCap: boolean;
    comCap: boolean;
    indCap: boolean;
}

interface Outcome {
    totalPop: number;
    resValve: number;
    comValve: number;
    indValve: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function originalSetValves(figures: Figures): Outcome {
    const {gameLevel, cityTax, resPop, comPop, indPop, resHist, comHist, indHist} = figures;

    const normalizedResPop = f(f(resPop) / f(8));
    const totalPop = Math.trunc(f(f(normalizedResPop + comPop) + indPop));

    const employment = resPop > 0 ? f(f(comHist + indHist) / normalizedResPop) : f(1);
    const migration = f(normalizedResPop * f(employment - 1));
    const births = f(normalizedResPop * f(0.02));
    const projectedResPop = f(f(normalizedResPop + migration) + births);

    const temp = f(comHist + indHist);
    let laborBase = temp > 0.0 ? f(f(resHist) / temp) : f(1);
    laborBase = clamp(laborBase, f(0.0), f(1.3));

    const internalMarket = f(f(f(normalizedResPop + comPop) + indPop) / f(3.7));
    const projectedComPop = f(internalMarket * laborBase);
    let projectedIndPop = f(f(indPop * laborBase) * EXT_MARKET_PARAM_TABLE[gameLevel]);
    projectedIndPop = Math.max(projectedIndPop, f(5.0));

    let resRatio = normalizedResPop > 0 ? f(projectedResPop / normalizedResPop) : f(1.3);
    let comRatio = comPop > 0 ? f(projectedComPop / comPop) : projectedComPop;
    let indRatio = indPop > 0 ? f(projectedIndPop / indPop) : projectedIndPop;

    resRatio = Math.min(resRatio, f(2));
    comRatio = Math.min(comRatio, f(2));
    indRatio = Math.min(indRatio, f(2));

    const z = Math.min(cityTax + gameLevel, 20);
    resRatio = f(f(f(resRatio - 1) * f(600)) + TAX_TABLE[z]);
    comRatio = f(f(f(comRatio - 1) * f(600)) + TAX_TABLE[z]);
    indRatio = f(f(f(indRatio - 1) * f(600)) + TAX_TABLE[z]);

    let resValve = clamp(figures.resValve + Math.trunc(resRatio), -2000, 2000);
    let comValve = clamp(figures.comValve + Math.trunc(comRatio), -1500, 1500);
    let indValve = clamp(figures.indValve + Math.trunc(indRatio), -1500, 1500);

    if (figures.resCap && resValve > 0) resValve = 0;
    if (figures.comCap && comValve > 0) comValve = 0;
    if (figures.indCap && indValve > 0) indValve = 0;

    return {totalPop, resValve, comValve, indValve};
}

// A history whose entry at 1 is the given population
const history = (previous: number) => Array.from({length: 120}, (_, i) => (i === 1 ? previous : 0));

function portSetValves(figures: Figures): Outcome {
    const valves = new Valves();
    Object.assign(valves, {
        resValve: figures.resValve, comValve: figures.comValve, indValve: figures.indValve,
        resCap: figures.resCap, comCap: figures.comCap, indCap: figures.indCap,
    });
    const census = {
        resPop: figures.resPop, comPop: figures.comPop, indPop: figures.indPop, totalPop: 0,
        resHist10: history(figures.resHist), comHist10: history(figures.comHist), indHist10: history(figures.indHist),
    };

    valves.setValves(figures.gameLevel, census, {cityTax: figures.cityTax});

    return {totalPop: census.totalPop, resValve: valves.resValve, comValve: valves.comValve, indValve: valves.indValve};
}

// The first few figures the two differ for
function differences(cases: Figures[]): string[] {
    return firstDifferences(cases, (figures) =>
        outcomeDifference(originalSetValves(figures), portSetValves(figures), figures));
}

// A census of a random city, each figure in a short's range, as the original keeps them, some at zero
function randomFigures(next: (limit: number) => number): Figures {
    const population = (limit: number) => (next(10) === 0 ? 0 : next(limit));

    return {
        gameLevel: next(3), cityTax: next(21),
        resPop: population(30000), comPop: population(3000), indPop: population(3000),
        resHist: population(4000), comHist: population(3000), indHist: population(3000),
        resValve: next(4001) - 2000, comValve: next(3001) - 1500, indValve: next(3001) - 1500,
        resCap: next(5) === 0, comCap: next(5) === 0, indCap: next(5) === 0,
    };
}

describe("the demand valves, against the original's", () => {

    it("match simulate.cpp's setValves for random cities", () => {
        const next = lcg(1);
        const cases = Array.from({length: 20000}, () => randomFigures(next));

        expect(differences(cases)).toEqual([]);
    });

    // Small towns, where a fraction of a person moves a ratio most, for every tax rate and level
    it("match simulate.cpp's setValves for every small town", () => {
        const cases: Figures[] = [];
        for (let resPop = 0; resPop <= 64; resPop += 4) {
            for (let comPop = 0; comPop <= 6; comPop++) {
                for (let indPop = 0; indPop <= 6; indPop++) {
                    for (let cityTax = 0; cityTax <= 20; cityTax += 4) {
                        for (let gameLevel = 0; gameLevel <= 2; gameLevel++) {
                            cases.push({
                                gameLevel, cityTax, resPop, comPop, indPop, resHist: resPop >> 3, comHist: comPop,
                                indHist: indPop, resValve: 0, comValve: 0, indValve: 0,
                                resCap: false, comCap: false, indCap: false,
                            });
                        }
                    }
                }
            }
        }

        expect(differences(cases)).toEqual([]);
    });
});
