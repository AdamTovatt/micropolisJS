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

import { defineConfig, devices } from "@playwright/test";

// The end-to-end suite: a production build served by webpack, played in headless Chromium. E2E_PORT moves the server
// off its default port, for a machine that already serves something there.
const port = Number(process.env.E2E_PORT ?? 8181);

export default defineConfig({
  testDir: ".",
  outputDir: "../e2e-results",
  // The playthrough is one long test whose stages build on each other
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 15 * 60 * 1000,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${port}`,
    // The game fits its canvas to the window, and the runner's building site has to be in view and clear of the
    // panels
    viewport: {width: 1440, height: 900},
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx webpack serve --mode production --port ${port} --no-hot --no-live-reload --no-client`,
    url: `http://localhost:${port}`,
    // A server already on the port could be another checkout's: never test against it
    reuseExistingServer: false,
    timeout: 3 * 60 * 1000,
    cwd: "..",
  },
});
