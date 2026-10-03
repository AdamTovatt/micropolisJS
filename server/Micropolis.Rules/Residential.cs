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
    /// Residential zones and hospitals, as <c>src/residential.js</c> grows and declines them.
    /// </summary>
    public static class Residential
    {
        // The pollution above which a residential zone grows no further
        private const int MaxPollution = 128;

        // The lots of an empty zone, in the order degradeZone scans them, column by column, as the tile each becomes when
        // its house is removed, counted from RESBASE: the free zone's tiles run row by row
        private static readonly int[] FreeZone = [0, 3, 6, 1, 4, 7, 2, 5, 8];

        // The centre and the 8 lots around it, as buildHouse scans them: the centre is at index 0, and never a lot
        private static readonly int[] HouseXDelta = [0, -1, 0, 1, -1, 1, -1, 0, 1];
        private static readonly int[] HouseYDelta = [0, -1, -1, -1, 0, 0, 1, 1, 1];

        // A lot's neighbours, as evalLot scans them: north, east, south, west
        private static readonly int[] LotXDelta = [0, 1, 0, -1];
        private static readonly int[] LotYDelta = [-1, 0, 1, 0];

        // Residential tiles have 'populations' of 16, 24, 32 or 40, and value from 0 to 3. The tiles are laid out in
        // increasing order of land value, cycling through each population value
        private static void PlaceResidential(GameMap map, int x, int y, int population, int lpValue, bool zonePower)
        {
            int centreTile = ((lpValue * 4) + population) * 9 + TileValues.RZB;
            ZoneUtils.PutZone(map, x, y, centreTile, zonePower);
        }

        /// <summary>
        /// The houses in the 8 tiles around an empty residential zone's centre.
        /// </summary>
        private static int GetFreeZonePopulation(GameMap map, int x, int y)
        {
            int count = 0;
            for (int xx = x - 1; xx <= x + 1; xx++)
            {
                for (int yy = y - 1; yy <= y + 1; yy++)
                {
                    if (xx == x && yy == y)
                    {
                        continue;
                    }

                    int tileValue = map.GetTileValue(xx, yy);
                    if (tileValue >= TileValues.LHTHR && tileValue <= TileValues.HHTHR)
                    {
                        count += 1;
                    }
                }
            }

            return count;
        }

        /// <summary>
        /// The population of the residential zone centred at (x, y), whose centre has the tile value: its houses when
        /// it is empty, and when it is built up, as getResZonePop in the original, 16, 24, 32 or 40 by its density.
        /// </summary>
        public static int GetZonePopulation(GameMap map, int x, int y, int tileValue)
        {
            if (tileValue == TileValues.FREEZ)
            {
                return GetFreeZonePopulation(map, x, y);
            }

            int density = JsMath.FloorDiv(tileValue - TileValues.RZB, 9) % 4;
            return density * 8 + 16;
        }

        // Assess a lot, in bounds, for suitability for a house, as evalLot in the original: -1 unless it is an empty lot
        // of the zone or dirt, whatever its flags, and otherwise one more for each neighbour that is road or lower, not
        // counting dirt without flags. Prefers lots near roads.
        private static int EvalLot(GameMap map, int x, int y)
        {
            int tileValue = map.GetTileValue(x, y);
            if (tileValue != TileValues.DIRT && (tileValue < TileValues.RESBASE || tileValue > TileValues.RESBASE + 8))
            {
                return -1;
            }

            int score = 1;
            for (int i = 0; i < 4; i++)
            {
                int edgeX = x + LotXDelta[i];
                int edgeY = y + LotYDelta[i];

                if (!map.TestBounds(edgeX, edgeY))
                {
                    continue;
                }

                // The original compares the whole map word, flags included, with DIRT, so only dirt without flags is bare
                Tile edge = map.GetTile(edgeX, edgeY);
                if (edge.GetRawValue() != TileValues.DIRT && edge.GetValue() <= TileValues.LASTROAD)
                {
                    score += 1;
                }
            }

            return score;
        }

        // As buildHouse in the original: picks one of the 8 lots around the centre, the best scoring, and among those
        // that tie, more likely a later one
        private static void BuildHouse(GameMap map, int x, int y, int lpValue, RandomStream random)
        {
            int best = 0;
            int bestScore = 0;

            for (int i = 1; i < 9; i++)
            {
                int xx = x + HouseXDelta[i];
                int yy = y + HouseYDelta[i];

                if (!map.TestBounds(xx, yy))
                {
                    continue;
                }

                int score = EvalLot(map, xx, yy);
                if (score > bestScore)
                {
                    bestScore = score;
                    best = i;
                }

                // Not an else: a lot that has just become the best ties with itself, and draws as any tie does. Ensures
                // we don't always select the same position when we have a choice.
                if (score == bestScore && random.GetChance(7))
                {
                    best = i;
                }
            }

            if (best > 0 && map.TestBounds(x + HouseXDelta[best], y + HouseYDelta[best]))
            {
                map.SetTile(x + HouseXDelta[best], y + HouseYDelta[best],
                            TileValues.HOUSE + random.GetRandom(2) + lpValue * 3, TileFlags.BLBNCNBIT);
            }
        }

        private static void GrowZone(GameMap map, int x, int y, BlockMaps blockMaps, int population, int lpValue,
                                     bool zonePower, RandomStream random)
        {
            int pollution = blockMaps.PollutionDensityMap.WorldGet(x, y);

            // Cough! Too polluted! No-one wants to move here!
            if (pollution > MaxPollution)
            {
                return;
            }

            int tileValue = map.GetTileValue(x, y);

            if (tileValue == TileValues.FREEZ)
            {
                if (population < 8)
                {
                    // Zone capacity not yet reached: build another house
                    BuildHouse(map, x, y, lpValue, random);
                    ZoneUtils.IncRateOfGrowth(blockMaps, x, y, 1);
                }
                else if (blockMaps.PopulationDensityMap.WorldGet(x, y) > 64)
                {
                    // There is local demand for higher density housing
                    PlaceResidential(map, x, y, 0, lpValue, zonePower);
                    ZoneUtils.IncRateOfGrowth(blockMaps, x, y, 8);
                }

                return;
            }

            if (population < 40)
            {
                // Zone population not yet maxed out
                PlaceResidential(map, x, y, JsMath.FloorDiv(population, 8) - 1, lpValue, zonePower);
                ZoneUtils.IncRateOfGrowth(blockMaps, x, y, 8);
            }
        }

        private static void DegradeZone(GameMap map, int x, int y, BlockMaps blockMaps, int population, int lpValue,
                                        bool zonePower, RandomStream random)
        {
            if (population == 0)
            {
                return;
            }

            if (population > 16)
            {
                // Degrade to a lower density block
                PlaceResidential(map, x, y, JsMath.FloorDiv(population - 24, 8), lpValue, zonePower);
                ZoneUtils.IncRateOfGrowth(blockMaps, x, y, -8);
                return;
            }

            if (population == 16)
            {
                // Already at lowest density: degrade to 8 individual houses, column by column as doResidentialOut in the
                // original
                map.SetTile(x, y, TileValues.FREEZ, TileFlags.BLBNCNBIT | TileFlags.ZONEBIT);

                for (int xx = x - 1; xx <= x + 1; xx++)
                {
                    for (int yy = y - 1; yy <= y + 1; yy++)
                    {
                        if (xx == x && yy == y)
                        {
                            continue;
                        }

                        map.SetTile(xx, yy, TileValues.LHTHR + lpValue + random.GetRandom(2), TileFlags.BLBNCNBIT);
                    }
                }

                ZoneUtils.IncRateOfGrowth(blockMaps, x, y, -8);
                return;
            }

            // Already down to individual houses. Remove one
            int i = 0;
            ZoneUtils.IncRateOfGrowth(blockMaps, x, y, -1);

            for (int xx = x - 1; xx <= x + 1; xx++)
            {
                for (int yy = y - 1; yy <= y + 1; yy++, i++)
                {
                    int currentValue = map.GetTileValue(xx, yy);
                    if (currentValue >= TileValues.LHTHR && currentValue <= TileValues.HHTHR)
                    {
                        // We've found a house. Replace it with the normal free zone tile
                        map.SetTile(xx, yy, FreeZone[i] + TileValues.RESBASE, TileFlags.BLBNCNBIT);
                        return;
                    }
                }
            }
        }

        // A score for the zone in the range -3000 to 3000
        private static int EvalResidential(BlockMaps blockMaps, int x, int y, TrafficResult traffic)
        {
            if (traffic == TrafficResult.NoRoadFound)
            {
                return -3000;
            }

            int landValue = blockMaps.LandValueMap.WorldGet(x, y);
            landValue -= blockMaps.PollutionDensityMap.WorldGet(x, y);

            if (landValue < 0)
            {
                landValue = 0;
            }
            else
            {
                landValue = Math.Min(landValue * 32, 6000);
            }

            return landValue - 3000;
        }

        /// <summary>
        /// The map scan's handler for a residential zone's centre, as <c>residentialFound</c>: counts the zone and its
        /// population, drives from it to commercial now and then, and grows or declines it.
        /// </summary>
        public static void ResidentialFound(GameMap map, int x, int y, SimData simData)
        {
            // Notify the census
            simData.Census.ResZonePop += 1;

            // Also, notify the census of our population
            int tileValue = map.GetTileValue(x, y);
            int population = GetZonePopulation(map, x, y, tileValue);
            simData.Census.ResPop += population;

            bool zonePower = map.GetTile(x, y).IsPowered();

            TrafficResult trafficOK = TrafficResult.RouteFound;

            // Occasionally check to see if the zone is connected to the road network. The chance of this happening
            // increases as the zone's population increases. An empty zone never drives, as 0 is never above a draw.
            if (population > simData.Random.GetRandom(35))
            {
                // Is there a route from this zone to a commercial zone?
                trafficOK = simData.TrafficManager.MakeTraffic(x, y, simData.BlockMaps, TrafficDestination.Commercial);

                // If we're not connected to the road network, then going shopping will be a pain. Move out.
                if (trafficOK == TrafficResult.NoRoadFound)
                {
                    // An index in the range 0-3 of the land value and pollution scores (higher is better), which picks
                    // the variant to build
                    int lpValue = ZoneUtils.GetLandPollutionValue(simData.BlockMaps, x, y);
                    DegradeZone(map, x, y, simData.BlockMaps, population, lpValue, zonePower, simData.Random);
                    return;
                }
            }

            // Sometimes we will randomly choose to assess this block. However, always assess it if it's empty or
            // contains only single houses.
            if (tileValue == TileValues.FREEZ || simData.Random.GetChance(7))
            {
                // First, score the individual zone, in the range -3000 to 3000, then take into account global demand
                // for housing
                int locationScore = EvalResidential(simData.BlockMaps, x, y, trafficOK);
                long zoneScore = simData.Valves.ResValve + locationScore;

                // Naturally unpowered zones should be penalized
                if (!zonePower)
                {
                    zoneScore = -500;
                }

                if (zoneScore > -350 && (zoneScore - 26380) > simData.Random.GetRandom16Signed())
                {
                    // If this zone is empty, and residential demand is strong, we might make a hospital
                    if (population == 0 && simData.Random.GetChance(3))
                    {
                        MakeHospital(map, x, y, simData, zonePower);
                        return;
                    }

                    // Grow the zone to the next population rank, by the land's desirability and pollution
                    int lpValue = ZoneUtils.GetLandPollutionValue(simData.BlockMaps, x, y);
                    GrowZone(map, x, y, simData.BlockMaps, population, lpValue, zonePower, simData.Random);
                    return;
                }

                if (zoneScore < 350 && (zoneScore + 26380) < simData.Random.GetRandom16Signed())
                {
                    // Degrade to the next lower ranked zone, by the land's desirability and pollution
                    int lpValue = ZoneUtils.GetLandPollutionValue(simData.BlockMaps, x, y);
                    DegradeZone(map, x, y, simData.BlockMaps, population, lpValue, zonePower, simData.Random);
                }
            }
        }

        private static void MakeHospital(GameMap map, int x, int y, SimData simData, bool zonePower)
        {
            // We only build a hospital if the population requires it
            if (simData.Census.NeedHospital > 0)
            {
                ZoneUtils.PutZone(map, x, y, TileValues.HOSPITAL, zonePower);
                simData.Census.NeedHospital = 0;
            }
        }

        /// <summary>
        /// The map scan's handler for a hospital's centre, as <c>hospitalFound</c>: counts it, and now and then
        /// empties it when the city has too many.
        /// </summary>
        public static void HospitalFound(GameMap map, int x, int y, SimData simData)
        {
            simData.Census.HospitalPop += 1;

            // Degrade to an empty zone if a hospital is no longer sustainable
            if (simData.Census.NeedHospital == -1)
            {
                if (simData.Random.GetRandom(20) == 0)
                {
                    ZoneUtils.PutZone(map, x, y, TileValues.FREEZ, map.GetTile(x, y).IsPowered());
                }
            }
        }

        public static void RegisterHandlers(MapScanner mapScanner, RepairManager repairManager)
        {
            mapScanner.AddAction(TileUtils.IsResidentialZone, ResidentialFound);
            mapScanner.AddAction(TileValues.HOSPITAL, HospitalFound);
            repairManager.AddAction(TileValues.HOSPITAL, 15, 3);
        }
    }
}
