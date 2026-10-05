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

// Files the page gives the player to keep: a city's save, which Load on the splash screen starts again as a new city,
// and the debug window's command log

// The characters a file name can't hold on one file system or another: path separators, the ones Windows reserves, and
// control characters
// eslint-disable-next-line no-control-regex
const UNSAFE_IN_FILE_NAMES = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

// The name of a city's save file: the city's name, with each character a file name can't hold made an underscore, and
// without spaces at either end or the leading dots that would hide the file. A name with nothing left is "city".
export function saveFileName(cityName: string): string {
  const name = cityName.replace(UNSAFE_IN_FILE_NAMES, "_").replace(/^[\s.]+/, "").trimEnd();
  return `${name === "" ? "city" : name}.json`;
}

// Has the browser save the JSON text as a file under the name
export function downloadJson(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], {type: "application/json"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked once the download has had time to start: revoking at once can cancel it
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
