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
        /// The side of the largest zone, the airport's.
        /// </summary>
        public const int LargestZoneSize = 6;

        /// <summary>
        /// The zone score a zone is given when its centre has no power, at which no zone grows.
        /// </summary>
        public const long UnpoweredZoneScore = -500;

        /// <summary>
        /// The location score of a home or commercial zone whose trip found no road.
        /// </summary>
        public const int NoRoadLocationScore = -3000;

        // A zone's centre is its footprint's second tile across and down, so the centre of a zone holding a tile lies
        // one down and right of it at most, and up and left at most the largest zone's side less two
        private const int CentreReach = LargestZoneSize - 2;

        // The zone score a zone must pass to grow, and that it must fall below to decline, as doResidential,
        // doCommercial and doIndustrial in the original compare it
        private const long GrowthFloor = -350;
        private const long DeclineCeiling = 350;

        // What the draw against a zone score is offset by, so that even the best score grows a zone only now and then
        private const long DrawOffset = 26380;

        /// <summary>
        /// The centre of the zone whose footprint holds the tile at (x, y), or <see langword="null"/> where none does.
        /// Zones rarely overlap, but where they do, a tile is the zone's whose centre comes first in the 3×3 round the
        /// tile, row by row, where a 3×3 zone's centre lies; or failing that, first in the window reaching up and left as
        /// far as any centre can, row by row.
        /// </summary>
        public static Position? ZoneCentre(GameMap map, int x, int y)
        {
            for (int down = -1; down <= 1; down++)
            {
                for (int across = -1; across <= 1; across++)
                {
                    if (HoldsTile(map, x, y, across, down))
                    {
                        return new Position(x + across, y + down);
                    }
                }
            }

            for (int down = -CentreReach; down <= 1; down++)
            {
                for (int across = -CentreReach; across <= 1; across++)
                {
                    if (across >= -1 && down >= -1)
                    {
                        continue;
                    }

                    if (HoldsTile(map, x, y, across, down))
                    {
                        return new Position(x + across, y + down);
                    }
                }
            }

            return null;
        }

        // Whether the tile lying (across, down) from (x, y) is the centre of a zone whose footprint holds (x, y)
        private static bool HoldsTile(GameMap map, int x, int y, int across, int down)
        {
            if (!map.TestBounds(x + across, y + down))
            {
                return false;
            }

            int raw = map.RawValueAt(x + across + (y + down) * map.Width);

            if ((raw & TileFlags.ZONEBIT) == 0)
            {
                return false;
            }

            // The footprint runs from a tile up and left of the centre to its side less two down and right of it
            int farthest = Math.Min(SizeAtCentre(raw & TileFlags.BIT_MASK) - 2, CentreReach);
            return across >= -farthest && down >= -farthest;
        }

        /// <summary>
        /// Whether a zone with this zone score can grow when it is assessed: at or below the floor no draw grows it.
        /// </summary>
        public static bool CanGrow(long zoneScore)
        {
            return zoneScore > GrowthFloor;
        }

        /// <summary>
        /// Whether a zone with this zone score can decline when it is assessed: at or above the ceiling no draw declines
        /// it.
        /// </summary>
        public static bool CanDecline(long zoneScore)
        {
            return zoneScore < DeclineCeiling;
        }

        /// <summary>
        /// The zone score a handler assesses a zone by, whose trip came to <paramref name="traffic"/>: the demand for its
        /// kind and its location score, less what a slow trip costs it, a change from the original, which had no slow
        /// trips; or <see cref="UnpoweredZoneScore"/> without power.
        /// </summary>
        public static long ZoneScore(long demand, int locationScore, TrafficResult traffic, bool zonePower)
        {
            // Unpowered zones should of course be penalized
            if (!zonePower)
            {
                return UnpoweredZoneScore;
            }

            return demand + locationScore - Traffic.GrowthPenalty(traffic);
        }

        /// <summary>
        /// Where a zone stands by what its handler can do with it: likely to grow where it can only grow, likely to decline
        /// where it can only decline, either where it can do both, and holding steady where it can do neither.
        /// </summary>
        public static GrowthOutlook Outlook(bool canGrow, bool canDecline)
        {
            if (canGrow)
            {
                return canDecline ? GrowthOutlook.MayGrowOrDecline : GrowthOutlook.LikelyToGrow;
            }

            return canDecline ? GrowthOutlook.LikelyToDecline : GrowthOutlook.HoldsSteady;
        }

        /// <summary>
        /// Whether an assessed zone grows: a zone that can grow draws, and grows when the draw falls under its score, so
        /// the higher its score the likelier. A zone that can't grow draws nothing.
        /// </summary>
        internal static bool DrawsGrowth(long zoneScore, RandomStream random)
        {
            return CanGrow(zoneScore) && (zoneScore - DrawOffset) > random.GetRandom16Signed();
        }

        /// <summary>
        /// Whether an assessed zone that didn't grow declines: a zone that can decline draws, and declines when the draw
        /// passes its score, so the lower its score the likelier. A zone that can't decline draws nothing.
        /// </summary>
        internal static bool DrawsDecline(long zoneScore, RandomStream random)
        {
            return CanDecline(zoneScore) && (zoneScore + DrawOffset) < random.GetRandom16Signed();
        }

        /// <summary>
        /// The side of the zone whose centre has this value: the airport's 6, which <see cref="CheckZoneSize"/> leaves
        /// out, and every other zone's as it gives it.
        /// </summary>
        public static int SizeAtCentre(int centreValue)
        {
            return centreValue == TileValues.AIRPORT ? LargestZoneSize : CheckZoneSize(centreValue);
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
