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

// The checks the simulation reads untrusted JSON with: the commands and queries a player sends, and command logs

export type FieldRule = "required" | "optional";

// Whether each of a message's fields but its type must be there, as its type says
export type FieldRules<M> = {[K in Exclude<keyof M, "type">]: undefined extends M[K] ? "optional" : "required"};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export function oneOf(value: unknown, values: readonly string[]): boolean {
  return typeof value === "string" && values.indexOf(value) !== -1;
}

export function fieldsWith(rules: Record<string, FieldRule>, rule: FieldRule): string[] {
  return Object.keys(rules).filter((field) => rules[field] === rule).sort();
}

// Whether the keys, but the one left out, are every required field and otherwise only optional ones
export function hasFields(value: Record<string, unknown>, rules: Record<string, FieldRule>, leaveOut?: string): boolean {
  const keys = Object.keys(value).filter((key) => key !== leaveOut);
  return fieldsWith(rules, "required").every((field) => keys.includes(field)) &&
         keys.every((key) => Object.prototype.hasOwnProperty.call(rules, key));
}

// The reason a message with the wrong fields is rejected: its type's required fields, and the optional ones it may have
export function fieldsReason(what: string, rules: Record<string, FieldRule>): string {
  const optional = fieldsWith(rules, "optional");
  return `${what} has exactly the fields ${["type", ...fieldsWith(rules, "required")].join(", ")}` +
         (optional.length === 0 ? "" : `, and may have ${optional.join(", ")}`);
}
