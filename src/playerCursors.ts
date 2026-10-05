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

import type { MouseOutline } from "./gameCanvas";
import type { PlayerRoster } from "./playerRoster";
import { Cursor, CursorMessage, CursorTool, isCursorTool, PlayerId } from "./protocol";
import type { TilePoint } from "./viewPosition";

// The players' hover boxes in a shared city: when this player's goes to the server, and which of the others' the map
// shows, each in the colour of the tool they hold, as this player's own is, with their name beside it on a tag in
// their player's colour. protocol/README.md gives the timings.

// The least time between two reports of this player's box, in milliseconds: at most 5 a second
export const REPORT_INTERVAL_MS = 200;

// How often a box that holds still is reported again, so the others don't drop it
export const RESEND_MS = 2000;

// How long another player's box shows after the last word of it
export const CURSOR_TIMEOUT_MS = 5000;

// The colours of the others' name tags, which a player's id picks from, so every browser shows a player in the same
// one
export const PLAYER_COLOURS = ["#e6194b", "#f58231", "#ffe119", "#3cb44b", "#42d4f4", "#4363d8", "#911eb4", "#f032e6"];

function sameCursor(a: Cursor | null, b: Cursor | null): boolean {
  return a === b || (a !== null && b !== null && a.tool === b.tool && a.x === b.x && a.y === b.y && a.size === b.size);
}

// This player's box as the others see it: the tool held, and the map tile under the pointer, or null when there is
// no tool, the pointer is off the view, or over the margin around the map
export function reportedCursor(tool: string | null, size: number, tile: TilePoint | null,
                               onMap: (x: number, y: number) => boolean): Cursor | null {
  if (!isCursorTool(tool) || tile === null || !onMap(tile.x, tile.y)) {
    return null;
  }

  return {tool, x: tile.x, y: tile.y, size};
}

// Decides when this player's box goes to the server: a change once REPORT_INTERVAL_MS has passed since the last
// report, so the latest place goes once the interval is up, and a box that holds still every RESEND_MS. A box that
// leaves the map goes as null, once.
export class CursorReporter {
  private reported: Cursor | null = null;
  private reportedAt: number | null = null;

  constructor(private readonly report: (cursor: Cursor | null) => void) {}

  // The box now, at the time in milliseconds, which is called with as often as the box may move
  update(cursor: Cursor | null, now: number): void {
    const since = this.reportedAt === null ? Infinity : now - this.reportedAt;
    const due = sameCursor(cursor, this.reported) ? cursor !== null && since >= RESEND_MS : since >= REPORT_INTERVAL_MS;

    if (due) {
      this.reported = cursor;
      this.reportedAt = now;
      this.report(cursor);
    }
  }
}

// Another player's box as the map shows it
export interface CursorView {
  player: PlayerId;
  name: string;
  colour: string;
  cursor: Cursor;
}

// The colour of a player's name tag: FNV-1a over the id's UTF-16 code units, which picks one of PLAYER_COLOURS
export function playerColour(player: PlayerId): string {
  let hash = 0x811c9dc5;

  for (let i = 0; i < player.length; i++) {
    hash = Math.imul(hash ^ player.charCodeAt(i), 0x01000193) >>> 0;
  }

  return PLAYER_COLOURS[hash % PLAYER_COLOURS.length];
}

// The other players' boxes the server has passed on. A box shows while its player is online and for CURSOR_TIMEOUT_MS
// after the last word of it, so none shows while the client is offline. A box from a player the roster doesn't list
// as online is dropped: the server lists a player before passing on their box, and a box that still comes first is
// sent again within RESEND_MS.
export class OtherCursors {
  private readonly boxes = new Map<PlayerId, {cursor: Cursor, at: number}>();

  constructor(private readonly roster: PlayerRoster) {}

  receive(message: CursorMessage, now: number): void {
    if (message.cursor === null || !this.roster.othersOnline().includes(message.player)) {
      this.boxes.delete(message.player);
    } else {
      this.boxes.set(message.player, {cursor: message.cursor, at: now});
    }
  }

  // The boxes showing at the time, in the order their players came online
  showing(now: number): CursorView[] {
    const online = this.roster.othersOnline();

    this.boxes.forEach(({at}, player) => {
      if (now - at >= CURSOR_TIMEOUT_MS || !online.includes(player)) {
        this.boxes.delete(player);
      }
    });

    const views: CursorView[] = [];
    online.forEach((player) => {
      const box = this.boxes.get(player);
      const name = this.roster.otherName(player);
      if (box !== undefined && name !== null) {
        views.push({player, name, colour: playerColour(player), cursor: box.cursor});
      }
    });

    return views;
  }
}

// The outlines the canvas draws for the others' boxes, each at its map tile, in the colour of its tool, and named on a
// tag in its player's colour
export function otherOutlines(views: readonly CursorView[], toolColour: (tool: CursorTool) => string): MouseOutline[] {
  return views.map(({name, colour, cursor}) => ({
    x: cursor.x,
    y: cursor.y,
    width: cursor.size,
    height: cursor.size,
    colour: toolColour(cursor.tool),
    label: {name, colour},
  }));
}
