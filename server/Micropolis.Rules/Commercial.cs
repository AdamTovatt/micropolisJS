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

        private static void GrowZone(GameMap map, int x, int y, BlockMaps blockMaps, int population, int lpValue, bool zonePower)
        {
            // landValueMap contains values in the range 0-250, representing the desirability of the land. Thus, after
            // shifting, landValue will be in the range 0-7.
            int landValue = blockMaps.LandValueMap.WorldGet(x, y);
            landValue = landValue >> 5;

            if (population > landValue)
            {
                return;
            }

            // This zone is desirable, and seemingly not too crowded. Switch to the next category of zone.
            if (population < 5)
            {
                PlaceCommercial(map, x, y, population, lpValue, zonePower);
                ZoneUtils.IncRateOfGrowth(blockMaps, x, y, 8);
            }
        }

        private static void DegradeZone(GameMap map, int x, int y, BlockMaps blockMaps, int populationCategory, int lpCategory,
                                        bool zonePower)
        {
            // An empty zone has nowhere lower to go, and is left as it is, as doComOut in the original leaves it
            if (populationCategory == 0)
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

        /// <summary>
        /// The map scan's handler for a commercial zone's centre, as <c>commercialFound</c>: counts the zone and its
        /// population, drives from it to industry now and then, and grows or declines it.
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
            // increases as the population increases). An empty zone never drives.
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
                int locationScore = trafficOK == TrafficResult.NoRoadFound ? -3000 :
                                    simData.BlockMaps.CityCentreDistScoreMap.WorldGet(x, y);
                long zoneScore = simData.Valves.ComValve + locationScore;

                // Unpowered zones should of course be penalized
                if (!zonePower)
                {
                    zoneScore = -500;
                }

                // As doCommercial in the original, a zone whose drive found no route never grows, and draws nothing to
                // decide it
                if (trafficOK != TrafficResult.NoRouteFound && zoneScore > -350 &&
                    (zoneScore - 26380) > simData.Random.GetRandom16Signed())
                {
                    int lpValue = ZoneUtils.GetLandPollutionValue(simData.BlockMaps, x, y);
                    GrowZone(map, x, y, simData.BlockMaps, population, lpValue, zonePower);
                    return;
                }

                if (zoneScore < 350 && (zoneScore + 26380) < simData.Random.GetRandom16Signed())
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
