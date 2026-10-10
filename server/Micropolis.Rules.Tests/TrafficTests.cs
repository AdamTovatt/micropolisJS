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
        // through a level crossing at (9, 4) to a station at (9, 3), then walking east along a path over (10, 3) and
        // (11, 3) to beside a destination centred at (13, 3), with no open land to walk across. The trip's traffic
        // reaches the block of each tile it drives, the crossing it drives over included, and its riders each tile it
        // rides, the crossing it rides through included; where it walks it adds neither. (9, 7) shares its block with the
        // station at (9, 6), and (9, 4) with (9, 5).
        [TestMethod]
        public void MakeTraffic_RouteByRoadRailAndOnFoot_AddsTrafficWhereItDrivesAndRidersWhereItRides()
        {
            GameMap map = new GameMap(120, 100);
            Ground.NoOpenLand(map);
            Ground.OpenLand(map, [new Position(RoadX + 1, StartY - 5), new Position(RoadX + 2, StartY - 5)]);
            Ground.Path(map, [new Position(RoadX + 1, StartY - 5), new Position(RoadX + 2, StartY - 5)], Ground.AcrossTheMiddle);
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
            // The ride goes north, entering each tile by its south end, so its riders are the load from the south or east
            CollectionAssert.AreEqual(new[] { 0, 0, Traffic.RideLoad, Traffic.RideLoad, Traffic.RideLoad, Traffic.RideLoad },
                                      column.Select(y => blockMaps.RailLoadFromSouthOrEastMap.WorldGet(RoadX, y)).ToArray());
            // The four tiles of rail it rides, and none other
            Assert.AreEqual((0, 4), (blockMaps.RailLoadFromNorthOrWestMap.CopyValues().Count(riders => riders != 0),
                                     blockMaps.RailLoadFromSouthOrEastMap.CopyValues().Count(riders => riders != 0)));
            CollectionAssert.AreEqual(new[] { 0, 0 },
                                      new[] { blockMaps.TrafficDensityMap.WorldGet(RoadX + 1, StartY - 5), blockMaps.TrafficDensityMap.WorldGet(RoadX + 2, StartY - 5) });
        }

        // The same line the other way: from the south perimeter by road over (9, 12) and a level crossing at (9, 13),
        // riding south from a station at (9, 14) through a level crossing at (9, 16) to a station at (9, 17), then
        // walking east along a path to beside a destination centred at (13, 17). Its riders are the load of each tile
        // from the north or west, so trains each way along a line go on tracks of their own.
        [TestMethod]
        public void MakeTraffic_RideSouth_AddsToTheLoadFromTheNorthOrWest()
        {
            GameMap map = new GameMap(120, 100);
            Ground.NoOpenLand(map);
            Ground.OpenLand(map, [new Position(RoadX + 1, ZoneY + 7), new Position(RoadX + 2, ZoneY + 7)]);
            Ground.Path(map, [new Position(RoadX + 1, ZoneY + 7), new Position(RoadX + 2, ZoneY + 7)], Ground.AcrossTheMiddle);
            map.SetTile(RoadX, ZoneY + 2, ROADS, TileFlags.BLBNBIT);
            map.SetTile(RoadX, ZoneY + 3, HRAILROAD, TileFlags.BLBNBIT);
            map.SetTile(RoadX, ZoneY + 4, VRAILSTATION, TileFlags.BLBNBIT);
            map.SetTile(RoadX, ZoneY + 5, LVRAIL, TileFlags.BLBNBIT);
            map.SetTile(RoadX, ZoneY + 6, VRAILROAD, TileFlags.BLBNBIT);
            map.SetTile(RoadX, ZoneY + 7, VRAILSTATION, TileFlags.BLBNBIT);
            map.PutZone(RoadX + 4, ZoneY + 7, COMCLR, 3);
            BlockMaps blockMaps = new BlockMaps(map.Width, map.Height);

            Assert.AreEqual(TrafficResult.RouteFound, MakeTraffic(map, blockMaps, RandomStream.FromSeed(0)));

            CollectionAssert.AreEqual(new[] { Traffic.RideLoad, Traffic.RideLoad, Traffic.RideLoad, Traffic.RideLoad },
                                      Enumerable.Range(ZoneY + 4, 4).Select(y => blockMaps.RailLoadFromNorthOrWestMap.WorldGet(RoadX, y)).ToArray());
            // The four tiles of rail it rides, and none other
            Assert.AreEqual((4, 0), (blockMaps.RailLoadFromNorthOrWestMap.CopyValues().Count(riders => riders != 0),
                                     blockMaps.RailLoadFromSouthOrEastMap.CopyValues().Count(riders => riders != 0)));
        }

        // Riding straight through the cross at (10, 6) east, from a station at (9, 6) to one at (12, 6), or west, from
        // the station at (9, 6) to one at (6, 6), each to beside a destination centred two tiles north of where it gets
        // off: east the riders are the cross's load from the north or west, west its load from the south or east
        [TestMethod]
        [DataRow(1, true)]
        [DataRow(-1, false)]
        public void MakeTraffic_RideStraightThroughTheCross_AddsToTheLoadTheWayItGoes(int way, bool fromNorthOrWest)
        {
            GameMap map = new GameMap(120, 100);
            map.SetTile(RoadX, StartY, ROADS, TileFlags.BLBNBIT);
            map.SetTile(RoadX, StartY - 1, ROADS, TileFlags.BLBNBIT);
            map.SetTile(RoadX, StartY - 2, HRAILSTATION, TileFlags.BLBNBIT);
            map.SetTile(RoadX + way, StartY - 2, LVRAIL10, TileFlags.BLBNBIT);
            map.SetTile(RoadX + 2 * way, StartY - 2, LHRAIL, TileFlags.BLBNBIT);
            map.SetTile(RoadX + 3 * way, StartY - 2, HRAILSTATION, TileFlags.BLBNBIT);
            map.PutZone(RoadX + 3 * way, StartY - 4, COMCLR, 3);
            BlockMaps blockMaps = new BlockMaps(map.Width, map.Height);

            Assert.AreNotEqual(TrafficResult.NoRouteFound, MakeTraffic(map, blockMaps, RandomStream.FromSeed(0)));

            Assert.AreEqual((Traffic.RideLoad, 0), (blockMaps.RailLoad(fromNorthOrWest).WorldGet(RoadX + way, StartY - 2),
                                                    blockMaps.RailLoad(!fromNorthOrWest).WorldGet(RoadX + way, StartY - 2)));
        }

        // A line from a station at (9, 16) north to one at (9, 13). Trips from a zone centred at (10, 20) ride it north,
        // by road to the first, and along a path to beside a destination centred at (13, 13); a trip from one centred at
        // (9, 10) rides it south, by road at (9, 12) to the second, and along a path at (8, 16) to beside a destination
        // centred at (6, 16), built once the line is full north, with no open land to walk across. The router refuses
        // the trips north once the traffic rule has filled the line's load that way, ride by ride, and still sends the
        // trip south down it: the load the rule adds to is the load the router reads.
        [TestMethod]
        public void MakeTraffic_LineFullOneWay_RefusesRidesThatWayAndStillRidesTheOther()
        {
            GameMap map = new GameMap(120, 100);
            Ground.NoOpenLand(map);
            List<Position> paths = [new Position(10, 13), new Position(11, 13), new Position(8, 16)];
            Ground.OpenLand(map, paths);
            Ground.Path(map, paths, Ground.AcrossTheMiddle);
            map.SetTile(9, 18, ROADS, TileFlags.BLBNBIT);
            map.SetTile(9, 17, ROADS, TileFlags.BLBNBIT);
            map.SetTile(9, 16, VRAILSTATION, TileFlags.BLBNBIT);
            map.SetTile(9, 15, LVRAIL, TileFlags.BLBNBIT);
            map.SetTile(9, 14, LVRAIL, TileFlags.BLBNBIT);
            map.SetTile(9, 13, VRAILSTATION, TileFlags.BLBNBIT);
            map.SetTile(9, 12, ROADS, TileFlags.BLBNBIT);
            map.PutZone(13, 13, COMCLR, 3);
            BlockMaps blockMaps = new BlockMaps(map.Width, map.Height);
            Traffic traffic = new Traffic(map, RandomStream.FromSeed(0), new Trips(() => 0));

            int ridden = 0;
            while (ridden <= Traffic.MaxRailLoad / Traffic.RideLoad &&
                   traffic.MakeTraffic(10, 20, blockMaps, TrafficDestination.Commercial) != TrafficResult.NoRouteFound)
            {
                ridden++;
            }

            Assert.AreEqual(Traffic.MaxRailLoad / Traffic.RideLoad, ridden);
            Assert.AreEqual((Traffic.MaxRailLoad, 0), (blockMaps.RailLoadFromSouthOrEastMap.WorldGet(9, 14),
                                                       blockMaps.RailLoadFromNorthOrWestMap.WorldGet(9, 14)));

            // The trip south's destination only now, as the trips north, which pick among the destinations they find,
            // would go to it too
            map.PutZone(6, 16, COMCLR, 3);
            Assert.AreNotEqual(TrafficResult.NoRouteFound, traffic.MakeTraffic(9, 10, blockMaps, TrafficDestination.Commercial));
            Assert.AreEqual(Traffic.RideLoad, blockMaps.RailLoadFromNorthOrWestMap.WorldGet(9, 14));
        }

        // The overlay's load of a tile is its load the busier way, whichever way that is
        [TestMethod]
        public void BusierRailLoadMap_LoadsEachWay_IsEachTilesGreater()
        {
            BlockMaps blockMaps = new BlockMaps(120, 100);
            blockMaps.RailLoadFromNorthOrWestMap.WorldSet(20, 30, 200);
            blockMaps.RailLoadFromSouthOrEastMap.WorldSet(20, 30, 12);
            blockMaps.RailLoadFromNorthOrWestMap.WorldSet(21, 30, 8);
            blockMaps.RailLoadFromSouthOrEastMap.WorldSet(21, 30, 150);
            blockMaps.RailLoadFromSouthOrEastMap.WorldSet(22, 30, 40);

            BlockMap busier = Traffic.BusierRailLoadMap(blockMaps);

            CollectionAssert.AreEqual(new[] { 200, 150, 40 }, Enumerable.Range(20, 3).Select(x => busier.WorldGet(x, 30)).ToArray());
            Assert.AreEqual(3, busier.CopyValues().Count(riders => riders != 0));
        }

        // Each ride adds its riders to a tile up to the full load the way it goes, and no further, with no open land to
        // walk to the destination across
        [TestMethod]
        public void MakeTraffic_RideOntoATileNearlyFull_FillsItNoFurther()
        {
            GameMap map = new GameMap(120, 100);
            Ground.NoOpenLand(map);
            map.SetTile(RoadX, StartY, ROADS, TileFlags.BLBNBIT);
            map.SetTile(RoadX, StartY - 1, VRAILSTATION, TileFlags.BLBNBIT);
            map.SetTile(RoadX, StartY - 2, VRAILSTATION, TileFlags.BLBNBIT);
            map.PutZone(RoadX, StartY - 4, COMCLR, 3);
            BlockMaps blockMaps = new BlockMaps(map.Width, map.Height);
            blockMaps.RailLoadFromSouthOrEastMap.WorldSet(RoadX, StartY - 2, Traffic.MaxRailLoad - 1);

            // A ride of one tile costs more than the two tiles to it are worth, for getting on: found, but slow
            Assert.AreEqual(TrafficResult.SlowRoute, MakeTraffic(map, blockMaps, RandomStream.FromSeed(0)));

            Assert.AreEqual((Traffic.RideLoad, Traffic.MaxRailLoad),
                            (blockMaps.RailLoadFromSouthOrEastMap.WorldGet(RoadX, StartY - 1), blockMaps.RailLoadFromSouthOrEastMap.WorldGet(RoadX, StartY - 2)));
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
            Trips trips = new Trips(() => 0);
            List<Trip> offered = new List<Trip>();
            trips.RunOffered += offered.Add;

            new Traffic(map, RandomStream.FromSeed(0), trips)
                .MakeTraffic(ZoneX, ZoneY, new BlockMaps(map.Width, map.Height), TrafficDestination.Commercial);

            CollectionAssert.AreEqual(new[] { new TilePosition(RoadX, StartY), new TilePosition(RoadX, StartY - 1) },
                                      TripRoutes.Tiles(offered.Single()));
        }

        // With no road or rail on its perimeter a zone has no road; with one that reaches no destination, no route
        [TestMethod]
        [DataRow(false, TrafficResult.NoWayOut)]
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
        [DataRow(TrafficResult.NoWayOut, 0)]
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

        // A road of two tiles north from the perimeter, its second beside a commercial zone and alone in its block, with no
        // open land to walk to the zone across
        private static GameMap TwoTileRoadToCommerce()
        {
            GameMap map = new GameMap(120, 100);
            Ground.NoOpenLand(map);
            map.SetTile(RoadX, StartY, ROADS, 0);
            map.SetTile(RoadX, StartY - 1, ROADS, 0);
            map.PutZone(RoadX, StartY - 3, COMCLR, 3);
            return map;
        }

        private static TrafficResult MakeTraffic(GameMap map, BlockMaps blockMaps, RandomStream random)
        {
            return new Traffic(map, random, new Trips(() => 0))
                .MakeTraffic(ZoneX, ZoneY, blockMaps, TrafficDestination.Commercial);
        }
    }
}
