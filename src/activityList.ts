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

import { setShown } from "./domElements";
import { ActivityFeed, activityEntry, LINE_LIFETIME_MS } from "./playerActivity";
import type { PlayerRoster } from "./playerRoster";
import type { CommandResult } from "./protocol";

// The activity list under the online list: what the other players in a shared city did lately, a line each, fading as
// it ages (playerActivity.ts decides what it says). It lists apart from the notification bar, so a player's activity
// never pushes city news off it.

export class ActivityList {
  private readonly feed = new ActivityFeed();
  // The element of each line showing, by its player and key, and the time of the command it shows
  private elements = new Map<string, {at: number, element: HTMLElement}>();
  private expiry: ReturnType<typeof setTimeout> | null = null;

  // The panel shows while it has lines, which go in the element given for them
  constructor(private readonly panel: HTMLElement, private readonly lineList: HTMLElement,
              private readonly roster: PlayerRoster) {
    setShown(panel, false);
  }

  add(result: CommandResult): void {
    const entry = activityEntry(result, this.roster);
    if (entry !== null) {
      this.feed.add(entry, Date.now());
      this.render();
    }
  }

  // A line that tells of a newer command is drawn afresh, so its fade starts again
  private render(): void {
    const now = Date.now();
    const lines = this.feed.showing(now);
    const shown = new Map<string, {at: number, element: HTMLElement}>();

    lines.forEach((line) => {
      const id = `${line.player}\n${line.key}`;
      const existing = this.elements.get(id);

      if (existing !== undefined && existing.at === line.at) {
        shown.set(id, existing);
        return;
      }

      const element = document.createElement("div");
      element.className = "activityLine";
      element.style.animationDuration = `${LINE_LIFETIME_MS}ms`;
      // A name is the player's own text, so it is only ever text here
      element.textContent = line.text;
      shown.set(id, {at: line.at, element});
    });

    this.elements = shown;
    this.lineList.replaceChildren(...Array.from(shown.values(), ({element}) => element));
    setShown(this.panel, lines.length > 0);

    if (this.expiry !== null) {
      clearTimeout(this.expiry);
      this.expiry = null;
    }

    // The oldest line goes first
    if (lines.length > 0) {
      const oldest = Math.min(...lines.map((line) => line.at));
      this.expiry = setTimeout(() => this.render(), oldest + LINE_LIFETIME_MS - now);
    }
  }
}
