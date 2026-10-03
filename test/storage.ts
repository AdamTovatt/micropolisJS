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

import { removeWindow, stubWindow } from "./helpers/window";

// The page's storage reads whether it can store as it loads, so each test loads it over a window of its own
async function loadStorage() {
    const localStorage = stubWindow();
    const Storage = (await import("../src/storage")).Storage;

    return {Storage, localStorage, key: Storage.KEY};
}

describe("the saved game in storage", () => {

    afterAll(() => {
        removeWindow();
    });

    it("is stored as the text the source gave, unread", async () => {
        const {Storage, localStorage, key} = await loadStorage();

        Storage.saveText("not even JSON");

        expect(localStorage.getItem(key)).toBe("not even JSON");
    });

    it("reads back from storage as the text stored", async () => {
        const {Storage} = await loadStorage();
        Storage.saveText("{\"name\":\"Town\"}");

        expect(Storage.getSavedText()).toBe("{\"name\":\"Town\"}");
    });

    it("is null when nothing is saved", async () => {
        const {Storage} = await loadStorage();

        expect(Storage.getSavedText()).toBeNull();
    });
});
