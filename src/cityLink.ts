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

import type { StartedCity } from "./citySource";
import { withCityOption, withoutCityOption } from "./urlOptions";

// A city on the server in the page's address (?city=<id>): a city started on the server puts its id there, so the
// address invites another player in and a reload rejoins; the page opened with one joins that city; and a city the page
// loses on the server takes the player back to choose another.

// What the page needs of the browser, so a test can stand in for it
export interface PageWindow {
  alert(message: string): void;
  location: {href: string, assign(url: string): void};
  history: {state: unknown, replaceState(data: unknown, unused: string, url: string): void};
}

// What joins a city on the server: the WebSocket source, once a server has welcomed the player
export interface CityJoiner {
  join(city: string): Promise<StartedCity>;
}

// Joins the city the page was opened with, and plays it, or says why it can't, after which the player chooses a city on
// the splash screen. Whether it joined.
export async function joinLinkedCity(city: string, joiner: CityJoiner | null, play: (started: StartedCity) => void,
                                     page: PageWindow): Promise<boolean> {
  if (joiner === null) {
    page.alert("The city in this link is on the server, which isn't answering, so the game plays in the browser: " +
               "choose a city to start.");
    return false;
  }

  let started: StartedCity;
  try {
    started = await joiner.join(city);
  } catch (e) {
    page.alert(`The city in this link can't be joined: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }

  play(started);
  return true;
}

// Puts a city on the server in the page's address, in place of the page's own entry in its history
export function linkToCity(started: StartedCity, page: PageWindow): void {
  if (started.city !== null) {
    page.history.replaceState(page.history.state, "", withCityOption(page.location.href, started.city));
  }
}

// Says why the page is no longer in its city on the server, and goes to the page without it, where the player chooses
// a city. The city's link stays in the history, so the Back button returns to it.
export function leaveLostCity(error: Error, page: PageWindow): void {
  page.alert(`This city is no longer open here: ${error.message}. Its link joins it again.`);
  page.location.assign(withoutCityOption(page.location.href));
}
