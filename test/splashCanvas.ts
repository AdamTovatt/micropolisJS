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

import { FALLBACK_SPRITES, FALLBACK_TILES, GRASS_FIELD } from "../src/renderManifest";
import { PREVIEW_TILE_SIZE, SplashCanvas, previewAtlases } from "../src/splashCanvas";
import type { AtlasImage } from "../src/webglRenderer";
import { expectPlayedThrough, playback } from "./helpers/fakeCitySource";
import { answerOfType } from "./helpers/queryAnswers";
import { SEED } from "./recordings/scenarios";

describe("the splash screen's map preview", () => {

    afterEach(expectPlayedThrough);

    it("fills the canvas with the map the city source previews", async () => {
        // As the splash screen asks for the map it previews
        const preview = await answerOfType(playback("noCity", "map preview"), {type: "mapPreview", seed: SEED},
                                           "mapPreview");

        expect(preview.width * PREVIEW_TILE_SIZE).toBe(SplashCanvas.DEFAULT_WIDTH);
        expect(preview.height * PREVIEW_TILE_SIZE).toBe(SplashCanvas.DEFAULT_HEIGHT);
    });

    it("filters the 16 px sheets as it filters the rendered art, and draws from the same images", () => {
        const image = (width: number) => ({width, height: width}) as AtlasImage["image"];
        const atlases = new Map<string, AtlasImage>([
            [FALLBACK_TILES, {image: image(512), filter: "crisp"}],
            [FALLBACK_SPRITES, {image: image(256), filter: "crisp"}],
            ["zones", {image: image(4096), filter: "mipmapped"}],
            [GRASS_FIELD, {image: image(960), filter: "field"}],
        ]);

        const filtered = previewAtlases(atlases);

        expect(Array.from(filtered.keys())).toEqual(Array.from(atlases.keys()));
        filtered.forEach((atlas, name) => {
            expect(atlas.image).toBe(atlases.get(name)!.image);
        });
        // The sheets as the art is; the grass's field stays a field of values
        expect(Array.from(filtered.values(), (atlas) => atlas.filter))
            .toEqual(["mipmapped", "mipmapped", "mipmapped", "field"]);
        // The map's own atlases are left as they were
        expect(atlases.get(FALLBACK_TILES)!.filter).toBe("crisp");
    });
});
