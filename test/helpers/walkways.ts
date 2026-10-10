/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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

import { BITS_PER_NINTH, WALKWAY_KINDS } from "../../src/protocol";
import type { WalkwayKind } from "../../src/protocol";

// The walkway value of walkway of the kind given, a path unless another is given, on the ninths of a tile given,
// numbered row by row from its north-west corner: each ninth's kind in BITS_PER_NINTH bits, ninth n's from bit n times
// that, numbered from 1 as WALKWAY_KINDS lists them
export function walkwayOf(ninths: readonly number[], kind: WalkwayKind = "path"): number {
  const number = WALKWAY_KINDS.indexOf(kind) + 1;
  return ninths.reduce((walkway, ninth) => walkway | (number << (BITS_PER_NINTH * ninth)), 0);
}
