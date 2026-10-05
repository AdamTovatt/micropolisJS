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

import { defineConfig } from "@playwright/test";

import suite from "./playwright.config";

// The render benchmark (renderBenchmark.ts), run by hand and never by CI, since its numbers belong to the machine. It
// plays in the browser the end-to-end suite plays in, with the same flags and the same production build, and its file
// is no spec, so the suite never runs it.
export default defineConfig({
  ...suite,
  testMatch: "renderBenchmark.ts",
  timeout: 30 * 60 * 1000,
});
