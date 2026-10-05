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

import type { StylingWindow } from "../../src/domElements";

// The document of a fake element, whose window's stylesheet gives it the display given: an element is displayed as
// its inline style says, or as the stylesheet does where its inline style says nothing
export function styledBy<E extends {style: {display: string}}>(sheetDisplay: string):
    {defaultView: StylingWindow<E>} {
    return {
        defaultView: {
            getComputedStyle: (element) => ({display: element.style.display === "" ? sheetDisplay : element.style.display}),
        },
    };
}
