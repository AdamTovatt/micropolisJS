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

import { WindowManager } from "../src/windowManager";
import { FakeWindow } from "./helpers/fakeWindow";

// The windows' own closing, hiding and handing on their choice, is ClosableWindow's in windowBase.ts, which needs the
// page's DOM: the end-to-end suite closes real windows with a choice, with their cancel buttons and with Escape.

function setUp() {
    const first = new FakeWindow<[string], string | null>(null);
    const second = new FakeWindow<[], number | null>(null);
    const windows = new WindowManager();

    return {windows, first, second};
}

describe("the window manager", () => {

    it("holds the input while a window shows", () => {
        const {windows, first} = setUp();

        const choosing = windows.open(first, "data");

        expect(choosing).not.toBeNull();
        expect(first.opened).toEqual([["data"]]);
        expect(windows.holdsInput()).toBe(true);
    });

    it("gives the choice the window closes with", async () => {
        const {windows, first} = setUp();
        const choosing = windows.open(first, "data");

        first.choose("OK");

        await expect(choosing).resolves.toBe("OK");
    });

    it("lets go of the input as the window closes, before its choice arrives", async () => {
        const {windows, first} = setUp();
        const choosing = windows.open(first, "data")!;
        let heldAtChoice: boolean | null = null;
        const acted = choosing.then(() => {
            heldAtChoice = windows.holdsInput();
        });

        first.choose("OK");

        expect(windows.holdsInput()).toBe(false);
        await acted;
        expect(heldAtChoice).toBe(false);
    });

    it("opens the window a choice opens in the closed window's place", async () => {
        const {windows, first, second} = setUp();
        const opened = windows.open(first, "data")!.then(() => windows.open(second) !== null);

        first.choose("OK");

        expect(await opened).toBe(true);
        expect(second.opened).toEqual([[]]);
        expect(windows.holdsInput()).toBe(true);
    });

    it("closes the window showing as cancelled, as Escape does, and lets go of the input", async () => {
        const {windows, first} = setUp();
        const choosing = windows.open(first, "data");

        windows.closeShown();

        expect(windows.holdsInput()).toBe(false);
        await expect(choosing).resolves.toBeNull();
    });

    it("closes nothing when no window shows", () => {
        const {windows} = setUp();

        windows.closeShown();

        expect(windows.holdsInput()).toBe(false);
    });

    it("opens no window over another", () => {
        const {windows, first, second} = setUp();
        expect(windows.open(first, "data")).not.toBeNull();

        const opened = windows.open(second);

        expect(opened).toBeNull();
        expect(second.opened).toEqual([]);
    });

    it("throws a window's failure to open to whoever opened it, and holds nothing", () => {
        const {windows, first, second} = setUp();
        first.open = () => {
            throw new Error("The record has no such field");
        };

        expect(() => windows.open(first, "data")).toThrow("The record has no such field");

        expect(windows.holdsInput()).toBe(false);
        expect(windows.open(second)).not.toBeNull();
    });
});
