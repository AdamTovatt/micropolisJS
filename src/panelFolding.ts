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

import { PageStore, StoredText, parseStored } from "./storage";

// The panels over the map that fold to a slim title strip and unfold again, by the button on the strip. Each is an
// element of the page that names itself in data-panel, holding its strip, with the title and the button, and its body,
// which the stylesheet hides while the panel has the class "folded". Which panels are folded is one setting of the
// browser's, kept in localStorage, not of the player's, since a player has a new id at each sign-in.

export const FOLDED_PANELS_KEY = "micropolisJSFoldedPanels";

// Every panel that folds, by the name its element gives in data-panel
export const PANELS = ["city", "menu", "demand", "map", "tools", "status", "overlay", "online", "activity"] as const;

export type PanelName = typeof PANELS[number];

function isPanelName(name: unknown): name is PanelName {
  return (PANELS as readonly unknown[]).includes(name);
}

// Which panels are folded, as the page keeps them: none until the player folds one. The setting is read as the page
// starts and written each time it changes. A store that can't be read or written leaves the setting held for this page
// only (StoredText), and a stored setting that isn't a list of panels, written by something other than this page, is
// read as none folded, which is said.
export class FoldedPanels {
  private readonly text: StoredText;
  private readonly folded: Set<PanelName>;

  constructor(store: PageStore | null) {
    this.text = new StoredText(store, FOLDED_PANELS_KEY);
    this.folded = new Set(this.read());
  }

  isFolded(panel: PanelName): boolean {
    return this.folded.has(panel);
  }

  setFolded(panel: PanelName, folded: boolean): void {
    if (folded) {
      this.folded.add(panel);
    } else {
      this.folded.delete(panel);
    }
    this.text.write(JSON.stringify(Array.from(this.folded)));
  }

  private read(): PanelName[] {
    const text = this.text.read();
    if (text === null) {
      return [];
    }

    const value = parseStored(text);
    if (!Array.isArray(value) || !value.every(isPanelName)) {
      console.warn(`The panels folded in this browser aren't a list of them, so every panel unfolds: ${text}`);
      return [];
    }

    return value;
  }
}

// What folding reads and writes of a panel's element and of the button on its strip
export interface FoldingElements {
  panel: {readonly classList: {toggle(token: string, force: boolean): boolean}};
  button: {
    textContent: string | null;
    setAttribute(name: string, value: string): void;
    addEventListener(type: "click", listener: () => void): void;
  };
}

// Folds and unfolds the panels, as their buttons and the keys ask, showing each as the setting has it
export class PanelFolding {
  constructor(private readonly panels: ReadonlyMap<PanelName, FoldingElements>,
              private readonly setting: FoldedPanels) {
    panels.forEach((elements, name) => {
      elements.button.addEventListener("click", () => this.toggle(name));
      this.show(name);
    });
  }

  // Folds the panel if it is unfolded, or unfolds it, and remembers which
  toggle(panel: PanelName): void {
    this.setting.setFolded(panel, !this.setting.isFolded(panel));
    this.show(panel);
  }

  private show(panel: PanelName): void {
    const elements = this.panels.get(panel);
    if (elements === undefined) {
      throw new Error(`No panel ${panel} to fold`);
    }

    const folded = this.setting.isFolded(panel);
    elements.panel.classList.toggle("folded", folded);
    elements.button.textContent = folded ? "Show" : "Hide";
    elements.button.setAttribute("aria-expanded", String(!folded));
  }
}

// Folding for every panel of the page, which must have each one, with the button on its strip
export function placePanelFolding(store: PageStore | null): PanelFolding {
  const panels = new Map<PanelName, FoldingElements>();

  for (const name of PANELS) {
    const panel = document.querySelector<HTMLElement>(`[data-panel="${name}"]`);
    const button = panel?.querySelector<HTMLElement>(".foldStrip .foldButton");
    if (panel === null || button === null || button === undefined) {
      throw new Error(`The page has no ${name} panel with a button on its strip`);
    }

    panels.set(name, {panel, button});
  }

  return new PanelFolding(panels, new FoldedPanels(store));
}
