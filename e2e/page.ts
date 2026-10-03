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

import { Page } from "@playwright/test";

// The page serves everything the game needs. Anything from another host, such as the share button's script, is
// refused, so a run never waits on the network.
export async function blockOtherHosts(page: Page): Promise<void> {
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
}

// What went wrong in the page that the runner wouldn't otherwise see: uncaught errors, and alerts, which the game
// raises for a file it can't read or a seed it refuses. The list fills as they happen.
export function collectPageProblems(page: Page): string[] {
  const problems: string[] = [];

  page.on("pageerror", (error) => problems.push(`Page error: ${error.message}`));
  page.on("dialog", async (dialog) => {
    problems.push(`Alert: ${dialog.message()}`);
    await dialog.dismiss();
  });

  return problems;
}
