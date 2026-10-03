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

import { Simulation } from "../headless/city";
import { startCity } from "../headless/runner";
import { Query, QueryAnswer, TileReportAnswer } from "../src/protocol";
import { QuerySource } from "../src/querySource";
import { QueryTool } from "../src/queryTool";

// A source that holds each query until the test answers it, as a server does
class HeldSource implements QuerySource {
    readonly asked: {query: Query, reply: (answer: QueryAnswer) => void}[] = [];

    ask(query: Query, reply: (answer: QueryAnswer) => void): void {
        this.asked.push({query, reply});
    }
}

function tool(source: QuerySource): {tool: QueryTool, shown: TileReportAnswer[]} {
    const shown: TileReportAnswer[] = [];
    return {tool: new QueryTool(source, (report) => shown.push(report)), shown};
}

describe("the query tool", () => {

    // Answering a query changes nothing, so the tests share one town
    let town: Simulation;
    beforeAll(() => {
        town = startCity({fixture: "town", speed: "fast"});
    });

    it("asks for the report of the tile clicked, and shows the answer when it comes", () => {
        const source = new HeldSource();
        const {tool: queryTool, shown} = tool(source);

        queryTool.query(27, 13);
        expect(source.asked.map(({query}) => query)).toEqual([{type: "tileReport", x: 27, y: 13}]);
        expect(shown).toEqual([]);

        const answer = town.answerQuery(source.asked[0].query);
        source.asked[0].reply(answer);
        expect(shown).toEqual([answer]);
        expect(shown[0]).toMatchObject({type: "tileReport", x: 27, y: 13, category: "RESIDENTIAL"});
    });

    // The game asks only about tiles on the map
    it("fails on a rejection, and shows nothing", () => {
        const {tool: queryTool, shown} = tool({ask: (query, reply) => reply(town.answerQuery(query))});

        expect(() => queryTool.query(-1, 13)).toThrow(/^The simulation rejected a tile report query: the tile is /);
        expect(shown).toEqual([]);
    });

    it("fails on an answer to another query", () => {
        const source = new HeldSource();
        const {tool: queryTool} = tool(source);
        queryTool.query(27, 13);

        expect(() => source.asked[0].reply({
            type: "overlay", layer: "crime", blockSize: 2, width: 1, height: 1, low: 0, high: 250, values: [0],
        })).toThrow("The simulation answered a tile report query with an answer of type overlay");
    });
});
