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
import { buildingAt } from "./toolCommands";

// A city whose run pins where growZone's limit on pollution lies, which no other fixture reaches: a residential zone
// that passes the test for growth with its pollution below the limit of 128, but well above the levels the other
// fixtures' growing zones have. As in the smoky woods, the zone is in seed 8's thickest woods, and grows only between
// the first scan of pollution and land value and the next, while its land value counts no pollution against it. With
// a coal plant against its west side and one against its east, rather than to its north and east, its pollution then is
// 110, where the smoky woods' is over 128: so it grows, where a limit anywhere from 96 to 109 would stop it.
export const hazyWoods = builtFixture(
  "A residential zone in the woods with a coal plant against each side, and nothing else", [
    buildingAt("residential", 45, 13),
    buildingAt("coal", 41, 13),
    buildingAt("coal", 48, 13),
  ], [
    {step: 0, hash: "4cfd24968b2d0db433740b5c5a01edaf7161797c4b9f5b329c6df22043e3950a"},
    {step: RUN_STEPS, hash: "793f772726b736de5921749a481957d9c6e80eec8040afa83898b3fbab22ae33"},
  ]);
