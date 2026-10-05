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

namespace Micropolis.Rules
{
    /// <summary>
    /// The water a ship sails: open water, an open drawbridge's gap, and wire and rail laid over water, but not the
    /// shore. A closed bridge over that water is on a ship's way too, where it opens for the ship.
    /// </summary>
    internal static class Waterways
    {
        /// <summary>
        /// Whether a ship can be on a tile of this value now.
        /// </summary>
        public static bool IsSailable(int tileValue)
        {
            return TileUtils.IsOpenWater(tileValue) || IsBuiltOverWater(tileValue);
        }

        /// <summary>
        /// Whether the tile is a wire or rail laid over water, or an open drawbridge's middle tile: what is built on
        /// water and leaves it open beneath, which a monster or a tornado turns back into the river.
        /// </summary>
        public static bool IsBuiltOverWater(int tileValue)
        {
            return tileValue is TileValues.HPOWER or TileValues.VPOWER or TileValues.HRAIL or TileValues.VRAIL or
                TileValues.BRWH or TileValues.BRWV;
        }

        /// <summary>
        /// Whether a ship's route may cross the tile at (x, y): water it can be on, or a closed bridge that opens for
        /// it as it sails through.
        /// </summary>
        public static bool IsNavigable(GameMap map, int x, int y)
        {
            return map.TestBounds(x, y) && (IsSailable(map.GetTileValue(x, y)) || Road.OpensForShip(map, x, y));
        }

        /// <summary>
        /// Whether (x, y) is a tile of the map's edge that a ship can be on: where a ship enters, and leaves from.
        /// </summary>
        public static bool IsSailableEdge(GameMap map, int x, int y)
        {
            return map.TestBounds(x, y) && (x == 0 || y == 0 || x == map.Width - 1 || y == map.Height - 1) &&
                   IsSailable(map.GetTileValue(x, y));
        }

        /// <summary>
        /// The tiles of the map's edge that a ship can be on, clockwise from the north-west corner.
        /// </summary>
        public static IEnumerable<Position> SailableEdgeTiles(GameMap map)
        {
            for (int x = 0; x < map.Width; x++)
            {
                if (IsSailableEdge(map, x, 0))
                {
                    yield return new Position(x, 0);
                }
            }

            for (int y = 1; y < map.Height; y++)
            {
                if (IsSailableEdge(map, map.Width - 1, y))
                {
                    yield return new Position(map.Width - 1, y);
                }
            }

            for (int x = map.Width - 2; x >= 0; x--)
            {
                if (IsSailableEdge(map, x, map.Height - 1))
                {
                    yield return new Position(x, map.Height - 1);
                }
            }

            for (int y = map.Height - 2; y >= 1; y--)
            {
                if (IsSailableEdge(map, 0, y))
                {
                    yield return new Position(0, y);
                }
            }
        }
    }
}
