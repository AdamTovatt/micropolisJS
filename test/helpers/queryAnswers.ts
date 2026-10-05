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

import type { Query, QueryAnswer } from "../../src/protocol";
import type { QuerySource } from "../../src/querySource";

// The source's answer to the query, as a promise
export function answerTo(source: QuerySource, query: Query): Promise<QueryAnswer> {
    return new Promise((resolve) => source.ask(query, resolve));
}

// The source's answer to the query, which must be of the type given
export async function answerOfType<T extends QueryAnswer["type"]>(source: QuerySource, query: Query, type: T):
    Promise<Extract<QueryAnswer, {type: T}>> {
    const answer = await answerTo(source, query);
    if (answer.type !== type) {
        throw new Error(`The ${query.type} query was answered with ${JSON.stringify(answer)}`);
    }

    return answer as Extract<QueryAnswer, {type: T}>;
}
