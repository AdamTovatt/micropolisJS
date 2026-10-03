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

import { Simulation } from "../../headless/city";
import { buildingAt, lineOf } from "../../headless/fixtures/toolCommands";
import { LOCAL_PLAYER, TilePosition, ToolCommand } from "../../src/commands";

// Builds on a city with tool commands, as the player does, on maps the tests prepare. Every command must succeed: a
// build that silently skipped an edit would leave a different city than the test describes.
export class CityBuilder {
    constructor(readonly city: Simulation) {}

    // A building's position is its centre tile, as for the player's click: one in from the top left
    airport(x: number, y: number) { this.apply(buildingAt("airport", x, y)); }
    coal(x: number, y: number) { this.apply(buildingAt("coal", x, y)); }
    commercial(x: number, y: number) { this.apply(buildingAt("commercial", x, y)); }
    fireStation(x: number, y: number) { this.apply(buildingAt("fire", x, y)); }
    industrial(x: number, y: number) { this.apply(buildingAt("industrial", x, y)); }
    policeStation(x: number, y: number) { this.apply(buildingAt("police", x, y)); }
    residential(x: number, y: number) { this.apply(buildingAt("residential", x, y)); }

    // A straight horizontal or vertical line of road, rail or wire, both ends included, dragged as one command
    rail(x1: number, y1: number, x2: number, y2: number) { this.apply(lineOf("rail", x1, y1, x2, y2)); }
    road(x1: number, y1: number, x2: number, y2: number) { this.apply(lineOf("road", x1, y1, x2, y2)); }
    wire(x1: number, y1: number, x2: number, y2: number) { this.apply(lineOf("wire", x1, y1, x2, y2)); }

    private apply(command: ToolCommand) {
        const [result] = this.city.applyCommands([{player: LOCAL_PLAYER, command}]);

        if (result.outcome !== "ok") {
            const path = command.path;
            const tile = ({x, y}: TilePosition) => `(${x}, ${y})`;
            const where = path.length === 1 ? `at ${tile(path[0])}` :
                `from ${tile(path[0])} to ${tile(path[path.length - 1])}`;
            throw new Error(`The ${command.tool} tool failed ${where} with outcome ${result.outcome}` +
                            (result.reason === null ? "" : `: ${result.reason}`));
        }
    }
}
