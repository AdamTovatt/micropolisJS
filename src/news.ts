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

import { DISASTER_MESSAGES } from "./messages";
import type { TrackableSprite } from "./monsterTV";
import type { NotificationMessage } from "./notification";
import { MessageTone, Text } from "./text";

// What becomes of a message the simulation sends for the player: whether the notification bar announces it, and
// whether the monster TV shows where it happened

const DISASTER_HOLD = 20 * 1000;

// Where a message happened, in map tiles
interface Place {
  x: number;
  y: number;
}

// A place the monster TV shows
export interface ShowablePlace extends Place {
  showable: true;
}

// A place the monster TV shows, following the sprite there as it moves
export interface TrackablePlace extends Place {
  trackable: true;
  sprite: TrackableSprite;
}

// A message the simulation sends for the player: its subject, from messages.ts, and where it happened, if it did
// somewhere
export interface FrontEndMessage extends NotificationMessage {
  data?: Place | ShowablePlace | TrackablePlace;
}

// Holds neutral news back while a disaster is recent: for DISASTER_HOLD after the last one reported. Good news is a
// milestone, which shows even over a recent disaster, as the notification is the only place the player learns of it.
export class NewsHold {
  private lastDisaster: number | null = null;

  // Whether a message in the tone shows at the time, in milliseconds. A disaster's news starts the hold again.
  shows(tone: MessageTone, isDisaster: boolean, now: number): boolean {
    if (tone === "bad") {
      if (isDisaster) {
        this.lastDisaster = now;
      }
      return true;
    }

    return tone !== "neutral" || this.lastDisaster === null || now - this.lastDisaster > DISASTER_HOLD;
  }
}

// What the game does with a message
export interface NewsRoute {
  // Whether the notification bar announces it
  notify: boolean;
  // The place the monster TV shows, or null to leave the TV as it is
  tv: ShowablePlace | TrackablePlace | null;
  // Whether the subject is one there is no text for
  unknown: boolean;
}

export function routeMessage(message: FrontEndMessage, hold: NewsHold, now: number): NewsRoute {
  const subject = message.subject;
  const tone = Object.prototype.hasOwnProperty.call(Text.messages, subject) ? Text.messages[subject].tone : null;

  // Good news is a milestone, which the monster TV has nothing to show for
  if (tone === "good") {
    return {notify: true, tv: null, unknown: false};
  }

  const data = message.data;
  const tv = data !== undefined && ("showable" in data || "trackable" in data) ? data : null;

  if (tone === null) {
    return {notify: false, tv, unknown: true};
  }

  return {notify: hold.shows(tone, DISASTER_MESSAGES.indexOf(subject) !== -1, now), tv, unknown: false};
}
