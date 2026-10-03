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

// The comparison the oracle tests share: each runs a transcription of the original and the port on many cases, and
// lists where they part.

// How many differences a comparison lists before it stops looking
const MAX_DIFFERENCES = 5;

// The first few differences among the cases, each labelled with its case's number. differenceOf describes how the two
// sides differ on a case, or gives null where they agree.
export function differences<T>(cases: T[], differenceOf: (testCase: T) => string | null): string[] {
    const found: string[] = [];
    for (let caseNumber = 0; caseNumber < cases.length; caseNumber++) {
        const difference = differenceOf(cases[caseNumber]);
        if (difference !== null) {
            found.push(`case ${caseNumber}, ${difference}`);
            if (found.length === MAX_DIFFERENCES) {
                break;
            }
        }
    }
    return found;
}

// How the port's outcome differs from the original's for the input, or null where they are the same
export function outcomeDifference(expected: unknown, actual: unknown, input: unknown): string | null {
    const expectedText = JSON.stringify(expected);
    const actualText = JSON.stringify(actual);
    return expectedText === actualText ? null : `expected ${expectedText}, got ${actualText} for ${JSON.stringify(input)}`;
}
