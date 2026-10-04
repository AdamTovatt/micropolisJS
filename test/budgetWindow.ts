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

import { BudgetForecasts, budgetView, type BudgetView, forecastQuery, sliderPositions, taxLabel } from "../src/budgetWindow";
import { type BudgetForecastAnswer, type BudgetRecord, type Query, type QueryAnswer } from "../src/protocol";
import { expectPlayedThrough, playback } from "./helpers/fakeCitySource";
import { answerOfType } from "./helpers/queryAnswers";
import { openNewCity } from "./recordings/scenarios";

// Roads funded in full, the fire department scaled back to $140 of $300 at a year end, and police at 75%
const RECORD: BudgetRecord = {
    type: "budget",
    taxRate: 7,
    taxesCollected: 186,
    funds: 4703,
    maintenance: {road: 108, fire: 300, police: 200},
    funding: {road: 1, fire: Math.fround(140 / 300), police: Math.fround(0.75)},
};

const FORECAST: BudgetForecastAnswer = {
    type: "budgetForecast", budget: RECORD, costs: {road: 54, fire: 140, police: 150}, fundsChange: -158,
    fundsAfterYear: 4545,
};

describe("the budget window's forecast query", () => {

    it("names the services whose sliders moved, and only those, as the city answers", async () => {
        const query = forecastQuery({road: 50});

        expect(query).toEqual({type: "budgetForecast", road: 50});
        const source = playback("newCity", "budget forecast");
        await openNewCity(source);
        await answerOfType(source, query, "budgetForecast");
        expectPlayedThrough();
    });

    it("names no service when no slider moved", () => {
        expect(forecastQuery({})).toEqual({type: "budgetForecast"});
    });
});

describe("the budget window's sliders", () => {

    it("are drawn at the whole percent of each service's funding, the fraction dropped", () => {
        expect(sliderPositions(RECORD)).toEqual({road: 100, fire: 46, police: 75});
    });
});

describe("the budget window's view", () => {

    it("shows the budget and the forecast, each service's funding and cost, and the fraction of a percent of one " +
       "whose slider hasn't moved", () => {
        expect(budgetView({road: 50}, FORECAST)).toEqual({
            taxesCollected: "$186",
            funds: "$4703",
            cashFlow: "-$158",
            fundsAfterYear: "$4545",
            labels: {road: "50% of $108 = $54", fire: "46.7% of $300 = $140", police: "75% of $200 = $150"},
        });
    });

    it("shows a slider moved to the percent the funding has as the whole percent", () => {
        expect(budgetView({fire: 46}, FORECAST).labels.fire).toBe("46% of $300 = $140");
    });

    // The budget may have changed since the window opened: a year end, or another player
    it("shows every figure from the answer, not from the budget the window opened on", () => {
        const later = {...RECORD, taxesCollected: 220, funds: 3900, maintenance: {road: 120, fire: 300, police: 200},
                       funding: {...RECORD.funding, police: Math.fround(0.5)}};
        const view = budgetView({}, {...FORECAST, budget: later});

        expect([view.taxesCollected, view.funds, view.labels.road, view.labels.police])
            .toEqual(["$220", "$3900", "100% of $120 = $54", "50% of $200 = $150"]);
    });

    it("shows the tax rate", () => {
        expect(taxLabel(9)).toBe("Tax rate: 9%");
    });
});

describe("the budget window's forecasts", () => {

    // A source that answers each query when the test says, as a server would some time after it was asked
    function forecasts() {
        const asked: Query[] = [];
        const replies: ((answer: QueryAnswer) => void)[] = [];
        const shown: BudgetView[] = [];
        const source = {
            ask(query: Query, reply: (answer: QueryAnswer) => void): void {
                asked.push(query);
                replies.push(reply);
            },
        };
        const forecaster = new BudgetForecasts(source, (view) => shown.push(view));
        return {asked, replies, shown, forecaster};
    }

    it("ask for the forecast at the funding moved, and show its answer", () => {
        const {asked, replies, shown, forecaster} = forecasts();
        forecaster.forecast({road: 50});
        replies[0](FORECAST);

        expect(asked).toEqual([{type: "budgetForecast", road: 50}]);
        expect(shown).toEqual([budgetView({road: 50}, FORECAST)]);
    });

    it("show the funding as it was asked about, though the sliders moved on before the answer", () => {
        const {replies, shown, forecaster} = forecasts();
        const funding: {road?: number} = {road: 50};
        forecaster.forecast(funding);
        funding.road = 60;
        replies[0](FORECAST);

        expect(shown[0].labels.road).toBe("50% of $108 = $54");
    });

    it("drop an answer to a forecast asked before the last", () => {
        const {replies, shown, forecaster} = forecasts();
        forecaster.forecast({road: 50});
        forecaster.forecast({road: 60});
        replies[1](FORECAST);
        replies[0](FORECAST);

        expect(shown).toEqual([budgetView({road: 60}, FORECAST)]);
    });

    it("drop an answer that arrives after they were dropped, and show those asked for since", () => {
        const {replies, shown, forecaster} = forecasts();
        forecaster.forecast({road: 50});
        forecaster.drop();
        forecaster.forecast({});
        replies[0](FORECAST);
        replies[1](FORECAST);

        expect(shown).toEqual([budgetView({}, FORECAST)]);
    });

    it.each([
        ["a rejection", {type: "rejected", reason: "road funding is a whole percent from 0 to 100"}],
        ["an overlay", {type: "overlay", layer: "crime", blockSize: 2, width: 1, height: 1, low: 0, high: 1, values: [0]}],
    ] as [string, QueryAnswer][])("are a defect when answered with %s", (_, answer) => {
        const {replies, shown, forecaster} = forecasts();
        forecaster.forecast({});

        expect(() => replies[0](answer)).toThrow("The budget forecast was answered with");
        expect(shown).toEqual([]);
    });
});
