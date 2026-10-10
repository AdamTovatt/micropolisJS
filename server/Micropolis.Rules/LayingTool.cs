/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 * Modified in Adam Tovatt's continuation of micropolisJS. Copyright (C) 2026 Adam Tovatt
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

namespace Micropolis.Rules
{
    /// <summary>
    /// A piece a tool lays: its tile and the flags it carries.
    /// </summary>
    internal readonly record struct Piece(int Value, int Flags);

    /// <summary>
    /// A tool that lays a road, rail or wire piece at a tile, as the original's <c>layRoad</c>, <c>layRail</c> and
    /// <c>layWire</c> share it: it clears the tile when auto-bulldoze is on, lays the piece the tile takes, or crosses
    /// water at the tool's cost for it, then fixes the connections around the tile.
    /// </summary>
    internal abstract class LayingTool : ConnectingTool
    {
        protected LayingTool(long toolCost, GameMap map)
            : base(toolCost, map)
        {
        }

        /// <summary>
        /// What crossing water costs, in place of the tool's cost.
        /// </summary>
        protected abstract long WaterCost { get; }

        protected sealed override void DoTool(int x, int y, RandomStream random, bool autoBulldoze)
        {
            Result = Lay(x, y, autoBulldoze);
        }

        /// <summary>
        /// The piece laid on a tile of this value, which the tool reads as its original does, or null where it lays
        /// nothing.
        /// </summary>
        protected abstract Piece? PieceOn(int tileValue);

        /// <summary>
        /// Lays the piece that crosses the water at (x, y), and answers whether something beside it let it.
        /// </summary>
        protected abstract bool LayOverWater(int x, int y);

        /// <summary>
        /// Whether the tile at (x, y) is on the map and its value, with any road taken out, passes the test.
        /// </summary>
        protected bool NeighbourIs(int x, int y, Func<int, bool> test)
        {
            return Map.TestBounds(x, y) && test(NeighbourValue(x, y));
        }

        private Outcome Lay(int x, int y, bool autoBulldoze)
        {
            if (autoBulldoze)
            {
                DoAutoBulldoze(x, y);
            }

            int tileValue = WorldEffects.GetTileValue(x, y);
            long cost = ToolCost;

            if (tileValue is TileValues.RIVER or TileValues.REDGE or TileValues.CHANNEL)
            {
                cost = WaterCost;

                if (!LayOverWater(x, y))
                {
                    return Outcome.Failed;
                }
            }
            else if (PieceOn(tileValue) is Piece piece)
            {
                WorldEffects.SetTile(x, y, piece.Value, piece.Flags);
            }
            else
            {
                return Outcome.Failed;
            }

            AddCost(cost);
            CheckZoneConnections(x, y);
            return Outcome.Ok;
        }
    }
}
