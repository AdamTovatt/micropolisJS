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

import { PREVIEW_TILE_SIZE, SplashCanvas, previewTileOrigin } from "../src/splashCanvas";
import { expectPlayedThrough, playback } from "./helpers/fakeCitySource";
import { answerOfType } from "./helpers/queryAnswers";
import { SEED } from "./recordings/scenarios";

describe("the splash screen's map preview", () => {

    afterEach(expectPlayedThrough);

    it("draws the first tile at the canvas' origin", () => {
        expect(previewTileOrigin(0, 0)).toEqual({x: 0, y: 0});
    });

    it("draws tiles along and down by the tile size", () => {
        expect(previewTileOrigin(7, 0)).toEqual({x: 7 * PREVIEW_TILE_SIZE, y: 0});
        expect(previewTileOrigin(0, 5)).toEqual({x: 0, y: 5 * PREVIEW_TILE_SIZE});
    });

    it("fills the canvas with the map the city source previews", async () => {
        // As the splash screen asks for the map it previews
        const preview = await answerOfType(playback("noCity", "map preview"), {type: "mapPreview", seed: SEED},
                                           "mapPreview");
        const last = previewTileOrigin(preview.width - 1, preview.height - 1);

        expect(last.x + PREVIEW_TILE_SIZE).toBe(SplashCanvas.DEFAULT_WIDTH);
        expect(last.y + PREVIEW_TILE_SIZE).toBe(SplashCanvas.DEFAULT_HEIGHT);
    });
});
