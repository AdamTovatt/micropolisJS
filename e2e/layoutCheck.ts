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

import type { Page } from "@playwright/test";

import { AA_NORMAL_TEXT, contrastRatio, cssColour, laidOver } from "../test/helpers/contrast";

// The HUD's layout check: the page measures each panel showing and every element in it as the browser lays them out,
// and the check finds, from what it measured, an element outside its panel, one whose content overflows its box or
// whose text is cut off, a panel outside the screen, two panels overlapping, a text under WCAG AA's 4.5:1 against what
// it is drawn on over the darkest and the lightest map, and a text in any font but Inter.

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// An element of a panel, as the page measured it
interface MeasuredElement {
  // Its id, or its tag and classes, and the start of its text
  name: string;
  text: string;
  // Its box, the part of it its panel's elements that clip show, and the part those that don't scroll show
  whole: Box;
  shown: Box;
  unscrolled: Box;
  // Whether its content runs past its box, where it doesn't clip or scroll by design
  overflows: boolean;
  // For an element with text of its own, the text's colour, the background colours under it from the page's down to
  // its own, as the browser computes them, and its font
  ownText: {colour: string, backgrounds: string[], font: string} | null;
}

interface MeasuredPanel {
  name: string;
  id: string;
  box: Box;
  // The panel's own element first
  elements: MeasuredElement[];
}

interface Measured {
  screen: {width: number, height: number};
  panels: MeasuredPanel[];
}

// What the browser lays out: every panel showing, and every element showing in each. Runs in the page, so it is
// self-contained.
function measure(): Measured {
  const shows = (element: Element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
  };
  const name = (element: Element) =>
    element.id !== "" ? `#${element.id}` : `${element.tagName.toLowerCase()}.${element.getAttribute("class") ?? ""}`;
  const boxOf = (element: Element): Box => {
    const {left, top, right, bottom} = element.getBoundingClientRect();
    return {left, top, right, bottom};
  };
  const clip = (box: Box, by: Box): Box => ({
    left: Math.max(box.left, by.left), top: Math.max(box.top, by.top), right: Math.min(box.right, by.right),
    bottom: Math.min(box.bottom, by.bottom),
  });
  const scrolls = (element: Element) => ["auto", "scroll"].includes(getComputedStyle(element).overflowY);

  const panels = Array.from(document.querySelectorAll(".hudPanel, #toolToast")).filter(shows);
  return {
    screen: {width: innerWidth, height: innerHeight},
    panels: panels.map((panel) => ({
      name: name(panel),
      id: panel.id,
      box: boxOf(panel),
      elements: [panel, ...Array.from(panel.querySelectorAll("*"))].filter(shows).map((element) => {
        const style = getComputedStyle(element);
        // Its own text, a closed select's chosen option or a field's value
        const own = Array.from(element.childNodes).some((node) => node.nodeType === Node.TEXT_NODE &&
                                                                   (node.textContent ?? "").trim() !== "") ||
          element instanceof HTMLSelectElement || element instanceof HTMLInputElement;

        // Where it shows, clipped by what clips it within its panel. Text clipped is text cut off, but for text a list
        // that scrolls by design has scrolled out of sight.
        const whole = boxOf(element);
        let shown = whole;
        let unscrolled = whole;
        for (let parent = element.parentElement; parent !== null && parent !== panel; parent = parent.parentElement) {
          if (getComputedStyle(parent).overflow !== "visible") {
            shown = clip(shown, boxOf(parent));
            if (!scrolls(parent)) {
              unscrolled = clip(unscrolled, boxOf(parent));
            }
          }
        }

        // Its content within its box, but for a list that scrolls by design, a field, whose value scrolls within it,
        // and what an element without text of its own clips by design, such as the minimap's view rectangle in its
        // frame
        const clips = (overflow: string) => ["hidden", "clip"].includes(overflow) && !own;
        const overflows = element instanceof HTMLElement && !(element instanceof HTMLInputElement) &&
          style.display !== "inline" &&
          ((!clips(style.overflowX) && element.scrollWidth > element.clientWidth + 1) ||
           (!clips(style.overflowY) && !scrolls(element) && element.scrollHeight > element.clientHeight + 1));

        const chain: Element[] = [];
        for (let e: Element | null = element; e !== null && e !== document.body; e = e.parentElement) {
          chain.unshift(e);
        }

        return {
          name: name(element),
          text: (element.textContent ?? "").trim().slice(0, 30),
          whole, shown, unscrolled, overflows,
          ownText: own ? {
            colour: style.color, backgrounds: chain.map((e) => getComputedStyle(e).backgroundColor),
            font: style.fontFamily,
          } : null,
        };
      }),
    })),
  };
}

// The darkest and the lightest the map can be under a see-through panel
const MAP_EXTREMES = ["#000000", "#ffffff"];

// The HUD's font, which every text of it is drawn in
const HUD_FONT = /^["']?Inter["']?(,|$)/;

function inside(inner: Box, outer: Box): boolean {
  return inner.left >= outer.left - 0.5 && inner.top >= outer.top - 0.5 && inner.right <= outer.right + 0.5 &&
    inner.bottom <= outer.bottom + 0.5;
}

function overlap(a: Box, b: Box): boolean {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
}

// The least contrast a text has against what it is drawn on, over the darkest and the lightest map
function worstContrast({colour, backgrounds}: {colour: string, backgrounds: string[]}): number {
  return Math.min(...MAP_EXTREMES.map((map) => {
    const under = backgrounds.reduce((below, background) => laidOver(cssColour(background), below), map);
    return contrastRatio(laidOver(cssColour(colour), under), under);
  }));
}

// The problems in what the page measured
function problemsIn({screen, panels}: Measured): string[] {
  const problems: string[] = [];
  const screenBox = {left: 0, top: 0, right: screen.width, bottom: screen.height};

  panels.forEach((panel, at) => {
    if (!inside(panel.box, screenBox)) {
      problems.push(`${panel.name} leaves the ${screen.width}x${screen.height} screen`);
    }

    for (const other of panels.slice(at + 1)) {
      if (overlap(panel.box, other.box)) {
        problems.push(`${panel.name} and ${other.name} overlap`);
      }
    }

    panel.elements.forEach((element, index) => {
      const said = `${element.name} "${element.text}"`;
      if (index > 0 && element.shown.right > element.shown.left && element.shown.bottom > element.shown.top &&
          !inside(element.shown, panel.box)) {
        problems.push(`${said} shows outside ${panel.name}`);
      }
      if (element.ownText !== null && !inside(element.whole, element.unscrolled)) {
        problems.push(`${said} is cut off in ${panel.name}`);
      }
      if (element.overflows) {
        problems.push(`${said} overflows its box in ${panel.name}`);
      }
      if (element.ownText !== null) {
        const worst = worstContrast(element.ownText);
        if (worst < AA_NORMAL_TEXT) {
          problems.push(`${said} reads at ${worst.toFixed(2)}:1 in ${panel.name}`);
        }
        if (!HUD_FONT.test(element.ownText.font)) {
          problems.push(`${said} is drawn in ${element.ownText.font} in ${panel.name}`);
        }
      }
    });
  });

  return problems;
}

// What the layout check finds on the page: each problem, and the ids of the panels showing
export async function checkLayout(page: Page): Promise<{problems: string[], panels: string[]}> {
  const measured = await page.evaluate(measure);
  return {problems: problemsIn(measured), panels: measured.panels.map((panel) => panel.id)};
}
