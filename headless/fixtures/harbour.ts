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

import { builtFixture, RUN_STEPS } from "./fixture";
import { buildingAt, lineOf } from "./toolCommands";
import { townCommands } from "./town";

// The town with a seaport east of its north row, powered by a wire from the row's last zone. A powered port sends out a
// ship from the first channel tile on the map's edge, wherever the port stands: seed 8's map has one on its top edge.
export const harbour = builtFixture(
  "The town with a seaport, which brings a ship to the channel", [
    ...townCommands,
    lineOf("wire", 44, 13, 44, 13),
    buildingAt("port", 46, 14),
  ], [
    {step: 0, hash: "5fcefea47279c30021dbf97912b0df39849b0defa7d4ebadb3e6ed42ae0ebaf4"},
    {step: RUN_STEPS, hash: "0aecbb0e84e4ac1dc67eef2a8ba902401c5bca630b8d3e38fb55ed50ef9ccae7"},
  ]);
