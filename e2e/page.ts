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

// The page with no game server answering: anything from another host, such as the share button's script, is refused,
// and so is the game server's session API, so the page says no server answers and never opens the city's WebSocket.
// So a test of what the page does before it signs in never waits on the network.
export async function blockNetwork(page: Page): Promise<void> {
  await page.route((url) => url.hostname !== "localhost" || url.pathname.startsWith("/api/"), (route) => route.abort());
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

// Whether the WebGL2 context of the canvas the selector picks is lost, or null for a canvas with none, such as one
// drawn in 2D
export async function isContextLost(page: Page, selector: string): Promise<boolean | null> {
  return page.locator(selector).evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext("webgl2");
    return gl === null ? null : gl.isContextLost();
  });
}

// Losing and restoring the WebGL2 context of the canvas the selector picks, as the browser may, and whether it is lost
export interface ContextLoss {
  lose(): Promise<void>;
  restore(): Promise<void>;
  isLost(): Promise<boolean | null>;
}

// The context's loss, through WEBGL_lose_context. The extension is taken while the context is there, and kept in the
// page for the restore, as the canvas can't give it once the context is lost.
export async function contextLoss(page: Page, selector: string): Promise<ContextLoss> {
  type Losers = {losers?: Record<string, WEBGL_lose_context>};
  await page.locator(selector).evaluate((canvas: HTMLCanvasElement, key) => {
    const losers = (window as unknown as Losers).losers ??= {};
    losers[key] = canvas.getContext("webgl2")!.getExtension("WEBGL_lose_context")!;
  }, selector);

  const call = (action: "loseContext" | "restoreContext") => page.evaluate(
    ({key, name}) => (window as unknown as Losers).losers![key][name](), {key: selector, name: action});
  return {
    lose: () => call("loseContext"),
    restore: () => call("restoreContext"),
    isLost: () => isContextLost(page, selector),
  };
}
