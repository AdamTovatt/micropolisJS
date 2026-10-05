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
    /// A zone of more than 3×3 tiles, as <c>checkBigZone</c> finds it from one of its tiles: its size, and the step from
    /// that tile to the zone's centre.
    /// </summary>
    public readonly record struct BigZone(int ZoneSize, int DeltaX, int DeltaY);

    /// <summary>
    /// What the zone handlers share, after the helpers of the original's zone.cpp.
    /// </summary>
    public static class ZoneUtils
    {
        /// <summary>
        /// The 4×4 or 6×6 zone a tile with this value belongs to, or a size of 0 for a tile of none: the bulldozer finds
        /// a big zone's centre from any of the tiles this knows.
        /// </summary>
        public static BigZone CheckBigZone(int tileValue)
        {
            switch (tileValue)
            {
                case TileValues.POWERPLANT:
                case TileValues.PORT:
                case TileValues.NUCLEAR:
                case TileValues.STADIUM:
                    return new BigZone(4, 0, 0);

                case TileValues.POWERPLANT + 1:
                case TileValues.COALSMOKE3:
                case TileValues.COALSMOKE3 + 1:
                case TileValues.COALSMOKE3 + 2:
                case TileValues.PORT + 1:
                case TileValues.NUCLEAR + 1:
                case TileValues.STADIUM + 1:
                    return new BigZone(4, -1, 0);

                case TileValues.POWERPLANT + 4:
                case TileValues.PORT + 4:
                case TileValues.NUCLEAR + 4:
                case TileValues.STADIUM + 4:
                    return new BigZone(4, 0, -1);

                case TileValues.POWERPLANT + 5:
                case TileValues.PORT + 5:
                case TileValues.NUCLEAR + 5:
                case TileValues.STADIUM + 5:
                    return new BigZone(4, -1, -1);

                case TileValues.AIRPORT:
                    return new BigZone(6, 0, 0);

                case TileValues.AIRPORT + 1:
                    return new BigZone(6, -1, 0);

                case TileValues.AIRPORT + 2:
                    return new BigZone(6, -2, 0);

                case TileValues.AIRPORT + 3:
                    return new BigZone(6, -3, 0);

                case TileValues.AIRPORT + 6:
                    return new BigZone(6, 0, -1);

                case TileValues.AIRPORT + 7:
                    return new BigZone(6, -1, -1);

                case TileValues.AIRPORT + 8:
                    return new BigZone(6, -2, -1);

                case TileValues.AIRPORT + 9:
                    return new BigZone(6, -3, -1);

                case TileValues.AIRPORT + 12:
                    return new BigZone(6, 0, -2);

                case TileValues.AIRPORT + 13:
                    return new BigZone(6, -1, -2);

                case TileValues.AIRPORT + 14:
                    return new BigZone(6, -2, -2);

                case TileValues.AIRPORT + 15:
                    return new BigZone(6, -3, -2);

                case TileValues.AIRPORT + 18:
                    return new BigZone(6, 0, -3);

                case TileValues.AIRPORT + 19:
                    return new BigZone(6, -1, -3);

                case TileValues.AIRPORT + 20:
                    return new BigZone(6, -2, -3);

                case TileValues.AIRPORT + 21:
                    return new BigZone(6, -3, -3);

                default:
                    return new BigZone(0, 0, 0);
            }
        }

        /// <summary>
        /// The size of the zone a tile with this value belongs to: 3, 4, or 0 for a tile of none.
        /// </summary>
        public static int CheckZoneSize(int tileValue)
        {
            if ((tileValue >= TileValues.RESBASE - 1 && tileValue <= TileValues.PORTBASE - 1) ||
                (tileValue >= TileValues.LASTPOWERPLANT + 1 && tileValue <= TileValues.POLICESTATION + 4) ||
                (tileValue >= TileValues.CHURCH1BASE && tileValue <= TileValues.CHURCH7LAST))
            {
                return 3;
            }

            if ((tileValue >= TileValues.PORTBASE && tileValue <= TileValues.LASTPORT) ||
                (tileValue >= TileValues.COALBASE && tileValue <= TileValues.LASTPOWERPLANT) ||
                (tileValue >= TileValues.STADIUMBASE && tileValue <= TileValues.LASTZONE))
            {
                return 4;
            }

            return 0;
        }

        /// <summary>
        /// A zone on fire: its rate of growth falls, and the tiles from the roads up that the sweep reaches become
        /// bulldozable. The sweep covers a 3×3 zone's own tiles and the airport's, but every other zone from the seaport
        /// up one row and one column past its lower right edge.
        /// </summary>
        public static void FireZone(GameMap map, int x, int y, BlockMaps blockMaps)
        {
            int tileValue = map.GetTileValue(x, y);
            int zoneSize = 2;

            // A zone being on fire naturally hurts growth
            int value = blockMaps.RateOfGrowthMap.WorldGet(x, y);
            value = Math.Clamp(value - 20, -200, 200);
            blockMaps.RateOfGrowthMap.WorldSet(x, y, value);

            // As in the original, every zone from the seaport up but the airport is swept as far as a 5x5 zone would be
            if (tileValue == TileValues.AIRPORT)
            {
                zoneSize = 5;
            }
            else if (tileValue >= TileValues.PORTBASE)
            {
                zoneSize = 4;
            }

            // Make remaining tiles of the zone bulldozable
            for (int xDelta = -1; xDelta < zoneSize; xDelta++)
            {
                for (int yDelta = -1; yDelta < zoneSize; yDelta++)
                {
                    int xTem = x + xDelta;
                    int yTem = y + yDelta;

                    if (!map.TestBounds(xTem, yTem))
                    {
                        continue;
                    }

                    if (map.GetTileValue(xTem, yTem) >= TileValues.ROADBASE)
                    {
                        map.AddTileFlags(xTem, yTem, TileFlags.BULLBIT);
                    }
                }
            }
        }

        /// <summary>
        /// The tile's land value less its pollution, as a category from 0 to 3.
        /// </summary>
        public static int GetLandPollutionValue(BlockMaps blockMaps, int x, int y)
        {
            int landValue = blockMaps.LandValueMap.WorldGet(x, y);
            landValue -= blockMaps.PollutionDensityMap.WorldGet(x, y);

            if (landValue < 30)
            {
                return 0;
            }

            if (landValue < 80)
            {
                return 1;
            }

            if (landValue < 150)
            {
                return 2;
            }

            return 3;
        }

        /// <summary>
        /// Adds four times the delta to the rate of growth of the tile's block, kept from -200 to 200.
        /// </summary>
        public static void IncRateOfGrowth(BlockMaps blockMaps, int x, int y, int growthDelta)
        {
            int currentRate = blockMaps.RateOfGrowthMap.WorldGet(x, y);
            int newValue = Math.Clamp(currentRate + growthDelta * 4, -200, 200);
            blockMaps.RateOfGrowthMap.WorldSet(x, y, newValue);
        }

        /// <summary>
        /// Lays the 3×3 zone whose centre tile is given around (x, y), unless a tile of it is flooded, radioactive or on
        /// fire: its centre bulldozable, and powered when <paramref name="isPowered"/>.
        /// </summary>
        public static void PutZone(GameMap map, int x, int y, int centreTile, bool isPowered)
        {
            for (int dY = -1; dY < 2; dY++)
            {
                for (int dX = -1; dX < 2; dX++)
                {
                    int tileValue = map.GetTileValue(x + dX, y + dY);
                    if (tileValue >= TileValues.FLOOD && tileValue < TileValues.ROADBASE)
                    {
                        return;
                    }
                }
            }

            map.PutZone(x, y, centreTile, 3);
            map.AddTileFlags(x, y, TileFlags.BULLBIT);

            if (isPowered)
            {
                map.AddTileFlags(x, y, TileFlags.POWERBIT);
            }
        }
    }
}
