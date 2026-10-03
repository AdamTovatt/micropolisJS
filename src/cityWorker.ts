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

import type { Ticker } from "./cityHost";
import type { Port } from "./cityWorkerMessages";
import { serveCity } from "./cityWorkerHost";

// The city's Web Worker, which the page starts (micropolis.ts): the simulation runs here, off the page's thread. The
// compiler's DOM library types the worker's scope as a window, so it is named by the port it is.

// The browser's ticker, which runs the host's loop
const ticker: Ticker = {now: () => performance.now(), later: (callback) => setTimeout(callback, 0)};

// A promise that rejects with no one to catch it is thrown, as an error thrown outside a call already is, so that the
// worker's error event carries it to the page
self.addEventListener("unhandledrejection", (event) => {
  throw event.reason instanceof Error ? event.reason : new Error(String(event.reason));
});

serveCity(self as unknown as Port, ticker);
