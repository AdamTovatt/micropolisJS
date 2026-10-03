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

import type { CitySource } from "../../src/citySource";
import { PageCitySource } from "../../src/pageCitySource";
import { ManualTicker } from "./manualTicker";

// A city source the contract tests drive, whatever runs the simulation behind it. run takes one turn of the source's
// loop, after moving its clock on by the milliseconds given, and resolves once every state message that turn produced
// has been delivered. close stops the source.
export interface SourceUnderTest {
    source: CitySource;
    run(milliseconds?: number): Promise<void>;
    close(): void;
}

export interface SourceFactory {
    name: string;
    create(): SourceUnderTest;
}

export const pageSource: SourceFactory = {
    name: "the in-page source",
    create: () => {
        const ticker = new ManualTicker();
        return {source: new PageCitySource(ticker), run: async (milliseconds) => ticker.run(milliseconds), close: () => {}};
    },
};
