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
