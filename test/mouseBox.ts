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

import { boxLabelRect, labelTextColour, mouseBoxRect } from "../src/mouseBox";

describe("the mouse box", () => {

    it("strokes a three pixel line half a line outside the area, so the line clears it", () => {
        expect(mouseBoxRect({x: 32, y: 48}, 48, 64)).toEqual({x: 30.5, y: 46.5, width: 51, height: 67});
    });

    it("puts a name's tag clear of the line on the right, level with the line's top, padded round the text", () => {
        expect(boxLabelRect({x: 80, y: 48}, 30.2)).toEqual({x: 85, y: 46.5, width: 37, height: 18});
    });

    it("writes a name in black on a light colour and in white on a dark one", () => {
        expect(labelTextColour("#ffe119")).toBe("black");
        expect(labelTextColour("#42d4f4")).toBe("black");
        expect(labelTextColour("#911eb4")).toBe("white");
        expect(labelTextColour("#4363d8")).toBe("white");
    });
});
