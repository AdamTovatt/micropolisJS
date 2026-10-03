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


import { browserEnvironment } from "../src/browserCityEnvironment";

describe("the browser's city environment", () => {

  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("gives up on a request the server never answers", async () => {
    // Ends only when its signal aborts, as fetch does with no answer
    global.fetch = (_: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    });

    await expect(browserEnvironment(20).request("/api/session", {method: "GET", headers: {}}))
      .rejects.toHaveProperty("name", "TimeoutError");
  });
});
