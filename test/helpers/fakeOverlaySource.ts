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

import type { OverlaySource } from "../../src/overlayPicker";
import type { OverlayLayer, Query, QueryAnswer } from "../../src/protocol";

// A source that answers each query when the test says, as a server would some time after it was asked
export class FakeOverlaySource implements OverlaySource {
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
