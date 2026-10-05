/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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

import { ActivityList } from "./activityList";
import type { Presence } from "./cityClient";
import type { MouseOutline } from "./gameCanvas";
import { CursorReporter, OtherCursors, otherOutlines, reportedCursor } from "./playerCursors";
import { PlayerRoster } from "./playerRoster";
import type { CommandResult, CursorTool } from "./protocol";
import type { TilePoint } from "./viewPosition";

// The other players in the city as this player sees them: what they did, named in the activity list, and their hover
// boxes on the map, as this player's goes to them. Both know who is who from one roster, which the online list's
// statuses keep.
export class OtherPlayers {
  private readonly roster = new PlayerRoster();
  private readonly activityList: ActivityList;
  private readonly cursors = new OtherCursors(this.roster);
  private readonly reporter: CursorReporter;

  // The activity list is the panel, which shows while it has lines, and the element of its lines
  constructor(presence: Presence, activityPanel: HTMLElement, activityLines: HTMLElement) {
    this.activityList = new ActivityList(activityPanel, activityLines, this.roster);
    this.reporter = new CursorReporter((cursor) => presence.reportCursor(cursor));
    presence.onStatus((status) => this.roster.update(status));
    presence.onCursor((message) => this.cursors.receive(message, Date.now()));
  }

  // Names the command in the activity list when another player sent it
  commandResult(result: CommandResult): void {
    this.activityList.add(result);
  }

  // Tells the others where this player's box is: the tool held, and the map tile under the pointer, or null when it
  // isn't shown
  reportCursor(tool: string | null, size: number, tile: TilePoint | null, onMap: (x: number, y: number) => boolean): void {
    this.reporter.update(reportedCursor(tool, size, tile, onMap), Date.now());
  }

  // The others' boxes to draw, each in the colour of the tool its player holds
  outlines(toolColour: (tool: CursorTool) => string): MouseOutline[] {
    return otherOutlines(this.cursors.showing(Date.now()), toolColour);
  }
}
