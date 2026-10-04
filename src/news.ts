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

import { CRASHES, DISASTER_MESSAGES, EXPLOSION_REPORTED } from "./messages";
import type { NewsMessage, ShowablePlace, TrackablePlace } from "./protocol";
import { MessageTone, Text } from "./text";

// What becomes of a message the simulation sends for the player: whether the notification bar announces it, and
// whether the monster TV shows where it happened

const DISASTER_HOLD = 20 * 1000;

// Holds news back while a disaster is recent: for DISASTER_HOLD after the last one reported. Neutral news waits behind
// any disaster's news. An explosion's report waits behind a crash's or another disaster's news, since a crash and a
// meltdown end in explosions, whose reports would otherwise replace their news at once. Good news is a milestone, which
// shows even over a recent disaster, as the notification is the only place the player learns of it.
export class NewsHold {
  private lastDisaster: number | null = null;
  private lastCalamity: number | null = null;

  // Whether a message about the subject, in the tone, shows at the time, in milliseconds. A disaster's or crash's news
  // that shows starts its hold again.
  shows(subject: string, tone: MessageTone, now: number): boolean {
    if (subject === EXPLOSION_REPORTED && isRecent(this.lastCalamity, now)) {
      return false;
    }

    if (tone === "bad") {
      const isDisaster = DISASTER_MESSAGES.indexOf(subject) !== -1;
      if (isDisaster) {
        this.lastDisaster = now;
      }
      if (subject !== EXPLOSION_REPORTED && (isDisaster || CRASHES.indexOf(subject) !== -1)) {
        this.lastCalamity = now;
      }
      return true;
    }

    return tone !== "neutral" || !isRecent(this.lastDisaster, now);
  }
}

function isRecent(time: number | null, now: number): boolean {
  return time !== null && now - time <= DISASTER_HOLD;
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

export function routeMessage(message: NewsMessage, hold: NewsHold, now: number): NewsRoute {
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

  return {notify: hold.shows(subject, tone, now), tv, unknown: false};
}
