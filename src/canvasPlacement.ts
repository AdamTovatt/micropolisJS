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

// Puts the canvas in its container, in place of an element of its id there, as when a canvas is made again. An element
// of its id anywhere else in the document is an error.
function placeCanvas(parentNode: Node, canvas: HTMLCanvasElement): void {
  const current = document.getElementById(canvas.id);

  if (current === null) {
    parentNode.appendChild(canvas);
  } else if (current.parentNode === parentNode) {
    parentNode.replaceChild(canvas, current);
  } else {
    throw new Error(`ID ${canvas.id} already exists in document!`);
  }
}

export { placeCanvas };
