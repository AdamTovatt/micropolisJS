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
    /// The ground hand-built maps lay their routes over: open land a trip may walk across, or rubble it may not, and
    /// paths on ninths of a tile.
    /// </summary>
    internal static class Ground
    {
        /// <summary>
        /// The ninths along the middle of a tile from west to east.
        /// </summary>
        public static readonly int[] AcrossTheMiddle = [3, 4, 5];

        /// <summary>
        /// The ninths along the middle of a tile from north to south.
        /// </summary>
        public static readonly int[] DownTheMiddle = [1, 4, 7];

        /// <summary>
        /// Rubble on every tile of bare land, which no one walks across, so a trip goes only by the roads, rail, paths and
        /// open land a test lays over it.
        /// </summary>
        public static void NoOpenLand(GameMap map)
        {
            for (int y = 0; y < map.Height; y++)
            {
                for (int x = 0; x < map.Width; x++)
                {
                    if (map.GetTileValue(x, y) == TileValues.DIRT)
                    {
                        map.SetTile(x, y, TileValues.RUBBLE, TileFlags.BULLBIT);
                    }
                }
            }
        }

        /// <summary>
        /// Bare land on each tile, which a trip may walk across.
        /// </summary>
        public static void OpenLand(GameMap map, IEnumerable<Position> tiles)
        {
            foreach (Position tile in tiles)
            {
                map.SetTile(tile.X, tile.Y, TileValues.DIRT, 0);
            }
        }

        /// <summary>
        /// A path on the ninths given of each tile, numbered row by row from its north-west corner, over what each holds.
        /// </summary>
        public static void Path(GameMap map, IEnumerable<Position> tiles, params int[] ninths)
        {
            foreach (Position tile in tiles)
            {
                map.SetWalkway(tile.X, tile.Y, Walkway(ninths));
            }
        }

        /// <summary>
        /// The walkway value of a path on the ninths given.
        /// </summary>
        public static int Walkway(params int[] ninths)
        {
            return ninths.Aggregate(0, (walkway, ninth) => Walkways.With(walkway, ninth, (int)WalkwayKind.Path));
        }
    }
}
