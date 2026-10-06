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
    /// Commercial zones, as the original's <c>doCommercial</c> in zone.cpp grows and declines them.
    /// </summary>
    public static class Commercial
    {
        /// <summary>
        /// The population level, 0–5, of the commercial zone whose centre has the tile value.
        /// </summary>
        public static int GetZonePopulation(GameMap map, int x, int y, int tileValue)
        {
            if (tileValue == TileValues.COMCLR)
            {
                return 0;
            }

            return JsMath.FloorDiv(tileValue - TileValues.CZB, 9) % 5 + 1;
        }

        // Places the commercial zone of a population category in the range 0-4, one less than the population level it
        // gives, and a value category in the range 0-3
        private static void PlaceCommercial(GameMap map, int x, int y, int population, int lpValue, bool zonePower)
        {
            int centreTile = ((lpValue * 5) + population) * 9 + TileValues.CZB;
            ZoneUtils.PutZone(map, x, y, centreTile, zonePower);
        }

        // The population level of the densest zone
        private const int MostPopulation = 5;

        // Whether the land value of the zone's block lets a zone of the population level grow: the higher the land value,
        // the more crowded a zone it lets grow
        private static bool LandValueLetsGrow(BlockMaps blockMaps, int x, int y, int population)
        {
            // landValueMap contains values in the range 0-250, representing the desirability of the land. Thus, after
            // shifting, landValue will be in the range 0-7.
            int landValue = blockMaps.LandValueMap.WorldGet(x, y);
            landValue = landValue >> 5;

            return population <= landValue;
        }

        // Whether a decline has people to take from the zone of the population level: an empty zone has nowhere lower to
        // go, and is left as it is, as doComOut in the original leaves it
        private static bool CanDegrade(int population)
        {
            return population > 0;
        }

        private static void GrowZone(GameMap map, int x, int y, BlockMaps blockMaps, int population, int lpValue, bool zonePower)
        {
            if (!LandValueLetsGrow(blockMaps, x, y, population))
            {
                return;
            }

            // This zone is desirable, and seemingly not too crowded. Switch to the next category of zone.
            if (population < MostPopulation)
            {
                PlaceCommercial(map, x, y, population, lpValue, zonePower);
                ZoneUtils.IncRateOfGrowth(blockMaps, x, y, 8);
            }
        }

        private static void DegradeZone(GameMap map, int x, int y, BlockMaps blockMaps, int populationCategory, int lpCategory,
                                        bool zonePower)
        {
            if (!CanDegrade(populationCategory))
            {
                return;
            }

            if (populationCategory > 1)
            {
                PlaceCommercial(map, x, y, populationCategory - 2, lpCategory, zonePower);
            }
            else
            {
                ZoneUtils.PutZone(map, x, y, TileValues.COMCLR, zonePower);
            }

            ZoneUtils.IncRateOfGrowth(blockMaps, x, y, -8);
        }

        // The location score of the zone centred at (x, y), whose trip came to the traffic: its block's score for nearness
        // to the city centre, or with no road ZoneUtils.NoRoadLocationScore
        private static int LocationScore(BlockMaps blockMaps, int x, int y, TrafficResult traffic)
        {
            return traffic == TrafficResult.NoRoadFound ? ZoneUtils.NoRoadLocationScore : blockMaps.CityCentreDistScoreMap.WorldGet(x, y);
        }

        /// <summary>
        /// What the handler reads of the commercial zone centred at (x, y) as it assesses it, which it does only now and
        /// then, were its trip to find a route.
        /// </summary>
        internal static ZoneFacts Facts(GameMap map, int x, int y, BlockMaps blockMaps, Valves valves)
        {
            int population = GetZonePopulation(map, x, y, map.GetTileValue(x, y));
            List<GrowthBlocker> growStep = [];

            // What GrowZone refuses
            if (!LandValueLetsGrow(blockMaps, x, y, population))
            {
                growStep.Add(GrowthBlocker.LandValueLimitsSize);
            }

            if (population >= MostPopulation)
            {
                growStep.Add(GrowthBlocker.Full);
            }

            // A zone whose trip found no route never grows either, but only a trip tells, and a query routes none
            return new ZoneFacts(valves.ComValve, LocationScore(blockMaps, x, y, TrafficResult.RouteFound), GrowthBlocker.FarFromCentre,
                                 map.GetTile(x, y).IsPowered(), true, CanDegrade(population), growStep);
        }

        /// <summary>
        /// The map scan's handler for a commercial zone's centre, as <c>commercialFound</c>: counts the zone and its
        /// population, routes a trip from it to industry now and then, and grows or declines it.
        /// </summary>
        public static void CommercialFound(GameMap map, int x, int y, SimData simData)
        {
            // Notify the census
            simData.Census.ComZonePop += 1;

            // Calculate the population level for this tile, and add to census
            int tileValue = map.GetTileValue(x, y);
            int population = GetZonePopulation(map, x, y, tileValue);
            simData.Census.ComPop += population;

            bool zonePower = map.GetTile(x, y).IsPowered();

            // Occasionally check to see if the zone is connected to the transport network (the chance of this happening
            // increases as the population increases). An empty zone never makes a trip.
            TrafficResult trafficOK = TrafficResult.RouteFound;
            if (population > simData.Random.GetRandom(5))
            {
                // Try to find a route from here to an industrial zone
                trafficOK = simData.TrafficManager.MakeTraffic(x, y, simData.BlockMaps, TrafficDestination.Industrial);

                // Trigger outward migration if not connected to road network
                if (trafficOK == TrafficResult.NoRoadFound)
                {
                    // An index of the land value and pollution in the range 0-3, which picks the zone's variant
                    int lpValue = ZoneUtils.GetLandPollutionValue(simData.BlockMaps, x, y);
                    DegradeZone(map, x, y, simData.BlockMaps, population, lpValue, zonePower);
                    return;
                }
            }

            // Occasionally assess and perhaps modify the tile
            if (simData.Random.GetChance(7))
            {
                long zoneScore = ZoneUtils.ZoneScore(simData.Valves.ComValve, LocationScore(simData.BlockMaps, x, y, trafficOK),
                                                     trafficOK, zonePower);

                // As doCommercial in the original, a zone whose trip found no route never grows, and draws nothing to
                // decide it
                if (trafficOK != TrafficResult.NoRouteFound && ZoneUtils.DrawsGrowth(zoneScore, simData.Random))
                {
                    int lpValue = ZoneUtils.GetLandPollutionValue(simData.BlockMaps, x, y);
                    GrowZone(map, x, y, simData.BlockMaps, population, lpValue, zonePower);
                    return;
                }

                if (ZoneUtils.DrawsDecline(zoneScore, simData.Random))
                {
                    int lpValue = ZoneUtils.GetLandPollutionValue(simData.BlockMaps, x, y);
                    DegradeZone(map, x, y, simData.BlockMaps, population, lpValue, zonePower);
                }
            }
        }

        public static void RegisterHandlers(MapScanner mapScanner, RepairManager repairManager)
        {
            mapScanner.AddAction(TileUtils.IsCommercialZone, CommercialFound);
        }
    }
}
