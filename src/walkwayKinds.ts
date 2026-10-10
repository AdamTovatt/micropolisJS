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

import { WALKWAY_KINDS } from "./protocol";
import type { CursorTool, WalkwayKind } from "./protocol";

// Which kind of walkway the Walkway tool lays: a path, a footbridge or an underpass, chosen on a strip of buttons over
// the tools, one for each kind, which shows only while the Walkway tool is held. The kind chosen stays chosen from one
// holding of the tool to the next, a path until the player chooses another.
export class WalkwayKindChoice {
  private chosen: WalkwayKind = "path";
  private readonly buttons: {kind: WalkwayKind, button: HTMLElement}[];

  // strip holds a button for each kind, its data-kind naming it; a strip that offers another kind, or not every one,
  // is a defect in the page
  constructor(private readonly strip: HTMLElement) {
    this.buttons = Array.from(strip.querySelectorAll<HTMLElement>("[data-kind]"), (button) => {
      const kind = button.dataset.kind;
      if (!WALKWAY_KINDS.some((each) => each === kind)) {
        throw new Error(`A walkway kind button names no kind: ${kind}`);
      }
      button.addEventListener("click", (e) => {
        this.choose(kind as WalkwayKind);
        e.preventDefault();
      });
      return {kind: kind as WalkwayKind, button};
    });

    const missing = WALKWAY_KINDS.filter((kind) => !this.buttons.some((each) => each.kind === kind));
    if (missing.length > 0) {
      throw new Error(`No walkway kind button offers these kinds: ${missing.join(", ")}`);
    }
    this.choose(this.chosen);
  }

  // The kind the Walkway tool lays
  get kind(): WalkwayKind {
    return this.chosen;
  }

  // Shows the strip while the tool held is the Walkway, and hides it otherwise
  showFor(tool: CursorTool | null): void {
    this.strip.classList.toggle("hidden", tool !== "walkway");
  }

  private choose(kind: WalkwayKind): void {
    this.chosen = kind;
    for (const {kind: each, button} of this.buttons) {
      button.setAttribute("aria-pressed", String(each === kind));
    }
  }
}
