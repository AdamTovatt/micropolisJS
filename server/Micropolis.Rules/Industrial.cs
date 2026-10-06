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
    /// Industrial zones, as the original's <c>doIndustrial</c> in zone.cpp grows and declines them.
    /// </summary>
    public static class Industrial
    {
        // Which of the 8 kinds of populated industrial zone are animated, and the tile, relative to the centre, that is
        private static readonly bool[] Animated = [true, false, true, true, false, false, true, true];
        private static readonly int[] AnimationXDelta = [-1, 0, 1, 0, 0, 0, 0, 1];
        private static readonly int[] AnimationYDelta = [-1, 0, -1, -1, 0, 0, -1, -1];

        /// <summary>
        /// The population level, 0–4, of the industrial zone whose centre has the tile value.
        /// </summary>
        public static int GetZonePopulation(GameMap map, int x, int y, int tileValue)
        {
            if (tileValue == TileValues.INDCLR)
            {
                return 0;
            }

            return JsMath.FloorDiv(tileValue - TileValues.IZB, 9) % 4 + 1;
        }

        // Places the industrial zone of a population category in the range 0-3, one less than the population level it
        // gives, and a value category in the range 0-1
        private static void PlaceIndustrial(GameMap map, int x, int y, int populationCategory, int valueCategory, bool zonePower)
        {
            int centreTile = ((valueCategory * 4) + populationCategory) * 9 + TileValues.IZB;
            ZoneUtils.PutZone(map, x, y, centreTile, zonePower);
        }

        // The population level of the densest zone
        private const int MostPopulation = 4;

        // What a zone whose trip found no road loses from its zone score, though the handler declines such a zone before
        // it assesses it
        private const int NoRoadPenalty = 1000;

        private static void GrowZone(GameMap map, int x, int y, BlockMaps blockMaps, int population, int valueCategory,
                                     bool zonePower)
        {
            // Switch to the next category of zone
            if (population < MostPopulation)
            {
                PlaceIndustrial(map, x, y, population, valueCategory, zonePower);
                ZoneUtils.IncRateOfGrowth(blockMaps, x, y, 8);
            }
        }

        private static void DegradeZone(GameMap map, int x, int y, BlockMaps blockMaps, int populationCategory,
                                        int valueCategory, bool zonePower)
        {
            if (!CanDegrade(populationCategory))
            {
                return;
            }

            if (populationCategory > 1)
            {
                PlaceIndustrial(map, x, y, populationCategory - 2, valueCategory, zonePower);
            }
            else
            {
                ZoneUtils.PutZone(map, x, y, TileValues.INDCLR, zonePower);
            }

            ZoneUtils.IncRateOfGrowth(blockMaps, x, y, -8);
        }

        // Sets or clears the animation of the zone's smoking tile by whether it has power, as setAnimation does: the
        // client animates a tile by its flag. The original's setSmoke swaps the tile's value instead.
        private static void SetAnimation(GameMap map, int x, int y, int tileValue, bool isPowered)
        {
            // The empty zone is not animated
            if (tileValue < TileValues.IZB)
            {
                return;
            }

            // The centres of the 8 populated zones lie 9 apart from IZB, under IZB + 72, so dividing by 8 gives 0-7
            int i = (tileValue - TileValues.IZB) >> 3;

            // Animated and powered: animated, conductive and burnable. Otherwise burnable and conductive, without the
            // animation a zone that has just lost its power had
            if (Animated[i] && isPowered)
            {
                map.AddTileFlags(x + AnimationXDelta[i], y + AnimationYDelta[i], TileFlags.ASCBIT);
            }
            else
            {
                map.AddTileFlags(x + AnimationXDelta[i], y + AnimationYDelta[i], TileFlags.BNCNBIT);
                map.RemoveTileFlags(x + AnimationXDelta[i], y + AnimationYDelta[i], TileFlags.ANIMBIT);
            }
        }

        // The location score of a zone whose trip came to the traffic: industry scores nothing for where it stands, but
        // loses NoRoadPenalty with no road
        private static int LocationScore(TrafficResult traffic)
        {
            return traffic == TrafficResult.NoRoadFound ? -NoRoadPenalty : 0;
        }

        // Whether a decline has people to take from the zone of the population level: an empty zone has nowhere lower to
        // go, and is left as it is, as doIndOut in the original leaves it
        private static bool CanDegrade(int population)
        {
            return population > 0;
        }

        /// <summary>
        /// What the handler reads of the industrial zone centred at (x, y) as it assesses it, which it does only now and
        /// then, were its trip to find a route. With a route, its location score is 0, so nothing names it.
        /// </summary>
        internal static ZoneFacts Facts(GameMap map, int x, int y, Valves valves)
        {
            int population = GetZonePopulation(map, x, y, map.GetTileValue(x, y));
            List<GrowthBlocker> growStep = [];

            // What GrowZone refuses
            if (population >= MostPopulation)
            {
                growStep.Add(GrowthBlocker.Full);
            }

            return new ZoneFacts(valves.IndValve, LocationScore(TrafficResult.RouteFound), null, map.GetTile(x, y).IsPowered(), true,
                                 CanDegrade(population), growStep);
        }

        /// <summary>
        /// The map scan's handler for an industrial zone's centre, as <c>industrialFound</c>: counts the zone and its
        /// population, animates it by its power, routes a trip from it to housing now and then, and grows or declines it.
        /// </summary>
        public static void IndustrialFound(GameMap map, int x, int y, SimData simData)
        {
            // Notify the census
            simData.Census.IndZonePop += 1;

            // Calculate the population level for this tile, and add to census
            int tileValue = map.GetTileValue(x, y);
            int population = GetZonePopulation(map, x, y, tileValue);
            simData.Census.IndPop += population;

            // Set animation bit if appropriate
            bool zonePower = map.GetTile(x, y).IsPowered();
            SetAnimation(map, x, y, tileValue, zonePower);

            // Occasionally check to see if the zone is connected to the transport network (the chance of this happening
            // increases as the population increases). An empty zone never makes a trip.
            TrafficResult trafficOK = TrafficResult.RouteFound;
            if (population > simData.Random.GetRandom(5))
            {
                // Try to find a route from here to a residential zone
                trafficOK = simData.TrafficManager.MakeTraffic(x, y, simData.BlockMaps, TrafficDestination.Residential);

                // Trigger outward migration if not connected to road network
                if (trafficOK == TrafficResult.NoRoadFound)
                {
                    int newValue = simData.Random.GetRandom16() & 1;
                    DegradeZone(map, x, y, simData.BlockMaps, population, newValue, zonePower);
                    return;
                }
            }

            // Occasionally assess and perhaps modify the tile
            if (simData.Random.GetChance(7))
            {
                long zoneScore = ZoneUtils.ZoneScore(simData.Valves.IndValve, LocationScore(trafficOK), trafficOK, zonePower);

                if (ZoneUtils.DrawsGrowth(zoneScore, simData.Random))
                {
                    GrowZone(map, x, y, simData.BlockMaps, population, simData.Random.GetRandom16() & 1, zonePower);
                    return;
                }

                if (ZoneUtils.DrawsDecline(zoneScore, simData.Random))
                {
                    DegradeZone(map, x, y, simData.BlockMaps, population, simData.Random.GetRandom16() & 1, zonePower);
                }
            }
        }

        public static void RegisterHandlers(MapScanner mapScanner, RepairManager repairManager)
        {
            mapScanner.AddAction(TileUtils.IsIndustrialZone, IndustrialFound);
        }
    }
}
