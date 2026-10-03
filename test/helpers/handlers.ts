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

// A tile handler as the map scanner calls it
export type TileHandler = (map: unknown, x: number, y: number, simData: unknown) => void;

interface Registry {
    addAction(criterion: unknown, ...rest: unknown[]): void;
}

// The handler a subsystem's registerHandlers adds to the map scanner for a tile value or predicate, so a test can call
// it on a tile alone. The repair manager it is given notes nothing.
export function registeredHandler(registerHandlers: (scanner: Registry, repairManager: Registry) => void,
                                  criterion: unknown): TileHandler {
    const handlers = new Map<unknown, TileHandler>();
    registerHandlers({addAction: (key, handler) => handlers.set(key, handler as TileHandler)}, {addAction: () => {}});

    const handler = handlers.get(criterion);
    if (handler === undefined) {
        throw new Error("No handler is registered for that criterion");
    }

    return handler;
}
