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

import { forecastYear, nothingWanted, payServices, serviceSpend } from "../src/yearEndBudget";

describe("serviceSpend", () => {

    it("should charge the full maintenance cost at full funding", () => {
        expect(serviceSpend(240, 1)).toBe(240);
    });

    it("should round halves up", () => {
        expect(serviceSpend(101, 0.5)).toBe(51);
    });

    it("should round the product of maintenance and fraction", () => {
        // 25 * 0.58 is 14.499999999999998, where 25 * 58 / 100 would be exactly 14.5 and round to 15
        expect(serviceSpend(25, 58 / 100)).toBe(14);
    });

    it("should charge nothing at zero funding", () => {
        expect(serviceSpend(240, 0)).toBe(0);
    });
});

describe("payServices", () => {

    it("should pay every service in full when the cash covers them", () => {
        expect(payServices(1000, { road: 100, fire: 200, police: 300 }))
            .toEqual({ road: 100, fire: 200, police: 300 });
    });

    it("should pay roads first, then fire, then police, out of the cash there is", () => {
        expect(payServices(150, { road: 100, fire: 100, police: 200 }))
            .toEqual({ road: 100, fire: 50, police: 0 });
    });

    it("should pay part of the roads when the cash can't cover them", () => {
        expect(payServices(60, { road: 100, fire: 100, police: 100 }))
            .toEqual({ road: 60, fire: 0, police: 0 });
    });

    it("should charge $1 per service when nothing is wanted", () => {
        expect(payServices(0, { road: 0, fire: 0, police: 0 }))
            .toEqual({ road: 1, fire: 1, police: 1 });
    });

    it("should charge only what is wanted when any one service wants money", () => {
        expect(payServices(1000, { road: 0, fire: 100, police: 0 }))
            .toEqual({ road: 0, fire: 100, police: 0 });
    });
});

describe("nothingWanted", () => {

    it("should hold only when every service wants nothing", () => {
        expect(nothingWanted({ road: 0, fire: 0, police: 0 })).toBe(true);
        expect(nothingWanted({ road: 0, fire: 0, police: 1 })).toBe(false);
        expect(nothingWanted({ road: 0, fire: 1, police: 0 })).toBe(false);
        expect(nothingWanted({ road: 1, fire: 0, police: 0 })).toBe(false);
    });
});

describe("forecastYear", () => {

    const fullFunding = { road: 1, fire: 1, police: 1 };
    const maintenance = { road: 300, fire: 200, police: 100 };

    it("should add taxes and subtract the services when the cash covers them", () => {
        const funds = 10357;
        const taxes = 3000;

        expect(forecastYear(funds, taxes, maintenance, fullFunding))
            .toEqual({ requested: maintenance, fundsChange: 2400, fundsAfterYear: 12757 });
    });

    it("should charge each service at its funding fraction", () => {
        const funds = 1000;
        const taxes = 0;

        expect(forecastYear(funds, taxes, maintenance, { road: 0.5, fire: 0, police: 1 }))
            .toEqual({ requested: { road: 150, fire: 0, police: 100 }, fundsChange: -250, fundsAfterYear: 750 });
    });

    it("should subtract only what the cash can pay", () => {
        // $150 pays the $100 of roads and $50 of the fire department; police goes unpaid
        const funds = 100;
        const taxes = 50;
        const costs = { road: 100, fire: 100, police: 200 };

        expect(forecastYear(funds, taxes, costs, fullFunding))
            .toEqual({ requested: costs, fundsChange: -100, fundsAfterYear: 0 });
    });

    it("should not let funds fall below zero when the $1 per service charge exceeds the cash", () => {
        const funds = 1;
        const taxes = 0;
        const noServices = { road: 0, fire: 0, police: 0 };

        expect(forecastYear(funds, taxes, noServices, fullFunding))
            .toEqual({ requested: noServices, fundsChange: -1, fundsAfterYear: 0 });
    });
});
