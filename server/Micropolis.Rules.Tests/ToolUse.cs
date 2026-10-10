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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// A tool applied as a tool command applies it at one tile, and the lines of tiles tests lay along.
    /// </summary>
    internal static class ToolUse
    {
        /// <summary>
        /// Applies the tool at the tile and charges the budget, $20,000 unless one is given, and says how it came out.
        /// </summary>
        public static Outcome Apply(CityTool tool, int x, int y, bool autoBulldoze = false, Budget? budget = null)
        {
            tool.Apply(x, y, RandomStream.SimulationStream(0), autoBulldoze);
            tool.ModifyIfEnoughFunding(budget ?? new Budget { TotalFunds = 20000 });
            return tool.Result;
        }

        /// <summary>
        /// The tiles of a row from one column to another, west to east.
        /// </summary>
        public static List<Position> Row(int y, int fromX, int toX)
        {
            return Enumerable.Range(fromX, toX - fromX + 1).Select(x => new Position(x, y)).ToList();
        }

        /// <summary>
        /// The tiles of a column from one row to another, north to south.
        /// </summary>
        public static List<Position> Column(int x, int fromY, int toY)
        {
            return Enumerable.Range(fromY, toY - fromY + 1).Select(y => new Position(x, y)).ToList();
        }
    }
}
