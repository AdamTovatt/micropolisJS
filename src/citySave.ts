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

import type { CitySource } from "./citySource";
import type { Storage } from "./storage";

// What the Save button does: saves the city where it is kept, which is one place. A city in the browser is kept in
// the page's storage, as the text its source gives; a city on the server is kept in the server's store and nowhere
// else, so storage keeps what it held, the last save of a city played in the browser. It fails as the source's save
// does, keeping nothing.
export async function saveCity(source: Pick<CitySource, "save">, storage: Pick<typeof Storage, "saveText">): Promise<void> {
  const text = await source.save();

  if (text !== null) {
    storage.saveText(text);
  }
}
