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

import { CityState } from "../src/cityState";
import { cityOverlaySource, OverlaySelection } from "../src/overlayPicker";
import { OverlayView } from "../src/overlayRenderer";
import { OverlayLayer, QueryAnswer } from "../src/protocol";
import { expectPlayedThrough, playback } from "./helpers/fakeCitySource";
import { FakeOverlaySource } from "./helpers/fakeOverlaySource";
import { answerTo } from "./helpers/queryAnswers";
import { CYCLES_IN_A_YEAR, FAST_CYCLE } from "./helpers/cityTimes";
import { openTown, TOWN_OVERLAY } from "./recordings/scenarios";

function answerFor(layer: OverlayLayer, values = [1, 2, 3, 4]): QueryAnswer {
    return {type: "overlay", layer, blockSize: 2, width: 2, height: 2, low: 0, high: 4, values};
}

function selection() {
    const source = new FakeOverlaySource();
    const shown: (OverlayView | null)[] = [];
    const overlays = new OverlaySelection(source, (view) => shown.push(view));
    return {source, shown, overlays};
}

describe("the overlay selection", () => {

    it("asks for the layer chosen, and shows its answer when it comes", () => {
        const {source, shown, overlays} = selection();

        overlays.select("crime");
        expect(source.asked).toEqual([{type: "overlay", layer: "crime"}]);
        expect(shown).toEqual([]);

        source.answer(answerFor("crime"));
        expect(shown.map((view) => view?.answer)).toEqual([answerFor("crime")]);
    });

    it("shows no overlay at once when none is chosen, and asks nothing", () => {
        const {source, shown, overlays} = selection();

        overlays.select(null);

        expect([source.asked, shown]).toEqual([[], [null]]);
    });

    it("asks again each time the simulation announces the layer showing, and for no other layer", () => {
        const {source, overlays} = selection();
        overlays.select("crime");

        source.announce("pollution");
        source.announce("crime");

        expect(source.asked).toEqual([{type: "overlay", layer: "crime"}, {type: "overlay", layer: "crime"}]);
    });

    it("asks nothing on an announcement while no overlay shows", () => {
        const {source, overlays} = selection();
        overlays.select("crime");
        overlays.select(null);

        source.announce("crime");

        expect(source.asked.length).toBe(1);
    });

    it("drops an answer that arrives after the player chose another layer", () => {
        const {source, shown, overlays} = selection();
        overlays.select("crime");
        overlays.select("pollution");

        source.answer(answerFor("crime"));
        source.answer(answerFor("pollution"));

        expect(shown.map((view) => view?.answer.layer)).toEqual(["pollution"]);
    });

    it("drops an answer that arrives after the player turned the overlay off", () => {
        const {source, shown, overlays} = selection();
        overlays.select("crime");
        overlays.select(null);

        source.answer(answerFor("crime"));

        expect(shown).toEqual([null]);
    });

    it("fails on a rejection, since it asks only for layers the simulation has", () => {
        const {source, overlays} = selection();
        overlays.select("crime");

        expect(() => source.answer({type: "rejected", reason: "the layer is one of …"}))
            .toThrow("The simulation rejected an overlay query: the layer is one of …");
    });

    it("fails on an answer to another query, and shows nothing", () => {
        const {source, shown, overlays} = selection();
        overlays.select("crime");

        expect(() => source.answer({
            type: "tileReport", x: 0, y: 0, tile: 0, category: "CLEAR", populationDensity: 0, landValue: 0, crime: 0,
            pollution: 0, rateOfGrowth: 0, burnable: false, bulldozable: false, conductive: false, animated: false,
            powered: false, zoneCentre: false, fireStationMap: 0, fireCoverage: 0, policeStationMap: 0, policeCoverage: 0,
            terrainDensity: 0, trafficDensity: 0, cityCentreScore: 0,
        })).toThrow("The simulation answered an overlay query with an answer of type tileReport");
        expect(shown).toEqual([]);
    });
});

describe("the overlay selection on a city source", () => {

    afterEach(expectPlayedThrough);

    // Once the answers the source has to give have arrived, each on a microtask of its own
    const answersArrived = () => new Promise((resolve) => setImmediate(resolve));

    it("shows the city's answer, and the new one each time the city recomputes the layer", async () => {
        const source = playback("town", "a year of overlays");
        const state = new CityState(source);
        await openTown(source);
        let announced = 0;
        state.on("overlayUpdated", ({layer}) => {
            announced += layer === TOWN_OVERLAY ? 1 : 0;
        });
        const shown: (OverlayView | null)[] = [];
        const overlays = new OverlaySelection(cityOverlaySource(source, state), (view) => shown.push(view));

        // A source answers after the question, never during it
        overlays.select(TOWN_OVERLAY);
        expect(shown.length).toBe(0);
        await answersArrived();
        expect(shown.length).toBe(1);
        // A cycle at a time, so the source sends the state after each, in which the layer is recomputed at most once
        for (let cycle = 0; cycle < CYCLES_IN_A_YEAR; cycle++) {
            expect((await source.driver.advance(FAST_CYCLE)).error).toBeNull();
        }

        await answersArrived();
        // Shown once when chosen, then once after each time the city recomputed it, as the town's pollution grew
        expect(announced).toBeGreaterThan(1);
        expect(shown.length).toBe(1 + announced);
        const latest = await answerTo(source, {type: "overlay", layer: TOWN_OVERLAY});
        expect(shown[shown.length - 1]!.answer).toEqual(latest);
        expect(shown[shown.length - 1]!.answer).not.toEqual(shown[0]!.answer);
    });
});
