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

// A new canvas with the id, in the parent in place of an element of that id there, as when a canvas is made again. An
// element of the id anywhere else in the document is an error.
export function placeNewCanvas(parent: Node, id: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.id = id;

  const current = document.getElementById(id);
  if (current === null) {
    parent.appendChild(canvas);
  } else if (current.parentNode === parent) {
    parent.replaceChild(canvas, current);
  } else {
    throw new Error(`ID ${id} already exists in document!`);
  }

  return canvas;
}

// What showing and hiding an element reads and writes
export interface Displayable {
  readonly style: {display: string};
  getClientRects(): {length: number};
}

// Whether the element shows: it has a box on the page, as jQuery's :visible tested
export function isShown(element: Displayable): boolean {
  return element.getClientRects().length > 0;
}

// Hides the element, or shows it as the stylesheet lays it out, or as a block where the stylesheet hides it, as
// jQuery's show and hide did
export function setShown(element: Displayable, shown: boolean): void {
  if (!shown) {
    element.style.display = "none";
    return;
  }

  element.style.display = "";
  if (!isShown(element)) {
    element.style.display = "block";
  }
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
