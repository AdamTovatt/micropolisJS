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

// A sprite-free city made for one branch of the residential zones, whose unit snapshots are recorded from it alone
// (conformance/snapshotPoints.ts): growth held back by pollution. Land value counts against a block the pollution the
// scan before worked out, so a zone is polluted past the 128 at which growZone builds nothing, and yet passes the test
// for growth, only between a scan that finds the pollution new and the next.

// A residential zone in seed 8's thickest woods, with a coal plant to its north and one to its east. The first scan of
// pollution and land value finds none before it, and the woods make the land worth the most there is, so until the
// next scan the zone may pass the test for growth, which the pollution then holds back. With nothing else built, the
// city's centre is the zone.
export const smokyWoods = builtFixture(
  "A residential zone in the woods between two coal plants, and nothing else", [
    buildingAt("residential", 45, 13),
    buildingAt("coal", 45, 9),
    buildingAt("coal", 48, 13),
  ], [
    {step: 0, hash: "ed6a605998dc4b4bac1efdc18d38f045fb86df4d00637cf844f7e63eadca2cf7"},
    {step: RUN_STEPS, hash: "a64c91027b7785c1f4db07737d87ea38b0db6778de0ca77e5f32d15d3a79a62c"},
  ]);
