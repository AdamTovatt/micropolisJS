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

import { CityClient, CityStatus } from "./cityClient";

// The small list of who is online, over the top of the map: "Not connected" when no server answers or the connection
// is down, otherwise every player online, the player at this screen marked as "you".

// What the list shows after the title on its panel's strip, Online: the players, or else why there are none
export interface OnlineListView {
  notConnected: string;
  title: string;
  // Each player's name as shown, in the order they came online
  players: string[];
}

// Every decision about what the list shows is made here, so it is tested under node
export function onlineListView(status: CityStatus): OnlineListView {
  if (!status.online) {
    return {notConnected: "Not connected", title: "Not connected to a server", players: []};
  }

  return {
    notConnected: "",
    title: "",
    players: status.players.map((player) => player.id === status.you ? `${player.name} (you)` : player.name),
  };
}

function render(container: HTMLElement, view: OnlineListView): void {
  container.textContent = view.notConnected;
  container.title = view.title;

  view.players.forEach((text, i) => {
    if (i > 0) {
      container.appendChild(document.createTextNode(", "));
    }

    const name = document.createElement("span");
    name.className = "onlinePlayer";
    // A name is the player's own text, so it is only ever text here
    name.textContent = text;
    container.appendChild(name);
  });
}

export function showOnlineList(container: HTMLElement, client: CityClient): void {
  client.onStatus((status) => render(container, onlineListView(status)));
}
