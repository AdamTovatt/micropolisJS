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
    /// A tool that fixes how the roads, rails and wires around what it changed connect, as the original's
    /// <c>connect.cpp</c> does: the building, bulldozer, road, rail and wire tools.
    /// </summary>
    internal abstract class ConnectingTool : CityTool
    {
        // The road, rail and wire tile for each set of neighbours it connects to: 1 above, 2 right, 4 below, 8 left
        private static readonly int[] RoadTable =
        [
            TileValues.ROADS, TileValues.ROADS2, TileValues.ROADS, TileValues.ROADS3,
            TileValues.ROADS2, TileValues.ROADS2, TileValues.ROADS4, TileValues.ROADS8,
            TileValues.ROADS, TileValues.ROADS6, TileValues.ROADS, TileValues.ROADS7,
            TileValues.ROADS5, TileValues.ROADS10, TileValues.ROADS9, TileValues.INTERSECTION,
        ];

        private static readonly int[] RailTable =
        [
            TileValues.LHRAIL, TileValues.LVRAIL, TileValues.LHRAIL, TileValues.LVRAIL2,
            TileValues.LVRAIL, TileValues.LVRAIL, TileValues.LVRAIL3, TileValues.LVRAIL7,
            TileValues.LHRAIL, TileValues.LVRAIL5, TileValues.LHRAIL, TileValues.LVRAIL6,
            TileValues.LVRAIL4, TileValues.LVRAIL9, TileValues.LVRAIL8, TileValues.LVRAIL10,
        ];

        private static readonly int[] WireTable =
        [
            TileValues.LHPOWER, TileValues.LVPOWER, TileValues.LHPOWER, TileValues.LVPOWER2,
            TileValues.LVPOWER, TileValues.LVPOWER, TileValues.LVPOWER3, TileValues.LVPOWER7,
            TileValues.LHPOWER, TileValues.LVPOWER5, TileValues.LHPOWER, TileValues.LVPOWER6,
            TileValues.LVPOWER4, TileValues.LVPOWER9, TileValues.LVPOWER8, TileValues.LVPOWER10,
        ];

        protected ConnectingTool(long toolCost, GameMap map)
            : base(toolCost, map)
        {
        }

        /// <summary>
        /// Fixes the connections of the tile and of its neighbours on the map, as <c>checkZoneConnections</c> and the
        /// original's <c>fixZone</c> do.
        /// </summary>
        protected void CheckZoneConnections(int x, int y)
        {
            FixSingle(x, y);

            if (y > 0)
            {
                FixSingle(x, y - 1);
            }

            if (x < Map.Width - 1)
            {
                FixSingle(x + 1, y);
            }

            if (y < Map.Height - 1)
            {
                FixSingle(x, y + 1);
            }

            if (x > 0)
            {
                FixSingle(x - 1, y);
            }
        }

        /// <summary>
        /// Fixes the connections around each tile bordering a building of <paramref name="size"/> by
        /// <paramref name="size"/> tiles whose top left tile is (x, y), as <c>checkBorder</c> does: the row above, the
        /// column to the left, the row below and the column to the right in turn.
        /// </summary>
        protected void CheckBorder(int x, int y, int size)
        {
            for (int i = 0; i < size; i++)
            {
                FixBorderTile(x + i, y - 1);
            }

            for (int i = 0; i < size; i++)
            {
                FixBorderTile(x - 1, y + i);
            }

            for (int i = 0; i < size; i++)
            {
                FixBorderTile(x + i, y + size);
            }

            for (int i = 0; i < size; i++)
            {
                FixBorderTile(x + size, y + i);
            }
        }

        // As connectTile's CONNECT_TILE_FIX: the tile's connections and its neighbours', unless it is off the map
        private void FixBorderTile(int x, int y)
        {
            if (Map.TestBounds(x, y))
            {
                CheckZoneConnections(x, y);
            }
        }

        // Sets a road, rail or wire tile to the piece that joins the neighbours it connects to, as fixSingle does
        private void FixSingle(int x, int y)
        {
            int tile = TileUtils.NormalizeRoad(WorldEffects.GetTileValue(x, y));

            if (tile >= TileValues.ROADS && tile <= TileValues.INTERSECTION)
            {
                WorldEffects.SetTile(x, y, RoadTable[Connections(x, y, RoadJoinsVertically, RoadJoinsHorizontally)], TileFlags.BLBNBIT);
            }
            else if (tile >= TileValues.LHRAIL && tile <= TileValues.LVRAIL10)
            {
                WorldEffects.SetTile(x, y, RailTable[Connections(x, y, RailJoinsVertically, RailJoinsHorizontally)], TileFlags.BLBNBIT);
            }
            else if (tile >= TileValues.LHPOWER && tile <= TileValues.LVPOWER10)
            {
                WorldEffects.SetTile(x, y, WireTable[Connections(x, y, WireJoinsVertically, WireJoinsHorizontally)], TileFlags.BLBNCNBIT);
            }
        }

        // The neighbours on the map a piece at (x, y) connects to, as the tables index them: 1 above, 2 right, 4 below
        // and 8 left, each joined as the test for its side says
        private int Connections(int x, int y, Func<Tile, bool> joinsVertically, Func<Tile, bool> joinsHorizontally)
        {
            int connections = 0;

            if (y > 0 && joinsVertically(WorldEffects.GetTile(x, y - 1)))
            {
                connections |= 1;
            }

            if (x < Map.Width - 1 && joinsHorizontally(WorldEffects.GetTile(x + 1, y)))
            {
                connections |= 2;
            }

            if (y < Map.Height - 1 && joinsVertically(WorldEffects.GetTile(x, y + 1)))
            {
                connections |= 4;
            }

            if (x > 0 && joinsHorizontally(WorldEffects.GetTile(x - 1, y)))
            {
                connections |= 8;
            }

            return connections;
        }

        /// <summary>
        /// The value of the tile at (x, y) with any road it carries taken out, as the original reads a neighbour.
        /// </summary>
        protected int NeighbourValue(int x, int y)
        {
            return TileUtils.NormalizeRoad(WorldEffects.GetTileValue(x, y));
        }

        // Whether a road joins the tile above or below it, read with any road it carries taken out
        private static bool RoadJoinsVertically(Tile neighbour)
        {
            int tile = TileUtils.NormalizeRoad(neighbour.GetValue());
            return (tile == TileValues.HRAILROAD || (tile >= TileValues.ROADBASE && tile <= TileValues.VROADPOWER)) &&
                   tile != TileValues.HROADPOWER && tile != TileValues.VRAILROAD && tile != TileValues.ROADBASE;
        }

        // Whether a road joins the tile beside it, read with any road it carries taken out
        private static bool RoadJoinsHorizontally(Tile neighbour)
        {
            int tile = TileUtils.NormalizeRoad(neighbour.GetValue());
            return (tile == TileValues.VRAILROAD || (tile >= TileValues.ROADBASE && tile <= TileValues.VROADPOWER)) &&
                   tile != TileValues.VROADPOWER && tile != TileValues.HRAILROAD && tile != TileValues.VBRIDGE;
        }

        private static bool RailJoinsVertically(Tile neighbour)
        {
            int tile = TileUtils.NormalizeRoad(neighbour.GetValue());
            return tile >= TileValues.RAILHPOWERV && tile <= TileValues.VRAILROAD &&
                   tile != TileValues.RAILHPOWERV && tile != TileValues.HRAILROAD && tile != TileValues.HRAIL;
        }

        private static bool RailJoinsHorizontally(Tile neighbour)
        {
            int tile = TileUtils.NormalizeRoad(neighbour.GetValue());
            return tile >= TileValues.RAILHPOWERV && tile <= TileValues.VRAILROAD &&
                   tile != TileValues.RAILVPOWERH && tile != TileValues.VRAILROAD && tile != TileValues.VRAIL;
        }

        // Whether a wire joins the tile above or below it: a conductor, but for the pieces fixSingle leaves out
        protected static bool WireJoinsVertically(Tile neighbour)
        {
            if (!neighbour.IsConductive())
            {
                return false;
            }

            int tile = TileUtils.NormalizeRoad(neighbour.GetValue());
            return tile != TileValues.VPOWER && tile != TileValues.VROADPOWER && tile != TileValues.RAILVPOWERH;
        }

        protected static bool WireJoinsHorizontally(Tile neighbour)
        {
            if (!neighbour.IsConductive())
            {
                return false;
            }

            int tile = TileUtils.NormalizeRoad(neighbour.GetValue());
            return tile != TileValues.HPOWER && tile != TileValues.HROADPOWER && tile != TileValues.RAILHPOWERV;
        }
    }
}
