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

// The canonical text of a saved state, which the state hash is computed over. The C# port produces the same text
// byte for byte, so docs/state-hash.md specifies it; this is the reference implementation.
//
// It is JSON without whitespace, with each object's keys sorted by UTF-16 code unit, and numbers in ECMAScript's
// shortest round-trip form. A value the format doesn't define is an error rather than something silently dropped
// or coerced, as JSON.stringify would: undefined, a non-finite number, a function, or an object that isn't plain
// data.

function fail(path: string, message: string): never {
  throw new Error(`Cannot canonicalize ${path}: ${message}`);
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function write(value: unknown, path: string, out: string[]): void {
  if (value === null) {
    out.push("null");
    return;
  }

  switch (typeof value) {
    case "boolean":
      out.push(value ? "true" : "false");
      return;

    case "number":
      if (!Number.isFinite(value)) {
        fail(path, `${value} is not a finite number`);
      }

      // ECMAScript's Number::toString: the shortest digits that round-trip. Negative zero is written "0".
      out.push(String(value));
      return;

    case "string":
      // JSON.stringify's escaping, which docs/state-hash.md specifies
      out.push(JSON.stringify(value));
      return;

    case "object":
      break;

    default:
      fail(path, `a ${typeof value} has no canonical form`);
  }

  const object = value as object;

  if (Array.isArray(object)) {
    out.push("[");

    for (let i = 0; i < object.length; i++) {
      if (i > 0) {
        out.push(",");
      }

      if (!(i in object)) {
        fail(`${path}[${i}]`, "an array may not have holes");
      }

      write(object[i], `${path}[${i}]`, out);
    }

    out.push("]");
    return;
  }

  if (!isPlainObject(object)) {
    fail(path, "only plain objects and arrays have a canonical form");
  }

  // The default sort compares UTF-16 code units, which the format specifies
  const keys = Object.keys(object).sort();
  const record = object as Record<string, unknown>;

  out.push("{");

  keys.forEach((key, i) => {
    if (i > 0) {
      out.push(",");
    }

    out.push(JSON.stringify(key), ":");
    write(record[key], `${path}.${key}`, out);
  });

  out.push("}");
}

export function canonicalJson(value: unknown): string {
  const out: string[] = [];
  write(value, "the state", out);
  return out.join("");
}
