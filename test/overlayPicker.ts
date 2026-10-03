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

import { OverlaySelection, OverlaySource, pageOverlaySource } from "../src/overlayPicker";
import { OverlayView } from "../src/overlayRenderer";
import { OverlayLayer, Query, QueryAnswer } from "../src/protocol";
import { buildCity, SimulationInstance, YEAR } from "./helpers/simulations";

// A year at fast speed is 48 cycles, and the power scan runs every 5th cycle (speedPowerScan in simulation.js)
const CYCLES_IN_A_YEAR = 48;
const FAST_POWER_SCAN_INTERVAL = 5;

// A source that answers each query when the test says, as a server would some time after it was asked
class FakeSource implements OverlaySource {
    readonly asked: Query[] = [];
    private readonly pending: ((answer: QueryAnswer) => void)[] = [];
    private readonly listeners: ((layer: OverlayLayer) => void)[] = [];

    onLayerUpdated(listener: (layer: OverlayLayer) => void): void {
        this.listeners.push(listener);
    }

    ask(query: Query, reply: (answer: QueryAnswer) => void): void {
        this.asked.push(query);
        this.pending.push(reply);
    }

    // Answers the oldest query not yet answered
    answer(answer: QueryAnswer): void {
        this.pending.shift()!(answer);
    }

    announce(layer: OverlayLayer): void {
        this.listeners.forEach((listener) => listener(layer));
    }
}

function answerFor(layer: OverlayLayer, values = [1, 2, 3, 4]): QueryAnswer {
    return {type: "overlay", layer, blockSize: 2, width: 2, height: 2, low: 0, high: 4, values};
}

function selection() {
    const source = new FakeSource();
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

describe("the overlay selection on the simulation in the page", () => {

    it("shows the simulation's answer, and the new one each time the layer's phase recomputes it", () => {
        const city: SimulationInstance = buildCity(2026, 7);
        const shown: (OverlayView | null)[] = [];
        const overlays = new OverlaySelection(pageOverlaySource(city), (view) => shown.push(view));

        overlays.select("powerGrid");
        expect(shown.length).toBe(1);
        for (let i = 0; i < YEAR; i++) {
            city.step();
        }

        // Shown once when chosen, then once after each power scan
        expect(shown.length).toBe(1 + Math.floor(CYCLES_IN_A_YEAR / FAST_POWER_SCAN_INTERVAL));
        expect(shown[shown.length - 1]!.answer).toEqual(city.answerQuery({type: "overlay", layer: "powerGrid"}));
        expect(shown[shown.length - 1]!.answer).not.toEqual(shown[0]!.answer);
    });
});
