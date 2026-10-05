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

// The command line's arguments: the command and its words, and the options, each given as --name value or
// --name=value, or as --name alone for a switch

// The options that take a value
const VALUE_OPTIONS = new Set(["city", "server", "tax", "road", "fire", "police"]);
// The options that are switches
const SWITCHES = new Set(["no-auto-bulldoze", "legend", "help"]);

// A mistake in the arguments, which the command line answers with its usage
export class UsageError extends Error {}

export interface Arguments {
  // The words that aren't options, the command first
  words: string[];
  options: Map<string, string>;
  switches: Set<string>;
}

export function parseArguments(argv: readonly string[]): Arguments {
  const parsed: Arguments = {words: [], options: new Map(), switches: new Set()};

  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];

    if (!argument.startsWith("--")) {
      parsed.words.push(argument);
      continue;
    }

    const equals = argument.indexOf("=");
    const name = argument.slice(2, equals === -1 ? undefined : equals);

    if (SWITCHES.has(name) && equals === -1) {
      parsed.switches.add(name);
    } else if (VALUE_OPTIONS.has(name)) {
      const value = equals === -1 ? argv[++i] : argument.slice(equals + 1);
      if (value === undefined) {
        throw new UsageError(`--${name} needs a value`);
      }
      parsed.options.set(name, value);
    } else {
      throw new UsageError(`There is no option ${argument}`);
    }
  }

  return parsed;
}

// The option's value as a whole number from low to high, or undefined when it isn't given
export function wholeNumberOption(args: Arguments, name: string, low: number, high: number): number | undefined {
  const text = args.options.get(name);
  if (text === undefined) {
    return undefined;
  }

  const value = Number(text);
  if (!/^\d+$/.test(text) || value < low || value > high) {
    throw new UsageError(`--${name} must be a whole number from ${low} to ${high}, not "${text}"`);
  }

  return value;
}
