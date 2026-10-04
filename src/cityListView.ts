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

import { appendElement, requiredElement, setShown } from "./domElements";
import { CityList, KnownCity } from "./storage";

// The splash screen's list of the cities this browser started or joined, the one played last first, each to join
// again or forget. Forgetting a city takes it off the list only: it stays on the server, and its link still joins it.
// The list hides while it has no city.
export class CityListView {
  private readonly panel = requiredElement("splashCities");
  private readonly list = requiredElement("splashCityList");

  // rejoin is called with the city the player chooses to join again
  constructor(private readonly cities: CityList, private readonly rejoin: (known: KnownCity) => void) {
    this.show();
  }

  // Takes the list off the splash screen as it goes
  withdraw(): void {
    this.list.replaceChildren();
    setShown(this.panel, false);
  }

  private show(): void {
    const cities = this.cities.cities();
    this.list.replaceChildren();
    setShown(this.panel, cities.length > 0);

    cities.forEach((known) => {
      const item = appendElement(this.list, "li");

      // A save loaded as a new city keeps its name, so the start of the id tells two of one name apart
      const rejoin = appendElement(item, "button", "splashRejoin");
      rejoin.textContent = known.name;
      appendElement(rejoin, "span", "splashCityId").textContent = known.city.slice(0, 6);
      rejoin.title = `Join ${known.name} again (${known.city})`;
      rejoin.addEventListener("click", (e) => {
        e.preventDefault();
        this.rejoin(known);
      });

      const forget = appendElement(item, "button", "splashForget");
      forget.textContent = "Forget";
      forget.title = `Take ${known.name} off this list. The city stays on the server, and its link still joins it.`;
      forget.addEventListener("click", (e) => {
        e.preventDefault();
        this.cities.forget(known.city);
        this.show();
      });
    });
  }
}
