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

import type { CityStatus } from "./cityClient";
import type { PlayerId } from "./protocol";

// The players of the shared city as the server lists them, and which of them is this client: what the activity list
// and the other players' hover boxes know of who is who. With no server there are no others.
export class PlayerRoster {
  private you: PlayerId | null = null;
  private others: readonly PlayerId[] = [];
  // Every player seen, kept after they leave, so a command of theirs that the city applies after they went is still
  // named
  private readonly names = new Map<PlayerId, string>();

  update(status: CityStatus): void {
    if (!status.online) {
      this.you = null;
      this.others = [];
      return;
    }

    const you = status.you;
    this.you = you;
    this.others = status.players.filter((player) => player.id !== you).map((player) => player.id);
    status.players.forEach((player) => this.names.set(player.id, player.name));
  }

  // The name of a player other than this client, or null for this client, a player never seen, or any player while
  // there is no server, where the one player is this client
  otherName(player: PlayerId): string | null {
    if (this.you === null || player === this.you) {
      return null;
    }

    return this.names.get(player) ?? null;
  }

  // The players other than this client online now, in the order they came online
  othersOnline(): readonly PlayerId[] {
    return this.others;
  }
}
