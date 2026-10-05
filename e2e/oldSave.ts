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

import { readFileSync } from "fs";
import { join } from "path";

import { Page, test } from "@playwright/test";

import { OLD_SAVE_KEY } from "../src/oldSaveOffer";

// A game the browser kept in its localStorage before cities were kept on the server, which the splash screen offers

// The oldest sample save the game loads, as such a game may be
export function oldSaveText(): string {
  return readFileSync(join(test.info().config.rootDir, "..", "conformance", "saveVersions", "version5.json"), "utf8");
}

// Has the browser keep the text as its old saved game when the page first opens, as a browser that played before cities
// were kept on the server does: once only, so the page that takes it out finds it gone when it opens again
export async function keepOldSave(page: Page, text: string): Promise<void> {
  await page.addInitScript(({key, text}) => {
    if (sessionStorage.getItem("oldSaveKept") === null) {
      sessionStorage.setItem("oldSaveKept", "yes");
      localStorage.setItem(key, text);
    }
  }, {key: OLD_SAVE_KEY, text});
}

export function storedOldSave(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), OLD_SAVE_KEY);
}
