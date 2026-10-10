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

using Micropolis.Rules;

namespace Micropolis.Conformance
{
    /// <summary>
    /// Tool commands as the fixtures write them, with auto-bulldoze on as the player has it by default.
    /// </summary>
    internal static class FixtureCommands
    {
        /// <summary>
        /// A building, placed by its centre tile as the player's click places it: one in from the top left.
        /// </summary>
        public static Command BuildingAt(ToolName tool, int x, int y)
        {
            return new ToolCommand(tool, [new TilePosition(x, y)], true);
        }

        /// <summary>
        /// A row of zones side by side, one for each letter of <paramref name="kinds"/>, R residential, C commercial
        /// and I industrial, the first with its top left tile at (left, top).
        /// </summary>
        public static IEnumerable<Command> ZoneRow(string kinds, int left, int top)
        {
            return kinds.Select((kind, i) => BuildingAt(kind switch
            {
                'R' => ToolName.Residential,
                'C' => ToolName.Commercial,
                'I' => ToolName.Industrial,
                _ => throw new ArgumentException($"A row's zones are R, C or I, got {kind} in {kinds}"),
            }, left + 3 * i + 1, top + 1));
        }

        /// <summary>
        /// A straight horizontal or vertical line, both ends included, dragged as one command, as the player's drag
        /// along the line sends it.
        /// </summary>
        public static Command LineOf(ToolName tool, int x1, int y1, int x2, int y2)
        {
            if (x1 != x2 && y1 != y2)
            {
                throw new ArgumentException($"A {ProtocolJson.Name(tool)} line must be horizontal or vertical, got ({x1}, {y1}) to ({x2}, {y2})");
            }

            TilePosition from = new TilePosition(x1, y1);
            return new ToolCommand(tool, [from, .. DragPath(from, new TilePosition(x2, y2))], true);
        }

        /// <summary>
        /// A straight horizontal or vertical line of path on the grid of ninths (<see cref="NinthPosition"/>), both ends
        /// included, dragged as one command.
        /// </summary>
        public static Command PathOf(int x1, int y1, int x2, int y2)
        {
            if (x1 != x2 && y1 != y2)
            {
                throw new ArgumentException($"A path must be horizontal or vertical, got ({x1}, {y1}) to ({x2}, {y2})");
            }

            int stepX = Math.Sign(x2 - x1);
            int stepY = Math.Sign(y2 - y1);
            int steps = Math.Abs(x2 - x1) + Math.Abs(y2 - y1);
            return new WalkwayCommand(WalkwayKind.Path,
                Enumerable.Range(0, steps + 1).Select(step => new NinthPosition(x1 + step * stepX, y1 + step * stepY)).ToList());
        }

        /// <summary>
        /// The tiles a drag passes over from one tile to the next, as <c>dragPath</c> in <c>src/dragPath.ts</c> finds
        /// them: the tiles after <paramref name="from"/>, up to and including <paramref name="to"/>, each one step
        /// along a row or a column from the one before. They follow the line between the two tiles' centres; where it
        /// crosses a column and a row boundary at once, at a corner, the column comes first.
        /// </summary>
        public static IReadOnlyList<TilePosition> DragPath(TilePosition from, TilePosition to)
        {
            int dx = Math.Abs(to.X - from.X);
            int dy = Math.Abs(to.Y - from.Y);
            int stepX = Math.Sign(to.X - from.X);
            int stepY = Math.Sign(to.Y - from.Y);
            List<TilePosition> path = new List<TilePosition>();
            int x = from.X;
            int y = from.Y;

            // After crossing i column boundaries, the line crosses the next (i + 0.5) / dx of the way along, and
            // likewise for rows: crossing a column next is (2i + 1) / 2dx <= (2j + 1) / 2dy, kept in whole numbers
            for (int i = 0, j = 0; i < dx || j < dy;)
            {
                if (j == dy || (i < dx && (2 * i + 1) * dy <= (2 * j + 1) * dx))
                {
                    x += stepX;
                    i++;
                }
                else
                {
                    y += stepY;
                    j++;
                }

                path.Add(new TilePosition(x, y));
            }

            return path;
        }
    }
}
