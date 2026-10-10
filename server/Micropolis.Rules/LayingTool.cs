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
    internal abstract class LayingTool : ConnectingTool, IErasedTile
    {
        // The pieces of another line a tool crosses, as the tools lay them: a straight wire, rail or road
        private static readonly Piece[] CrossedPieces = [.. WireTool.Straight, .. RailTool.Straight, .. RoadTool.Straight];

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
        /// Whether a tile of this value, with any road it carries taken out, is a piece of the tool's line alone on land,
        /// of any shape the connections give it.
        /// </summary>
        protected abstract bool IsLine(int tileValue);

        /// <summary>
        /// Whether a tile of this value, with any road it carries taken out, is the tool's line crossing water.
        /// </summary>
        protected abstract bool IsLineOverWater(int tileValue);

        /// <summary>
        /// What a tile of this value is left as once the tool's line is taken out of it, or null where it carries none of
        /// the line: bare land for the line alone, water for the line crossing it, and for a crossing the piece the tool
        /// crossed when it laid the line (<see cref="PieceOn"/>), which the connections fixed after it join again.
        /// </summary>
        public Piece? PieceLeft(int tileValue)
        {
            int value = TileUtils.NormalizeRoad(tileValue);

            if (IsLine(value))
            {
                return new Piece(TileValues.DIRT, TileFlags.NOFLAGS);
            }

            if (IsLineOverWater(value))
            {
                return new Piece(TileValues.RIVER, TileFlags.NOFLAGS);
            }

            foreach (Piece crossed in CrossedPieces)
            {
                if (PieceOn(crossed.Value)?.Value == value)
                {
                    return crossed;
                }
            }

            return null;
        }

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
