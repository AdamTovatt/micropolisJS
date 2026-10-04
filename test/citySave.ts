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

import { saveCity } from "../src/citySave";
import { pageSource } from "./helpers/citySources";
import { expectPlayedThrough, playback } from "./helpers/fakeCitySource";
import { FakeLocalStorage, removeWindow, stubWindow } from "./helpers/window";
import { NEW_CITY, openNewCity } from "./recordings/scenarios";

// What the Save button keeps, and where: a city in the browser in the page's storage, a city on the server in the
// server's store alone, over a source playing back a recording of the server

// What a city played in the browser left in storage before
const OFFLINE_SAVE = "{\"name\":\"Offline\"}";

// The page's storage, over a window of the test's own, holding the save of a city played in the browser before
async function storageWithOfflineSave() {
    const localStorage: FakeLocalStorage = stubWindow();
    const {Storage} = await import("../src/storage");
    Storage.saveText(OFFLINE_SAVE);

    return {Storage, stored: () => localStorage.getItem(Storage.KEY)};
}

describe("saving the city", () => {

    afterEach(expectPlayedThrough);

    afterAll(() => {
        removeWindow();
    });

    it("keeps a city in the browser in the page's storage, as its save's text", async () => {
        const {Storage, stored} = await storageWithOfflineSave();
        const {source} = await pageSource.create();
        await source.start(NEW_CITY);

        await saveCity(source, Storage);

        expect(stored()).toBe(await source.driver.savedGame());
        expect(JSON.parse(stored()!)).toMatchObject({name: "Town"});
    });

    it("keeps a city on the server in the server's store alone, leaving the page's storage as it was", async () => {
        const {Storage, stored} = await storageWithOfflineSave();
        const source = playback("newCity", "save");
        await openNewCity(source);

        await saveCity(source, Storage);

        expect(stored()).toBe(OFFLINE_SAVE);
    });

    it("keeps nothing when the save fails", async () => {
        const {Storage, stored} = await storageWithOfflineSave();
        const {source} = await pageSource.create();

        await expect(saveCity(source, Storage)).rejects.toThrow("No city has started");

        expect(stored()).toBe(OFFLINE_SAVE);
    });
});
