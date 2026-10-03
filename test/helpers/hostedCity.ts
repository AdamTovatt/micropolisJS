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

import { CityHost } from "../../src/cityHost";
import { CityState } from "../../src/cityState";
import { StateMessage } from "../../src/protocol";
import { ManualTicker } from "./manualTicker";

// A city host with the client's copy of its city following what it publishes, as a source in the page joins them,
// every state message it has published, in order, and the ticker that runs its loop by hand. The host can send
// commands as any player, as a server's source will.
export function hostedCity() {
    const published: StateMessage[] = [];
    const listeners: ((message: StateMessage) => void)[] = [];
    const ticker = new ManualTicker();
    const host = new CityHost((messages) => {
        published.push(...messages);
        messages.forEach((message) => listeners.forEach((listener) => listener(message)));
    }, ticker);
    const state = new CityState({subscribe: (listener) => listeners.push(listener)});

    return {host, state, published, ticker};
}
