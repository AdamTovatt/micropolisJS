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

import { Displayable, requiredElement, setShown } from "./domElements";
import type { Outcome } from "./protocol";

// Why the player's own tool command built nothing, said in a toast beside the pointer, where it was as the result
// arrived, which shows for a few seconds, fading at the end as the stylesheet's keyframes fade it. One shows at a
// time: a new one replaces it. The pointer's events pass through it.

const ELEMENT_ID = "toolToast";

// How long a toast shows, its fade included, in milliseconds
export const TOAST_MS = 3000;

// How far right of and below the pointer a toast shows, and how near the page's edge it may come, in CSS pixels
const OFFSET = 16;
const MARGIN = 8;

// The outcomes of a tool command a toast tells the player of. A failed tile is left out, as the original left it
// unsaid: a drag often starts on a tile already built, such as the end of the road it extends, or crosses clear land
// with the bulldozer, so a command whose drag built fine comes back failed.
export type ToastedFailure = Exclude<Outcome, "ok" | "failed">;

// The failure a toast tells of for the outcome of the player's own tool command, or null for none
export function toastedFailure(outcome: Outcome | null): ToastedFailure | null {
  return outcome === null || outcome === "ok" || outcome === "failed" ? null : outcome;
}

// A place on the page, in CSS pixels from the top-left corner of the browser's viewport: not a canvas's pixels, as
// viewPosition.ts's PixelPoint is
export interface Point {
  x: number;
  y: number;
}

// A width and a height in the page's CSS pixels
export interface Size {
  width: number;
  height: number;
}

// Where a toast's top-left corner goes: right of and below the pointer, moved back inside the page where it would
// cross the page's right or bottom edge
export function toastPosition(pointer: Point, toast: Size, page: Size): Point {
  return {
    x: Math.max(MARGIN, Math.min(pointer.x + OFFSET, page.width - toast.width - MARGIN)),
    y: Math.max(MARGIN, Math.min(pointer.y + OFFSET, page.height - toast.height - MARGIN)),
  };
}

// What the toast reads and writes of its element, an E
export interface ToastElement<E> extends Displayable<E> {
  textContent: string | null;
  readonly style: {display: string, left: string, top: string, animationName: string, animationDuration: string};
  readonly offsetWidth: number;
  readonly offsetHeight: number;
}

export class Toast<E extends ToastElement<E>> {
  // The timer that hides the toast showing, null while none shows
  private timeout: ReturnType<typeof setTimeout> | null = null;

  // page gives the size of the page the toast is kept inside
  constructor(private readonly element: E, private readonly page: () => Size) {
    this.element.style.animationDuration = `${TOAST_MS}ms`;
    this.dismiss();
  }

  // Shows the text at the pointer, in place of any toast showing, and fades it from the start again
  show(text: string, pointer: Point): void {
    this.cancelTimeout();

    this.element.textContent = text;
    this.element.style.animationName = "none";
    setShown(this.element, true);

    // Placed once it shows, so it has the size of its text. Reading the size lays the page out, without the animation,
    // so giving the stylesheet's back starts it again.
    const at = toastPosition(pointer, {width: this.element.offsetWidth, height: this.element.offsetHeight},
                             this.page());
    this.element.style.left = `${at.x}px`;
    this.element.style.top = `${at.y}px`;
    this.element.style.animationName = "";

    this.timeout = setTimeout(() => this.dismiss(), TOAST_MS);
  }

  // Hides the toast now, before its time is up: the end-to-end runner's screenshots would otherwise show it or not
  // depending on how long the run took
  dismiss(): void {
    this.cancelTimeout();
    setShown(this.element, false);
  }

  private cancelTimeout(): void {
    if (this.timeout !== null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}

// The page's toast, which shows where the pointer last moved over the page
export interface PlacedToast {
  show(text: string): void;
  dismiss(): void;
}

export function placeToolToast(): PlacedToast {
  const toast = new Toast(requiredElement(ELEMENT_ID), () => ({width: window.innerWidth, height: window.innerHeight}));

  // A result arrives only for a command the player's pointer sent, so it has moved by then
  let pointer: Point = {x: window.innerWidth / 2, y: window.innerHeight / 2};
  document.addEventListener("pointermove", (e) => {
    pointer = {x: e.clientX, y: e.clientY};
  });

  return {
    show: (text) => toast.show(text, pointer),
    dismiss: () => toast.dismiss(),
  };
}
