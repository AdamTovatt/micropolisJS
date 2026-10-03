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

namespace Micropolis.Rules
{
    /// <summary>
    /// A tool that fixes how the roads, rails and wires around what it changed connect, as <c>src/connector.js</c> and
    /// the original's <c>connect.cpp</c> do: the building, bulldozer, road, rail and wire tools.
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
            int adjTile = 0;
            int tile = TileUtils.NormalizeRoad(WorldEffects.GetTileValue(x, y));

            if (tile >= TileValues.ROADS && tile <= TileValues.INTERSECTION)
            {
                if (y > 0 && RoadJoinsVertically(NeighbourValue(x, y - 1)))
                {
                    adjTile |= 1;
                }

                if (x < Map.Width - 1 && RoadJoinsHorizontally(NeighbourValue(x + 1, y)))
                {
                    adjTile |= 2;
                }

                if (y < Map.Height - 1 && RoadJoinsVertically(NeighbourValue(x, y + 1)))
                {
                    adjTile |= 4;
                }

                if (x > 0 && RoadJoinsHorizontally(NeighbourValue(x - 1, y)))
                {
                    adjTile |= 8;
                }

                WorldEffects.SetTile(x, y, RoadTable[adjTile], TileFlags.BULLBIT | TileFlags.BURNBIT);
                return;
            }

            if (tile >= TileValues.LHRAIL && tile <= TileValues.LVRAIL10)
            {
                if (y > 0 && RailJoinsVertically(NeighbourValue(x, y - 1)))
                {
                    adjTile |= 1;
                }

                if (x < Map.Width - 1 && RailJoinsHorizontally(NeighbourValue(x + 1, y)))
                {
                    adjTile |= 2;
                }

                if (y < Map.Height - 1 && RailJoinsVertically(NeighbourValue(x, y + 1)))
                {
                    adjTile |= 4;
                }

                if (x > 0 && RailJoinsHorizontally(NeighbourValue(x - 1, y)))
                {
                    adjTile |= 8;
                }

                WorldEffects.SetTile(x, y, RailTable[adjTile], TileFlags.BULLBIT | TileFlags.BURNBIT);
                return;
            }

            if (tile >= TileValues.LHPOWER && tile <= TileValues.LVPOWER10)
            {
                if (y > 0 && WireJoinsVertically(WorldEffects.GetTile(x, y - 1)))
                {
                    adjTile |= 1;
                }

                if (x < Map.Width - 1 && WireJoinsHorizontally(WorldEffects.GetTile(x + 1, y)))
                {
                    adjTile |= 2;
                }

                if (y < Map.Height - 1 && WireJoinsVertically(WorldEffects.GetTile(x, y + 1)))
                {
                    adjTile |= 4;
                }

                if (x > 0 && WireJoinsHorizontally(WorldEffects.GetTile(x - 1, y)))
                {
                    adjTile |= 8;
                }

                WorldEffects.SetTile(x, y, WireTable[adjTile], TileFlags.BLBNCNBIT);
            }
        }

        private int NeighbourValue(int x, int y)
        {
            return TileUtils.NormalizeRoad(WorldEffects.GetTileValue(x, y));
        }

        // Whether a road joins the tile above or below it, given that tile's value with its road normalized
        private static bool RoadJoinsVertically(int tile)
        {
            return (tile == TileValues.HRAILROAD || (tile >= TileValues.ROADBASE && tile <= TileValues.VROADPOWER)) &&
                   tile != TileValues.HROADPOWER && tile != TileValues.VRAILROAD && tile != TileValues.ROADBASE;
        }

        // Whether a road joins the tile beside it, given that tile's value with its road normalized
        private static bool RoadJoinsHorizontally(int tile)
        {
            return (tile == TileValues.VRAILROAD || (tile >= TileValues.ROADBASE && tile <= TileValues.VROADPOWER)) &&
                   tile != TileValues.VROADPOWER && tile != TileValues.HRAILROAD && tile != TileValues.VBRIDGE;
        }

        private static bool RailJoinsVertically(int tile)
        {
            return tile >= TileValues.RAILHPOWERV && tile <= TileValues.VRAILROAD &&
                   tile != TileValues.RAILHPOWERV && tile != TileValues.HRAILROAD && tile != TileValues.HRAIL;
        }

        private static bool RailJoinsHorizontally(int tile)
        {
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
