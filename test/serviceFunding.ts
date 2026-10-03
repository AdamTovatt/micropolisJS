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

import {
    costAt, forecastYear, fundEffect, fundServices, fundingPercent, fundingSpend,
} from "../src/serviceFunding";

const fullFunding = { road: 1, fire: 1, police: 1 };
const noFunding = { road: 0, fire: 0, police: 0 };

describe("costAt", () => {

    it("should charge the full maintenance cost at full funding", () => {
        expect(costAt(240, 1)).toBe(240);
    });

    it("should drop the fraction of a dollar, as the original's (int) cast does", () => {
        expect(costAt(101, 0.5)).toBe(50);
    });

    it("should multiply in float, as the original does", () => {
        // In double, 100 * 0.57 is 56.99999999999999; the original's float product is 57
        expect(costAt(100, 0.57)).toBe(57);
    });

    it("should charge nothing at zero funding", () => {
        expect(costAt(240, 0)).toBe(0);
    });
});

describe("fundingPercent", () => {

    it("should store a whole percent as a float, as the original's slider handler does", () => {
        expect(fundingPercent(53)).toBe(Math.fround(0.53));
        expect(fundingPercent(100)).toBe(1);
    });
});

describe("fundingSpend", () => {

    it("should book (maintenance * percent) / 100 in integers", () => {
        expect(fundingSpend(300, 53)).toBe(159);
        expect(fundingSpend(101, 50)).toBe(50);
    });

    it("should book a whole percent of $100 as that many dollars, where the float cost may be a dollar less", () => {
        expect(fundingSpend(100, 53)).toBe(53);
        expect(costAt(100, fundingPercent(53))).toBe(52);
    });
});

describe("fundEffect", () => {

    it("should scale the full effect by the spend over the maintenance cost, dropping the fraction", () => {
        expect(fundEffect(32, 57, 100)).toBe(18);
        expect(fundEffect(1000, 93, 300)).toBe(310);
        expect(fundEffect(1000, 300, 300)).toBe(1000);
        expect(fundEffect(1000, 0, 300)).toBe(0);
    });

    it("should multiply and divide in float, as the original does", () => {
        // In double, 1000 * 27431 / 32773 is 836.99...; the original's float quotient is 837. No city's costs reach
        // these figures, but the formula the C# port carries is the float one.
        expect(fundEffect(1000, 27431, 32773)).toBe(837);
    });
});

describe("fundServices", () => {

    const maintenance = { road: 100, fire: 100, police: 200 };

    it("should pay every service what it wants, and keep the percentages, when the cash is more than enough", () => {
        const percents = { road: 1, fire: 0.5, police: 0.57 };

        expect(fundServices(1000, maintenance, percents)).toEqual({
            wanted: { road: 100, fire: 50, police: 114 },
            paid: { road: 100, fire: 50, police: 114 },
            percents: { road: 1, fire: 0.5, police: 0.57 }
        });
    });

    it("should scale back the last service when the cash is exactly what the services want", () => {
        // Each service is funded in full only while more cash is left than it wants, so police, left with exactly the
        // $114 it wants, is scaled back to 114 / 200 in float. That is Math.fround(0.57), not the 0.57 it had: the
        // expected value tells a scaled-back percentage from a kept one, so it must stay the float.
        const funding = fundServices(314, maintenance, { road: 1, fire: 1, police: 0.57 });

        expect(funding.paid).toEqual({ road: 100, fire: 100, police: 114 });
        expect(funding.percents.police).toBe(Math.fround(0.57));
        expect(funding.percents.police).not.toBe(0.57);
    });

    it("should fund roads, then part of fire, and no police when the cash runs out at fire", () => {
        expect(fundServices(150, maintenance, fullFunding)).toEqual({
            wanted: { road: 100, fire: 100, police: 200 },
            paid: { road: 100, fire: 50, police: 0 },
            percents: { road: 1, fire: 0.5, police: 0 }
        });
    });

    it("should fund part of the roads and nothing else when the cash can't cover the roads", () => {
        const funding = fundServices(60, maintenance, fullFunding);

        expect(funding.paid).toEqual({ road: 60, fire: 0, police: 0 });
        expect(funding.percents).toEqual({ road: Math.fround(0.6), fire: 0, police: 0 });
    });

    it("should put a service that costs nothing at 0% once the cash has run out before it", () => {
        // The roads take all $100, so the fire department and police reach the end of the cash with no maintenance
        // cost to divide by
        const funding = fundServices(100, { road: 100, fire: 0, police: 0 }, fullFunding);

        expect(funding.paid).toEqual({ road: 100, fire: 0, police: 0 });
        expect(funding.percents).toEqual({ road: 1, fire: 0, police: 0 });
    });

    it("should pay nothing, at 0%, when there is no cash", () => {
        const funding = fundServices(0, maintenance, fullFunding);

        expect(funding.paid).toEqual(noFunding);
        expect(funding.percents).toEqual(noFunding);
    });

    it("should pay nothing and keep 0% funding when the player funds nothing", () => {
        expect(fundServices(500, maintenance, noFunding)).toEqual({
            wanted: noFunding, paid: noFunding, percents: noFunding
        });
    });

    it("should pay nothing and go back to 100% when there is neither cash nor anything wanted", () => {
        const funding = fundServices(0, noFunding, fullFunding);

        expect(funding.paid).toEqual(noFunding);
        expect(funding.percents).toEqual(fullFunding);
    });
});

describe("forecastYear", () => {

    const maintenance = { road: 300, fire: 200, police: 100 };

    it("should add taxes and subtract the services when the cash covers them", () => {
        const funds = 10357;
        const taxes = 3000;

        expect(forecastYear(funds, taxes, maintenance, fullFunding))
            .toEqual({ wanted: maintenance, fundsChange: 2400, fundsAfterYear: 12757 });
    });

    it("should charge each service at its funding percentage", () => {
        const funds = 1000;
        const taxes = 0;

        expect(forecastYear(funds, taxes, maintenance, { road: 0.5, fire: 0, police: 1 }))
            .toEqual({ wanted: { road: 150, fire: 0, police: 100 }, fundsChange: -250, fundsAfterYear: 750 });
    });

    it("should subtract only what the cash can pay", () => {
        // $150 pays the $100 of roads and $50 of the fire department; police goes unpaid
        const funds = 100;
        const taxes = 50;
        const costs = { road: 100, fire: 100, police: 200 };

        expect(forecastYear(funds, taxes, costs, fullFunding))
            .toEqual({ wanted: costs, fundsChange: -100, fundsAfterYear: 0 });
    });

    it("should charge nothing when no service needs money", () => {
        const funds = 1;
        const taxes = 0;

        expect(forecastYear(funds, taxes, noFunding, fullFunding))
            .toEqual({ wanted: noFunding, fundsChange: 0, fundsAfterYear: 1 });
    });
});
