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

using static Micropolis.Rules.TileValues;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// What a zone's trip does with the route the router finds, which the fixtures' cities need not reach: the traffic
    /// it adds, the helicopter it draws, when it is slow, the trip it offers for a car, and the tiles at and just past
    /// each end of a destination's range. The trip starts from a zone centred at (10, 10), whose perimeter's first tile,
    /// one west and two north of its centre, is the foot of a road running north.
    /// </summary>
    [TestClass]
    public sealed class TrafficTests
    {
        private const int ZoneX = 10;
        private const int ZoneY = 10;
        private const int RoadX = ZoneX - 1;
        private const int StartY = ZoneY - 2;

        // The traffic that makes a step onto a road cost exactly SlowCostPerTile
        private const int LimitTraffic = (TripRouter.SlowCostPerTile - TripRouter.RoadCost) * TripRouter.DensityPerCost;

        // A trip that takes its second tile's block to the heaviest traffic draws no more from the stream than its route
        // does: the original drew there to point the traffic helicopter at the road, where the helicopter chooses its
        // traffic as it takes off
        [TestMethod]
        public void MakeTraffic_TrafficCapped_DrawsNoMoreThanTheRoute()
        {
            GameMap map = TwoTileRoadToCommerce();
            BlockMaps blockMaps = OneTripFromTheCap(map);
            RandomStream random = RandomStream.FromSeed(1);
            RandomStream routeOnly = RandomStream.FromSeed(1);

            Assert.AreNotEqual(TrafficResult.NoRouteFound, MakeTraffic(map, blockMaps, random));
            Seeds.Trip(map, OneTripFromTheCap(map), ZoneX, ZoneY, TrafficDestination.Commercial, routeOnly);

            Assert.AreEqual(Traffic.MaxTrafficDensity, blockMaps.TrafficDensityMap.WorldGet(RoadX, StartY - 1));
            CollectionAssert.AreEqual(routeOnly.GetState(), random.GetState());

            // Block maps whose second road tile's block is one trip short of the heaviest traffic
            static BlockMaps OneTripFromTheCap(GameMap map)
            {
                BlockMaps blockMaps = new BlockMaps(map.Width, map.Height);
                blockMaps.TrafficDensityMap.WorldSet(RoadX, StartY - 1, Traffic.MaxTrafficDensity - Traffic.TripTraffic);
                return blockMaps;
            }
        }

        // North from the perimeter by road over (9, 8) and a level crossing at (9, 7), riding from a station at (9, 6)
        // through a level crossing at (9, 4) to a station at (9, 3), then walking east over (10, 3) and (11, 3) to beside
        // a destination centred at (13, 3). The trip's traffic reaches the block of each tile it drives, the crossing
        // it drives over included, and its riders each tile it rides, the crossing it rides through included; where it
        // walks it adds neither. (9, 7) shares its block with the station at (9, 6), and (9, 4) with (9, 5).
        [TestMethod]
        public void MakeTraffic_RouteByRoadRailAndOnFoot_AddsTrafficWhereItDrivesAndRidersWhereItRides()
        {
            GameMap map = new GameMap(120, 100);
            map.SetTile(RoadX, StartY, ROADS, TileFlags.BLBNBIT);
            map.SetTile(RoadX, StartY - 1, HRAILROAD, TileFlags.BLBNBIT);
            map.SetTile(RoadX, StartY - 2, VRAILSTATION, TileFlags.BLBNBIT);
            map.SetTile(RoadX, StartY - 3, LVRAIL, TileFlags.BLBNBIT);
            map.SetTile(RoadX, StartY - 4, VRAILROAD, TileFlags.BLBNBIT);
            map.SetTile(RoadX, StartY - 5, VRAILSTATION, TileFlags.BLBNBIT);
            map.PutZone(RoadX + 4, StartY - 5, COMCLR, 3);
            BlockMaps blockMaps = new BlockMaps(map.Width, map.Height);

            Assert.AreEqual(TrafficResult.RouteFound, MakeTraffic(map, blockMaps, RandomStream.FromSeed(0)));

            int[] column = Enumerable.Range(StartY - 5, 6).Reverse().ToArray();
            CollectionAssert.AreEqual(new[] { Traffic.TripTraffic, Traffic.TripTraffic, Traffic.TripTraffic, 0, 0, 0 },
                                      column.Select(y => blockMaps.TrafficDensityMap.WorldGet(RoadX, y)).ToArray());
            CollectionAssert.AreEqual(new[] { 0, 0, Traffic.RideLoad, Traffic.RideLoad, Traffic.RideLoad, Traffic.RideLoad },
                                      column.Select(y => blockMaps.RailLoadMap.WorldGet(RoadX, y)).ToArray());
            CollectionAssert.AreEqual(new[] { 0, 0, 0, 0 },
                                      new[] { blockMaps.TrafficDensityMap.WorldGet(RoadX + 1, StartY - 5), blockMaps.TrafficDensityMap.WorldGet(RoadX + 2, StartY - 5),
                                              blockMaps.RailLoadMap.WorldGet(RoadX + 1, StartY - 5), blockMaps.RailLoadMap.WorldGet(RoadX + 2, StartY - 5) });
        }

        // Each ride adds its riders to a tile up to the full load, and no further
        [TestMethod]
        public void MakeTraffic_RideOntoATileNearlyFull_FillsItNoFurther()
        {
            GameMap map = new GameMap(120, 100);
            map.SetTile(RoadX, StartY, ROADS, TileFlags.BLBNBIT);
            map.SetTile(RoadX, StartY - 1, VRAILSTATION, TileFlags.BLBNBIT);
            map.SetTile(RoadX, StartY - 2, VRAILSTATION, TileFlags.BLBNBIT);
            map.PutZone(RoadX, StartY - 4, COMCLR, 3);
            BlockMaps blockMaps = new BlockMaps(map.Width, map.Height);
            blockMaps.RailLoadMap.WorldSet(RoadX, StartY - 2, Traffic.MaxRailLoad - 1);

            Assert.AreEqual(TrafficResult.RouteFound, MakeTraffic(map, blockMaps, RandomStream.FromSeed(0)));

            Assert.AreEqual((Traffic.RideLoad, Traffic.MaxRailLoad),
                            (blockMaps.RailLoadMap.WorldGet(RoadX, StartY - 1), blockMaps.RailLoadMap.WorldGet(RoadX, StartY - 2)));
        }

        // A route of two road tiles, whose straight run is one tile: it is slow once its one step costs more than
        // SlowCostPerTile, which the traffic on its second tile's block decides
        [TestMethod]
        [DataRow(0, TrafficResult.RouteFound)]
        [DataRow(LimitTraffic, TrafficResult.RouteFound)]
        [DataRow(LimitTraffic + TripRouter.DensityPerCost - 1, TrafficResult.RouteFound)]
        [DataRow(LimitTraffic + TripRouter.DensityPerCost, TrafficResult.SlowRoute)]
        public void MakeTraffic_RouteCostingAroundTheSlowLimit_IsSlowOnlyPastIt(int traffic, TrafficResult expected)
        {
            GameMap map = TwoTileRoadToCommerce();
            BlockMaps blockMaps = new BlockMaps(map.Width, map.Height);
            blockMaps.TrafficDensityMap.WorldSet(RoadX, StartY - 1, traffic);

            Assert.AreEqual(expected, MakeTraffic(map, blockMaps, RandomStream.FromSeed(0)));
        }

        // The trip is the route, offered as it is found: every tile from the perimeter to beside the destination
        [TestMethod]
        public void MakeTraffic_RouteFound_OffersTheRouteAsATrip()
        {
            GameMap map = TwoTileRoadToCommerce();
            Trips trips = new Trips();
            List<Trip> offered = new List<Trip>();
            trips.RunOffered += offered.Add;

            new Traffic(map, RandomStream.FromSeed(0), trips)
                .MakeTraffic(ZoneX, ZoneY, new BlockMaps(map.Width, map.Height), TrafficDestination.Commercial);

            CollectionAssert.AreEqual(new[] { new TilePosition(RoadX, StartY), new TilePosition(RoadX, StartY - 1) },
                                      TripRoutes.Tiles(offered.Single()));
        }

        // With no road or rail on its perimeter a zone has no road; with one that reaches no destination, no route
        [TestMethod]
        [DataRow(false, TrafficResult.NoRoadFound)]
        [DataRow(true, TrafficResult.NoRouteFound)]
        public void MakeTraffic_NoDestinationReached_SaysWhetherThereWasARoad(bool road, TrafficResult expected)
        {
            GameMap map = new GameMap(120, 100);
            if (road)
            {
                map.SetTile(RoadX, StartY, ROADS, 0);
            }

            Assert.AreEqual(expected, MakeTraffic(map, new BlockMaps(map.Width, map.Height), RandomStream.FromSeed(0)));
        }

        [TestMethod]
        [DataRow(TrafficResult.NoRoadFound, 0)]
        [DataRow(TrafficResult.NoRouteFound, 0)]
        [DataRow(TrafficResult.RouteFound, 0)]
        [DataRow(TrafficResult.SlowRoute, Traffic.SlowTripPenalty)]
        public void GrowthPenalty_EachResult_IsThePenaltyOnlyForASlowRoute(TrafficResult result, int penalty)
        {
            Assert.AreEqual(penalty, Traffic.GrowthPenalty(result));
        }

        [TestMethod]
        [DataRow("commercial", COMBASE - 1, false)]
        [DataRow("commercial", COMBASE, true)]
        [DataRow("commercial", NUCLEAR, true)]
        [DataRow("commercial", NUCLEAR + 1, false)]
        [DataRow("industrial", LHTHR - 1, false)]
        [DataRow("industrial", LHTHR, true)]
        [DataRow("industrial", PORT, true)]
        [DataRow("industrial", PORT + 1, false)]
        [DataRow("residential", LHTHR - 1, false)]
        [DataRow("residential", LHTHR, true)]
        [DataRow("residential", COMBASE, true)]
        [DataRow("residential", COMBASE + 1, false)]
        public void Contains_TileAtOrJustPastAnEnd_IsInsideOnlyAtTheEnd(string destination, int tileValue, bool inside)
        {
            TrafficDestination range = destination switch
            {
                "commercial" => TrafficDestination.Commercial,
                "industrial" => TrafficDestination.Industrial,
                _ => TrafficDestination.Residential,
            };

            Assert.AreEqual(inside, range.Contains(tileValue));
        }

        // A road of two tiles north from the perimeter, its second beside a commercial zone and alone in its block
        private static GameMap TwoTileRoadToCommerce()
        {
            GameMap map = new GameMap(120, 100);
            map.SetTile(RoadX, StartY, ROADS, 0);
            map.SetTile(RoadX, StartY - 1, ROADS, 0);
            map.PutZone(RoadX, StartY - 3, COMCLR, 3);
            return map;
        }

        private static TrafficResult MakeTraffic(GameMap map, BlockMaps blockMaps, RandomStream random)
        {
            return new Traffic(map, random, new Trips())
                .MakeTraffic(ZoneX, ZoneY, blockMaps, TrafficDestination.Commercial);
        }
    }
}
