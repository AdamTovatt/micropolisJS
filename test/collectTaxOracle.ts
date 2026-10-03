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

import { Budget } from "../src/budget.js";
import { lcg } from "./helpers/lcg";
import { differences as firstDifferences, outcomeDifference } from "./helpers/oracle";

// The original's collectTax, from simulate.cpp in its MicropolisEngine, as far as it works out the year's figures,
// transcribed with each C type's arithmetic made explicit, as the oracle the port is compared with below: float
// arithmetic rounds every operation to 32 bits (Math.fround), a (long) of a float drops the fraction, and the shorts,
// ints and Quads are whole numbers. One thing follows the port rather than simulate.cpp: the cash flow is kept whole,
// where the original's short wraps.

const f = Math.fround;

const R_LEVELS = [f(0.7), f(0.9), f(1.2)];
const F_LEVELS = [f(1.4), f(1.2), f(0.8)];

// What collectTax reads
interface Figures {
    gameLevel: number;
    cityTax: number;
    totalPop: number;
    landValueAverage: number;
    roadTotal: number;
    railTotal: number;
    policeStationPop: number;
    fireStationPop: number;
}

// What it works out
interface Outcome {
    policeMaintenanceBudget: number;
    fireMaintenanceBudget: number;
    roadMaintenanceBudget: number;
    taxFund: number;
    cashFlow: number;
}

function originalCollectTax(figures: Figures): Outcome {
    const {gameLevel, cityTax, totalPop, landValueAverage, roadTotal, railTotal} = figures;

    const policeFund = figures.policeStationPop * 100;
    const fireFund = figures.fireStationPop * 100;
    const roadFund = Math.trunc(f(f(roadTotal + railTotal * 2) * R_LEVELS[gameLevel]));
    const taxFund = Math.trunc(f(f(Math.trunc(totalPop * landValueAverage / 120) * cityTax) * F_LEVELS[gameLevel]));
    const cashFlow = totalPop > 0 ? taxFund - (policeFund + fireFund + roadFund) : 0;

    return {policeMaintenanceBudget: policeFund, fireMaintenanceBudget: fireFund, roadMaintenanceBudget: roadFund,
            taxFund, cashFlow};
}

function portCollectTax(figures: Figures): Outcome {
    const budget = new Budget();
    budget.cityTax = figures.cityTax;
    // Enough for the year end, which collectTax runs, to fund every service
    budget.totalFunds = 1000000000;

    budget.collectTax(figures.gameLevel, figures);

    return {
        policeMaintenanceBudget: budget.policeMaintenanceBudget, fireMaintenanceBudget: budget.fireMaintenanceBudget,
        roadMaintenanceBudget: budget.roadMaintenanceBudget, taxFund: budget.taxFund, cashFlow: budget.cashFlow,
    };
}

// The first few figures the two differ for
function differences(cases: Figures[]): string[] {
    return firstDifferences(cases, (figures) =>
        outcomeDifference(originalCollectTax(figures), portCollectTax(figures), figures));
}

// A city with nothing to tax or maintain but what is given
const city = (figures: Partial<Figures>): Figures => ({
    gameLevel: 0, cityTax: 7, totalPop: 0, landValueAverage: 0, roadTotal: 0, railTotal: 0, policeStationPop: 0,
    fireStationPop: 0, ...figures,
});

describe("the tax collection, against the original's", () => {

    it("matches simulate.cpp's collectTax for random cities", () => {
        const next = lcg(1);
        const cases = Array.from({length: 20000}, () => city({
            gameLevel: next(3), cityTax: next(21), totalPop: next(10) === 0 ? 0 : next(10000),
            landValueAverage: next(251), roadTotal: next(3000), railTotal: next(1000), policeStationPop: next(20),
            fireStationPop: next(20),
        }));

        expect(differences(cases)).toEqual([]);
    });

    // A product with a float multiplier parts from the double's when the double lands on a whole number and the float
    // just below it, or the other way about, which random cities seldom hit
    it("matches simulate.cpp's road maintenance for every road and rail total up to 3000, at every level", () => {
        const cases: Figures[] = [];
        for (let gameLevel = 0; gameLevel <= 2; gameLevel++) {
            for (let roadTotal = 0; roadTotal <= 3000; roadTotal++) {
                cases.push(city({gameLevel, roadTotal}), city({gameLevel, roadTotal, railTotal: roadTotal >> 2}));
            }
        }

        expect(differences(cases)).toEqual([]);
    });

    it("matches simulate.cpp's tax for every tax base up to 3000, at every level and rate", () => {
        const cases: Figures[] = [];
        for (let gameLevel = 0; gameLevel <= 2; gameLevel++) {
            for (let cityTax = 0; cityTax <= 20; cityTax++) {
                // A land value of 120 makes the tax base the population
                for (let totalPop = 1; totalPop <= 3000; totalPop++) {
                    cases.push(city({gameLevel, cityTax, totalPop, landValueAverage: 120}));
                }
            }
        }

        expect(differences(cases)).toEqual([]);
    });
});
