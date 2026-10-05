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

// Finding and building the page's DOM

// The element with the id, which the page must have, of the kind given: an HTMLElement unless another is named
export function requiredElement(id: string): HTMLElement;
export function requiredElement<T extends HTMLElement>(id: string, kind: new () => T): T;
export function requiredElement(id: string, kind: new () => HTMLElement = HTMLElement): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Node #${id} not found`);
  }

  if (!(element instanceof kind)) {
    throw new Error(`Node #${id} is not an ${kind.name}`);
  }

  return element;
}

// Whether the checkbox or radio button with the id, which the page must have, is checked
export function isChecked(id: string): boolean {
  return requiredElement(id, HTMLInputElement).checked;
}

// A new canvas with the id, in the parent in place of an element of that id there, as when a canvas is made again, or
// else before the child given, or last. An element of the id anywhere else in the document is an error.
export function placeNewCanvas(parent: Node, id: string, before: Node | null = null): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.id = id;

  const current = document.getElementById(id);
  if (current === null) {
    parent.insertBefore(canvas, before);
  } else if (current.parentNode === parent) {
    parent.replaceChild(canvas, current);
  } else {
    throw new Error(`ID ${id} already exists in document!`);
  }

  return canvas;
}

// The canvas sized to show width by height CSS pixels, with a backing store of the given pixels for each CSS pixel, so
// what is drawn on it is sharp on a dense screen
export function sizeCanvas(canvas: HTMLCanvasElement, width: number, height: number, pixelRatio: number): void {
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

// The screen's device pixels for each CSS pixel, which a canvas's backing store matches
export function screenPixelRatio(): number {
  return window.devicePixelRatio || 1;
}

// Whether an element takes typing, Space included, while it has the focus: a text field or another form control a key
// sets, such as a select or a check box, or editable text. A button is not one: a tool button keeps the focus once
// clicked, and Space there pans the map rather than pressing the button again.
export function takesTyping(element: EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element instanceof HTMLInputElement) {
    return !["button", "submit", "reset", "image"].includes(element.type);
  }

  return element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement || element.isContentEditable;
}

// What showing and hiding an element reads and writes
// The window whose stylesheets lay out elements of type E
export interface StylingWindow<E> {
  getComputedStyle(element: E): {readonly display: string};
}

// What showing and hiding an element reads and writes: its inline display, and the window that styles it
export interface Displayable<E> {
  readonly style: {display: string};
  readonly ownerDocument: {readonly defaultView: StylingWindow<E> | null};
}

// Whether the element shows: it has a box on the page, which it has not under an ancestor that hides, as jQuery's
// :visible tested
export function isShown(element: {getClientRects(): {length: number}}): boolean {
  return element.getClientRects().length > 0;
}

// Whether the element's own display hides it, inline or from the stylesheet, whatever its ancestors do
export function isHidden<E extends Displayable<E>>(element: E): boolean {
  const view = element.ownerDocument.defaultView;
  if (view === null) {
    throw new Error("The element is in no window");
  }

  return view.getComputedStyle(element).display === "none";
}

// Hides the element, or shows it as the stylesheet lays it out, or as a block where the stylesheet hides it, as
// jQuery's show and hide did
export function setShown<E extends Displayable<E>>(element: E, shown: boolean): void {
  if (!shown) {
    element.style.display = "none";
    return;
  }

  element.style.display = "";
  if (isHidden(element)) {
    element.style.display = "block";
  }
}

// Shows the element if its own display hides it, or hides it, as jQuery's toggle did, and says whether it shows now
export function toggleShown<E extends Displayable<E>>(element: E): boolean {
  const shows = isHidden(element);
  setShown(element, shows);
  return shows;
}

// A new element of the tag, with the class name if one is given, appended to the parent
export function appendElement<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tagName: K,
                                                                     className?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className !== undefined) {
    element.className = className;
  }
  parent.appendChild(element);
  return element;
}
