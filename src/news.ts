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
import { spriteTile } from "./paintable";
import type { NewsMessage, NewsPlace, ShowablePlace, SpriteView, TrackablePlace } from "./protocol";
import { MessageTone, Text } from "./text";
import type { TilePoint } from "./viewPosition";

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

// Where the last news with a place happened, which the Last event button takes the view to, so the player finds it
// again after the notification bar has moved on: the place, and the type of the sprite the news follows, a monster or a
// tornado, or null
export class LastEvent {
  private place: NewsPlace | null = null;
  private sprite: number | null = null;

  // Remembers the message's place, if it has one, in place of the last
  heard(message: NewsMessage): void {
    const data = message.data;
    if (data === undefined) {
      return;
    }

    this.place = {x: data.x, y: data.y};
    this.sprite = "trackable" in data ? data.sprite : null;
  }

  // Whether any news has had a place
  get known(): boolean {
    return this.place !== null;
  }

  // The tile to centre the view on, or null before any news with a place: where the sprite the news follows is now,
  // while one of its type is on the map, and otherwise where the news happened
  where(sprites: readonly SpriteView[]): TilePoint | null {
    if (this.place === null) {
      return null;
    }

    const sprite = this.sprite === null ? undefined : sprites.find((candidate) => candidate.type === this.sprite);
    return sprite === undefined ? this.place : spriteTile(sprite);
  }
}
