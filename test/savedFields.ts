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

import { advance, startCity } from "../headless/runner";
import { plainSavedState } from "../src/stateHash";

type Fields = Record<string, unknown>;

// A field is saved under its own name, or its name without the leading underscore, in one of the component's groups
// of the save. Every other field a component holds is listed with the reason it isn't saved, so a field the
// simulation adds is either saved or explained. The sprites have their own check in test/spriteManager.ts.
describe("every stateful component of a grown city", () => {

    const city = startCity({fixture: "town", speed: "fast"}) as unknown as Record<string, Fields>;
    advance(city as never, 3001);
    const save = plainSavedState(city as never) as Record<string, Fields>;
    const scanned = save.scannedState as Record<string, Fields>;

    const COMPONENTS = "a component saved under its own key";
    const REFERENCE = "a reference to the map, the stream or another component";

    const cases: [string, Fields, Fields[], Record<string, string>][] = [
        ["the simulation", city as unknown as Fields, [save.simulation], {
            _map: COMPONENTS, evaluation: COMPONENTS, _valves: COMPONENTS, budget: COMPONENTS, _census: COMPONENTS,
            _powerManager: COMPONENTS, spriteManager: COMPONENTS, disasterManager: COMPONENTS,
            _mapScanner: "holds only the tile handlers", _repairManager: "holds only the tile handlers",
            _traffic: "its route stack is cleared at the start of every use",
            random: "saved as randomState",
            blockMaps: "saved under scannedState.blockMaps, but for the temporary maps, which each scan writes in full",
            _startingYear: "a constant",
            _cityYearLast: "the date last sent to the UI, which a load resets",
            _cityMonthLast: "the date last sent to the UI, which a load resets",
        }],
        ["the census", city._census, [save.census, scanned.census], {}],
        ["the budget", city.budget, [save.budget], {}],
        ["the valves", city._valves, [save.valves], {}],
        ["the evaluation", city.evaluation, [save.evaluation], {_random: REFERENCE}],
        ["the disaster manager", city.disasterManager, [save.disasters], {
            _map: REFERENCE, _spriteManager: REFERENCE, _random: REFERENCE,
        }],
        ["the power manager", city._powerManager, [scanned.power], {
            _map: REFERENCE, powerGridMap: "saved as powerGrid",
            _visitedMap: "scratch space, cleared at the start of every power scan",
        }],
    ];

    it.each(cases)("%s: every field is saved, or listed with why not", (_, component, groups, notSaved) => {
        const isSaved = (field: string) =>
            groups.some((group) => field in group || field.replace(/^_/, "") in group);

        const unexplained = Object.keys(component)
            .filter((field) => typeof component[field] !== "function")
            .filter((field) => !isSaved(field) && !(field in notSaved));

        expect(unexplained).toEqual([]);
    });
});
