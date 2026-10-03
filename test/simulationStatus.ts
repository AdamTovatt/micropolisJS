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

import { CityStatus } from "../src/cityStatus";
import { GameMap } from "../src/gameMap.js";
import * as Messages from "../src/messages";
import { Simulation } from "../src/simulation.js";
import { CONDBIT } from "../src/tileFlags";
import { POWERPLANT } from "../src/tileValues";

const PHASES_PER_CYCLE = 16;
const SEED = 1;

// An empty map with one coal plant tile, which the map scan finds and counts.
function cityWithAPlant() {
    const map = new GameMap(120, 100);
    map.setTile(60, 50, POWERPLANT, CONDBIT);

    const simulation = new Simulation(map, Simulation.LEVEL_EASY, Simulation.SPEED_MED, SEED, null);
    const records: CityStatus[] = [];
    const messages: Array<{cycle: number, subject: string}> = [];
    let cycle = 0;

    simulation.addEventListener(Messages.CITY_STATUS_UPDATED, (record: CityStatus) => records.push(record));
    simulation.addEventListener(Messages.FRONT_END_MESSAGE,
                                (message: {subject: string}) => messages.push({cycle, subject: message.subject}));

    const runPhases = (count: number) => {
        for (let i = 0; i < count; i++) {
            if (simulation._phaseCycle === 0) {
                cycle++;
            }
            simulation._simulate(simulation._constructSimData());
        }
    };

    return {messages, records, runPhases, simulation};
}

describe("the city status record the simulation publishes", () => {

    it("is published once per cycle, at the cycle's last phase", () => {
        const {records, runPhases} = cityWithAPlant();

        runPhases(PHASES_PER_CYCLE - 1);
        expect(records.length).toBe(0);

        runPhases(1);
        expect(records.length).toBe(1);

        runPhases(2 * PHASES_PER_CYCLE);
        expect(records.length).toBe(3);
    });

    // At medium speed the power scan runs only every fourth cycle, and not in the first. The scan the simulation
    // runs as it is constructed, for a new city or a loaded one, gives the first record its figures.
    it("carries the power figures from the first cycle", () => {
        const {records, runPhases, simulation} = cityWithAPlant();

        runPhases(PHASES_PER_CYCLE);

        expect(simulation._simCycle % 4).not.toBe(0);
        // The walk reaches the plant tile and its four smoke tiles, and counts the branch point it returns to twice
        expect([records[0].powerCapacity, records[0].powerLoad]).toEqual([700, 6]);
    });

    it("carries the cap flags the advisor has set on the valves", () => {
        const {records, runPhases, simulation} = cityWithAPlant();
        simulation._valves.resCap = true;
        simulation._valves.indCap = true;

        runPhases(PHASES_PER_CYCLE);
        expect([records[0].residentialCapped, records[0].commercialCapped, records[0].industrialCapped])
            .toEqual([true, false, true]);

        // The advisor checks the stadium on the 26th cycle of 64 and the seaport on the 28th, and releases each
        // cap for this city, which has no residents or industry.
        runPhases(27 * PHASES_PER_CYCLE);
        expect([records[26].residentialCapped, records[26].industrialCapped]).toEqual([false, true]);
        expect([records[27].residentialCapped, records[27].industrialCapped]).toEqual([false, false]);
    });

    it("lists the conditions that hold every cycle, while the advisor sends each on its own cycle", () => {
        const {messages, records, runPhases} = cityWithAPlant();

        runPhases(64 * PHASES_PER_CYCLE);

        const zoneBalance = [Messages.NEED_MORE_RESIDENTIAL, Messages.NEED_MORE_COMMERCIAL,
                             Messages.NEED_MORE_INDUSTRIAL];
        expect(records.length).toBe(64);
        records.forEach((record) => expect(record.conditions).toEqual(zoneBalance));
        expect(messages).toEqual([
            {cycle: 1, subject: Messages.NEED_MORE_RESIDENTIAL},
            {cycle: 5, subject: Messages.NEED_MORE_COMMERCIAL},
            {cycle: 10, subject: Messages.NEED_MORE_INDUSTRIAL},
        ]);
    });
});
