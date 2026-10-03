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

import { Query, QueryAnswer } from "./protocol";

// Where the client's queries are answered: the simulation in the page, or a server
export interface QuerySource {
  // Sends a query, and hands its answer to reply when it comes, which may be at once
  ask(query: Query, reply: (answer: QueryAnswer) => void): void;
}

// The part of the simulation in the page that answers queries
export interface AnsweringSimulation {
  answerQuery(query: unknown): QueryAnswer;
}

// The simulation in the page as a query source: it answers a query at once
export function pageQuerySource(simulation: AnsweringSimulation): QuerySource {
  return {ask: (query, reply) => reply(simulation.answerQuery(query))};
}
