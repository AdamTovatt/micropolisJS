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
    /// The traffic a zone generates, as <c>src/traffic.js</c> drives it from the zone to a destination along the roads.
    /// </summary>
    public sealed class Traffic
    {
        // The perimeter of a 3×3 zone, relative to its centre, clockwise from the north-west corner's north
        private static readonly int[] PerimX = [-1, 0, 1, 2, 2, 2, 1, 0, -1, -2, -2, -2];
        private static readonly int[] PerimY = [-2, -2, -2, -1, 0, 1, 2, 2, 2, 1, 0, -1];

        private readonly GameMap _map;

        public Traffic(GameMap map)
        {
            _map = map;
        }

        /// <summary>
        /// A road or rail on the perimeter of the zone centred at <paramref name="position"/>, the first clockwise, or
        /// <see langword="null"/> if there is none.
        /// </summary>
        public Position? FindPerimeterRoad(Position position)
        {
            for (int i = 0; i < 12; i++)
            {
                int xx = position.X + PerimX[i];
                int yy = position.Y + PerimY[i];

                if (_map.TestBounds(xx, yy))
                {
                    if (TileUtils.IsDriveable(_map.GetTileValue(xx, yy)))
                    {
                        return new Position(xx, yy);
                    }
                }
            }

            return null;
        }
    }
}
