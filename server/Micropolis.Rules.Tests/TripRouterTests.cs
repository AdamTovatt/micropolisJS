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

using static Micropolis.Rules.Tests.ToolUse;
using static Micropolis.Rules.TileValues;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The router over hand-built maps. The trip starts from a zone centred at (20, 50), whose footprint is columns 19 to
    /// 21 and rows 49 to 51, so its perimeter's east middle tile is (22, 50), its north middle (20, 48), its north-east
    /// (21, 48) and its south middle (20, 52). A commercial zone is the destination unless a test says otherwise, and
    /// each destination's route ends at a tile beside it no other's does.
    /// </summary>
    [TestClass]
    public sealed partial class TripRouterTests
    {
        private static readonly Position Origin = new Position(20, 50);
        private static readonly Position East = new Position(22, 50);

        // Two ways from the zone to one destination, centred at (30, 50): seven tiles east along row 50 to beside its
        // west side, and twenty-two north, east and south from the north perimeter to beside its north-east corner
        [TestMethod]
        public void Route_TwoWaysToADestination_TakesTheCheaper()
        {
            GameMap map = Map();
            List<Position> direct = Row(50, 22, 28);
            Roads(map, direct);
            Roads(map, Column(20, 44, 48), Row(44, 21, 32), Column(32, 45, 49));
            Zone(map, 30, 50, COMCLR);

            (TrafficResult result, List<Position> route) = Route(map, TrafficDestination.Commercial);

            Assert.AreEqual(TrafficResult.RouteFound, result);
            CollectionAssert.AreEqual(direct, route);
        }

        // Two roads east from the zone's perimeter as long as each other, along rows 49 and 51, to beside a destination
        // centred at (30, 50): the trip takes the first, along row 49, unless the crossing of a path down it at (25, 49)
        // is busy, which makes its tile dearer to drive, and then the other
        [TestMethod]
        [DataRow(0, 49)]
        [DataRow(TripRouter.FootLoadPerCost - 1, 49)]
        [DataRow(TripRouter.FootLoadPerCost, 51)]
        [DataRow(Traffic.MaxFootLoad, 51)]
        public void Route_BusyCrossingOnOneOfTwoRoads_TakesTheOther(int footLoad, int row)
        {
            GameMap map = Map();
            Roads(map, Row(49, 22, 28), Row(51, 22, 28));
            Ground.Path(map, [new Position(25, 49)], Ground.DownTheMiddle);
            Zone(map, 30, 50, COMCLR);
            BlockMaps blockMaps = new BlockMaps(map.Width, map.Height);
            blockMaps.FootLoadMap.WorldSet(25, 49, footLoad);

            (TrafficResult result, List<Position> route) = Route(map, TrafficDestination.Commercial, blockMaps);

            Assert.AreEqual(TrafficResult.RouteFound, result);
            CollectionAssert.AreEqual(Row(row, 22, 28), route);
        }

        // The same two roads with the crossing's path gone and its load left, as the load decays slower than a path is
        // bulldozed: no crossing makes the first road's tile dearer, so the trip takes it, whether walkway lies elsewhere
        // in the city or none does, and the search reads none at all
        [TestMethod]
        [DataRow(true)]
        [DataRow(false)]
        public void Route_LoadLeftWhereNoCrossingIs_TakesTheFirstRoad(bool walkwayElsewhere)
        {
            GameMap map = Map();
            Roads(map, Row(49, 22, 28), Row(51, 22, 28));
            if (walkwayElsewhere)
            {
                map.SetWalkway(25, 40, Ground.Walkway(4));
            }
            Zone(map, 30, 50, COMCLR);
            BlockMaps blockMaps = new BlockMaps(map.Width, map.Height);
            blockMaps.FootLoadMap.WorldSet(25, 49, Traffic.MaxFootLoad);

            (TrafficResult result, List<Position> route) = Route(map, TrafficDestination.Commercial, blockMaps);

            Assert.AreEqual((TrafficResult.RouteFound, walkwayElsewhere), (result, map.HasWalkway));
            CollectionAssert.AreEqual(Row(49, 22, 28), route);
        }

        // A road from the east perimeter to (23, 50), then track along row 50 to (28, 50), beside the destination: with
        // no stations no one rides it; with one at each end, the trip rides from the first to the last
        [TestMethod]
        [DataRow(false, TrafficResult.NoRouteFound)]
        [DataRow(true, TrafficResult.RouteFound)]
        public void Route_TrackToTheDestination_RiddenOnlyBetweenStations(bool stations, TrafficResult expected)
        {
            GameMap map = Map();
            Roads(map, Row(50, 22, 23));
            Track(map, Row(50, 24, 28));
            if (stations)
            {
                Station(map, 24, 50);
                Station(map, 28, 50);
            }
            Zone(map, 30, 50, COMCLR);

            (TrafficResult result, List<RouteStep> route) = Steps(map, TrafficDestination.Commercial);

            Assert.AreEqual(expected, result);
            CollectionAssert.AreEqual(stations ? Going((TravelMode.Road, Row(50, 22, 23)), (TravelMode.Rail, Row(50, 24, 28))) : [], route);
        }

        // Track on the perimeter with no road and no station is no way out of the zone
        [TestMethod]
        public void Route_OnlyTrackOnThePerimeter_FindsNoWayOut()
        {
            GameMap map = Map();
            Track(map, Row(50, 22, 28));
            Zone(map, 30, 50, COMCLR);

            Assert.AreEqual(TrafficResult.NoWayOut, Route(map, TrafficDestination.Commercial).Result);
        }

        // From the east perimeter by road to a station at (24, 50), along row 50 to a station at (34, 50), and by road
        // to (35, 50), beside the destination, costs 42 on empty rail, getting on included; by road round row 47 costs
        // 72. With every tile of the line loaded one short of full the way the ride goes, east, entering each tile by its
        // west end, from the north or west, the ride costs 86, and the trip goes by road; with one tile full that way,
        // the line takes no ride at all. A line full the other way, west, is no load on the ride east, on its own track.
        [TestMethod]
        [DataRow(0, false, true, false)]
        [DataRow(Traffic.MaxRailLoad - 1, false, true, true)]
        [DataRow(Traffic.MaxRailLoad, true, true, true)]
        [DataRow(Traffic.MaxRailLoad, false, false, false)]
        public void Route_LineLoaded_GoesByRoadOnceTheRideCostsMore(int load, bool oneTile, bool theRidesWay, bool byRoad)
        {
            GameMap map = Map();
            List<Position> road = [new Position(21, 48), new Position(21, 47), .. Row(47, 22, 37), new Position(37, 48)];
            Roads(map, Row(50, 22, 23), [new Position(35, 50)], road);
            Station(map, 24, 50);
            Track(map, Row(50, 25, 33));
            Station(map, 34, 50);
            Zone(map, 37, 50, COMCLR);
            BlockMaps blockMaps = new BlockMaps(map.Width, map.Height);
            foreach (Position tile in oneTile ? [new Position(29, 50)] : Row(50, 24, 34))
            {
                blockMaps.RailLoad(fromNorthOrWest: theRidesWay).WorldSet(tile.X, tile.Y, load);
            }

            (_, List<RouteStep> route) = Steps(map, TrafficDestination.Commercial, blockMaps);

            CollectionAssert.AreEqual(
                byRoad
                    ? Going((TravelMode.Road, road))
                    : Going((TravelMode.Road, Row(50, 22, 23)), (TravelMode.Rail, Row(50, 24, 34)), (TravelMode.Road, [new Position(35, 50)])),
                route);
        }

        // No road at the zone: from the east perimeter a walk across open land along row 50 reaches a station at (27, 50)
        // on its sixth tile, the five before it walked, but one at (28, 50) only after a sixth walked tile
        [TestMethod]
        [DataRow(27, TrafficResult.RouteFound)]
        [DataRow(28, TrafficResult.NoWayOut)]
        public void Route_StationAWalkFromTheZone_WalkedToWithinFiveTiles(int stationX, TrafficResult expected)
        {
            GameMap map = Map();
            Station(map, stationX, 50);
            Track(map, Row(50, stationX + 1, 33));
            Station(map, 34, 50);
            Roads(map, [new Position(35, 50)]);
            Zone(map, 37, 50, COMCLR);

            (TrafficResult result, List<RouteStep> route) = Steps(map, TrafficDestination.Commercial);

            Assert.AreEqual(expected, result);
            CollectionAssert.AreEqual(
                expected == TrafficResult.RouteFound
                    ? Going((TravelMode.Walk, Row(50, 22, 26)), (TravelMode.Rail, Row(50, 27, 34)), (TravelMode.Road, [new Position(35, 50)]))
                    : [],
                route);
        }

        // A ride from (24, 50) gets off at (30, 50) and walks across open land along row 50 to beside the destination: five
        // tiles to one centred at (37, 50), but six to one at (38, 50). Five tiles of open land cost more than the route's
        // straight run allows, so the route found is slow.
        [TestMethod]
        [DataRow(37, TrafficResult.SlowRoute)]
        [DataRow(38, TrafficResult.NoRouteFound)]
        public void Route_DestinationAWalkFromAStation_WalkedToWithinFiveTiles(int destinationX, TrafficResult expected)
        {
            GameMap map = Map();
            Roads(map, Row(50, 22, 23));
            Station(map, 24, 50);
            Track(map, Row(50, 25, 29));
            Station(map, 30, 50);
            Zone(map, destinationX, 50, COMCLR);

            (TrafficResult result, List<RouteStep> route) = Steps(map, TrafficDestination.Commercial);

            Assert.AreEqual(expected, result);
            CollectionAssert.AreEqual(
                expected == TrafficResult.SlowRoute
                    ? Going((TravelMode.Road, Row(50, 22, 23)), (TravelMode.Rail, Row(50, 24, 30)), (TravelMode.Walk, Row(50, 31, 35)))
                    : [],
                route);
        }

        // A station two tiles east of the perimeter: a river down column 23 leaves no walk to it
        [TestMethod]
        [DataRow(false, TrafficResult.RouteFound)]
        [DataRow(true, TrafficResult.NoWayOut)]
        public void Route_WaterBetweenTheZoneAndAStation_WalkedOverNot(bool river, TrafficResult expected)
        {
            GameMap map = Map();
            if (river)
            {
                foreach (Position tile in Column(23, 40, 60))
                {
                    map.SetTile(tile.X, tile.Y, RIVER, 0);
                }
            }
            Station(map, 24, 50);
            Track(map, Row(50, 25, 29));
            Station(map, 30, 50);
            Zone(map, 32, 50, COMCLR);

            Assert.AreEqual(expected, Route(map, TrafficDestination.Commercial).Result);
        }

        // A station alone in a road is no way through it: a route gets on there, but rides nowhere and gets off only
        // after a ride
        [TestMethod]
        [DataRow(false, TrafficResult.RouteFound)]
        [DataRow(true, TrafficResult.NoRouteFound)]
        public void Route_StationAloneInTheRoad_IsNoWayThrough(bool station, TrafficResult expected)
        {
            GameMap map = Map();
            Roads(map, Row(50, 22, 28));
            if (station)
            {
                Station(map, 24, 50);
            }
            Zone(map, 30, 50, COMCLR);

            Assert.AreEqual(expected, Route(map, TrafficDestination.Commercial).Result);
        }

        // From a road at (23, 50) a station at (24, 50), with track north of it up column 24 to a station at (24, 44),
        // beside the destination: a ride leaves a station only along its track, so only a station whose track runs north
        // and south takes it there
        [TestMethod]
        [DataRow(false, TrafficResult.RouteFound)]
        [DataRow(true, TrafficResult.NoRouteFound)]
        public void Route_TrackLeavingAStationSideways_IsRiddenNot(bool across, TrafficResult expected)
        {
            GameMap map = Map();
            Roads(map, Row(50, 22, 23));
            Station(map, 24, 50, across);
            Track(map, Column(24, 45, 49));
            Station(map, 24, 44, across: false);
            Zone(map, 24, 42, COMCLR);

            (TrafficResult result, List<RouteStep> route) = Steps(map, TrafficDestination.Commercial);

            Assert.AreEqual(expected, result);
            CollectionAssert.AreEqual(
                across ? [] : Going((TravelMode.Road, Row(50, 22, 23)), (TravelMode.Rail, Column(24, 44, 50).AsEnumerable().Reverse().ToList())),
                route);
        }

        // A ride from (24, 50) to beside the destination at (30, 50) runs through the station at (27, 50) without
        // getting off
        [TestMethod]
        public void Route_StationOnTheWay_RiddenThrough()
        {
            GameMap map = Map();
            Roads(map, Row(50, 22, 23));
            Station(map, 24, 50);
            Track(map, Row(50, 25, 29));
            Station(map, 27, 50);
            Station(map, 30, 50);
            Zone(map, 32, 50, COMCLR);

            CollectionAssert.AreEqual(Going((TravelMode.Road, Row(50, 22, 23)), (TravelMode.Rail, Row(50, 24, 30))),
                                      Steps(map, TrafficDestination.Commercial).Route);
        }

        // No road at the zone: a station on the east perimeter at (22, 50), or a walk of two tiles from it at (24, 50),
        // and track along row 50 to a station at (28, 50), beside the destination. Empty, the trip rides from it; full
        // the way the ride goes, east, it takes no ride, and the zone has a way out all the same, as a zone on a jammed
        // road has, but nowhere to go; full the other way, west, the ride east goes on its own track. The station at
        // (22, 50) gets on from the perimeter at the boarding cost, as a walk from (22, 49) above it onto it does, and
        // the route starts at the station all the same: its first tile gives way to no route as cheap.
        [TestMethod]
        [DataRow(22, false, false, TrafficResult.RouteFound)]
        [DataRow(22, true, true, TrafficResult.NoRouteFound)]
        [DataRow(22, true, false, TrafficResult.RouteFound)]
        [DataRow(24, false, false, TrafficResult.RouteFound)]
        [DataRow(24, true, true, TrafficResult.NoRouteFound)]
        [DataRow(24, true, false, TrafficResult.RouteFound)]
        public void Route_StationFullWhereTheTripGetsOn_IsAWayOutThatTakesNoRide(int stationX, bool full, bool theRidesWay,
                                                                                 TrafficResult expected)
        {
            GameMap map = Map();
            Station(map, stationX, 50);
            Track(map, Row(50, stationX + 1, 27));
            Station(map, 28, 50);
            Zone(map, 30, 50, COMCLR);
            BlockMaps blockMaps = new BlockMaps(map.Width, map.Height);
            if (full)
            {
                // A ride east enters the station by its west end, from the north or west
                blockMaps.RailLoad(fromNorthOrWest: theRidesWay).WorldSet(stationX, 50, Traffic.MaxRailLoad);
            }

            (TrafficResult result, List<RouteStep> route) = Steps(map, TrafficDestination.Commercial, blockMaps);

            Assert.AreEqual(expected, result);
            CollectionAssert.AreEqual(
                expected == TrafficResult.NoRouteFound
                    ? []
                    : Going((TravelMode.Walk, Row(50, 22, stationX - 1)), (TravelMode.Rail, Row(50, stationX, 28))),
                route);
        }

        // A station full both ways at the zone's perimeter, with no road there, takes no ride at all
        [TestMethod]
        public void Route_StationOnThePerimeterFullBothWays_TakesNoRide()
        {
            GameMap map = Map();
            Station(map, 22, 50);
            Track(map, Row(50, 23, 27));
            Station(map, 28, 50);
            Zone(map, 30, 50, COMCLR);
            BlockMaps blockMaps = new BlockMaps(map.Width, map.Height);
            blockMaps.RailLoad(fromNorthOrWest: true).WorldSet(22, 50, Traffic.MaxRailLoad);
            blockMaps.RailLoad(fromNorthOrWest: false).WorldSet(22, 50, Traffic.MaxRailLoad);

            Assert.AreEqual(TrafficResult.NoRouteFound, Steps(map, TrafficDestination.Commercial, blockMaps).Result);
        }

        // A station at (26, 50), with no open land to walk to it across, whose track runs east to a station at (32, 50):
        // a road from the north perimeter along row 48 comes down into its north side, and from the north side of the
        // other a road goes on down column 32 to beside the destination. A route gets on and off at a station's side.
        [TestMethod]
        public void Route_RoadsAtTheStationsSides_GetsOnAndOffThere()
        {
            GameMap map = Map();
            Ground.NoOpenLand(map);
            List<Position> toStation = [.. Row(48, 21, 26), new Position(26, 49)];
            List<Position> fromStation = Column(32, 51, 52);
            Roads(map, toStation, fromStation);
            Station(map, 26, 50);
            Track(map, Row(50, 27, 31));
            Station(map, 32, 50);
            Zone(map, 32, 54, COMCLR);

            CollectionAssert.AreEqual(
                Going((TravelMode.Road, toStation), (TravelMode.Rail, Row(50, 26, 32)), (TravelMode.Road, fromStation)),
                Steps(map, TrafficDestination.Commercial).Route);
        }

        // Two lines along row 50, from a station at (24, 50) to one at (27, 50), and from one at (29, 50) to one at
        // (32, 50), beside the destination: a road at (28, 50) between them takes the trip from the one to the other
        [TestMethod]
        public void Route_TwoLinesJoinedByARoad_RidesBothWithTheRoadBetween()
        {
            GameMap map = Map();
            Roads(map, Row(50, 22, 23), [new Position(28, 50)]);
            Station(map, 24, 50);
            Track(map, Row(50, 25, 26));
            Station(map, 27, 50);
            Station(map, 29, 50);
            Track(map, Row(50, 30, 31));
            Station(map, 32, 50);
            Zone(map, 34, 50, COMCLR);

            CollectionAssert.AreEqual(
                Going((TravelMode.Road, Row(50, 22, 23)), (TravelMode.Rail, Row(50, 24, 27)), (TravelMode.Road, [new Position(28, 50)]),
                      (TravelMode.Rail, Row(50, 29, 32))),
                Steps(map, TrafficDestination.Commercial).Route);
        }

        // From a station at (24, 50) track runs east along row 50 to (29, 50), and beside it, along row 51, track runs
        // from (25, 51) to a station at (30, 51), beside the destination. Each row's straight track leaves by its east
        // and west sides alone, so no ride crosses from one to the other; with the end of row 50 a curve down into a
        // junction on row 51, the ride follows it round.
        [TestMethod]
        [DataRow(false, TrafficResult.NoRouteFound)]
        [DataRow(true, TrafficResult.RouteFound)]
        public void Route_LinesSideBySide_RiddenFromOneToTheOtherOnlyWhereTheyJoin(bool joined, TrafficResult expected)
        {
            GameMap map = Map();
            Roads(map, Row(50, 22, 23));
            Station(map, 24, 50);
            Track(map, Row(50, 25, 29), Row(51, 25, 29));
            Station(map, 30, 51);
            if (joined)
            {
                map.SetTile(29, 50, LVRAIL4, TileFlags.BLBNBIT);
                map.SetTile(29, 51, LVRAIL6, TileFlags.BLBNBIT);
            }
            Zone(map, 32, 51, COMCLR);

            (TrafficResult result, List<RouteStep> route) = Steps(map, TrafficDestination.Commercial);

            Assert.AreEqual(expected, result);
            CollectionAssert.AreEqual(
                joined ? Going((TravelMode.Road, Row(50, 22, 23)), (TravelMode.Rail, [.. Row(50, 24, 29), .. Row(51, 29, 30)])) : [],
                route);
        }

        // A road across track at a level crossing goes on by road over it
        [TestMethod]
        public void Route_RoadOverALevelCrossing_GoesByRoadOverIt()
        {
            GameMap map = Map();
            Roads(map, Row(50, 22, 28));
            map.SetTile(25, 50, VRAILROAD, TileFlags.BLBNBIT);
            Track(map, Column(25, 45, 49), Column(25, 51, 55));
            Zone(map, 30, 50, COMCLR);

            CollectionAssert.AreEqual(Going((TravelMode.Road, Row(50, 22, 28))), Steps(map, TrafficDestination.Commercial).Route);
        }

        // Row 50 east to the destination's west side is seven tiles; from the north-east perimeter a road nine tiles long
        // along row 48 reaches beside its north-west corner. Clear, the trip takes the row; with the row's blocks at their
        // heaviest traffic, its six steps cost more than the detour's eight, and the trip goes round.
        [TestMethod]
        [DataRow(false)]
        [DataRow(true)]
        public void Route_DirectRoadJammed_GoesRound(bool jammed)
        {
            GameMap map = Map();
            List<Position> direct = Row(50, 22, 28);
            List<Position> detour = [.. Row(48, 21, 28), new Position(28, 49)];
            Roads(map, direct, detour);
            Zone(map, 30, 50, COMCLR);
            BlockMaps blockMaps = new BlockMaps(map.Width, map.Height);
            if (jammed)
            {
                Jam(blockMaps, direct);
            }

            (_, List<Position> route) = Route(map, TrafficDestination.Commercial, blockMaps);

            CollectionAssert.AreEqual(jammed ? detour : direct, route);
        }

        // A road east from the perimeter, its last tile beside the destination: a route takes at most sixty tiles
        [TestMethod]
        [DataRow(TripRouter.MaxRouteTiles, TrafficResult.RouteFound)]
        [DataRow(TripRouter.MaxRouteTiles + 1, TrafficResult.NoRouteFound)]
        public void Route_DestinationBesideTheRoadsLastTile_FoundWithinTheCutOnly(int tiles, TrafficResult expected)
        {
            GameMap map = Map();
            Roads(map, Row(50, 22, 22 + tiles - 1));
            Zone(map, 22 + tiles + 1, 50, COMCLR);

            (TrafficResult result, List<Position> route) = Route(map, TrafficDestination.Commercial);

            Assert.AreEqual(expected, result);
            Assert.HasCount(expected == TrafficResult.RouteFound ? tiles : 0, route);
        }

        // Row 50 runs from the east perimeter to (58, 50), and on a tile to (59, 50), beside a destination centred at
        // (61, 50). From the north-east perimeter a road of 59 tiles comes round to (58, 49), above (58, 50). Clear, the
        // row is the cheapest way to (58, 50), and the trip goes on along it. With the row jammed up to (58, 50), the
        // detour is cheaper there, but reaches it as its sixtieth tile, so the search goes no further from it, though
        // the dearer row would have reached the destination within the cut.
        [TestMethod]
        [DataRow(false, TrafficResult.RouteFound)]
        [DataRow(true, TrafficResult.NoRouteFound)]
        public void Route_CheapestWayToATileEndingAtTheCut_GoesNoFurtherFromIt(bool jammed, TrafficResult expected)
        {
            GameMap map = Map();
            List<Position> row = Row(50, 22, 59);
            List<Position> detour = [.. Column(21, 38, 48).AsEnumerable().Reverse(), .. Row(38, 22, 58), .. Column(58, 39, 49)];
            Assert.HasCount(TripRouter.MaxRouteTiles - 1, detour);
            Roads(map, row, detour);
            Zone(map, 61, 50, COMCLR);
            BlockMaps blockMaps = new BlockMaps(map.Width, map.Height);
            if (jammed)
            {
                Jam(blockMaps, Row(50, 23, 58));
            }

            (TrafficResult result, List<Position> route) = Route(map, TrafficDestination.Commercial, blockMaps);

            Assert.AreEqual(expected, result);
            CollectionAssert.AreEqual(jammed ? new List<Position>() : row, route);
        }

        // Along row 50 from the perimeter, with no open land to walk across, three destinations: one centred at (25, 52)
        // whose route is 3 tiles, to (24, 50), weighing 58, one at (40, 48) at 18 tiles, to (39, 50), weighing 43, and
        // one at (55, 48) at 33 tiles, to (54, 50), weighing 28. Row by row the two above the road come first, so a draw
        // from 0 to 42 picks (40, 48), from 43 to 70 (55, 48), and from 71 to 128 (25, 52): each its weight's share of
        // the 129 draws.
        [TestMethod]
        [DataRow(0, 39)]
        [DataRow(42, 39)]
        [DataRow(43, 54)]
        [DataRow(70, 54)]
        [DataRow(71, 24)]
        [DataRow(128, 24)]
        public void Route_DrawAtEachEndOfADestinationsShare_PicksThatDestination(int draw, int arrivalX)
        {
            GameMap map = Map();
            Ground.NoOpenLand(map);
            Roads(map, Row(50, 22, 60));
            Zone(map, 25, 52, COMCLR);
            Zone(map, 40, 48, COMCLR);
            Zone(map, 55, 48, COMCLR);
            uint seed = Seeds.First(RandomStream.FromSeed, random => random.GetRandom(128) == draw);

            (_, List<Position> route) = Route(map, TrafficDestination.Commercial, seed: seed);

            Assert.AreEqual(new Position(arrivalX, 50), route[^1]);
        }

        // From (23, 50) two ways as cheap reach (27, 47): north first and in from the west, or east first and in from
        // the south. The northern way is queued first at every cost, so it reaches (27, 47) first, but the route takes
        // the step from the south, earlier in north, east, south, west, and does on every search.
        [TestMethod]
        public void Route_TwoWaysAsCheap_TakesTheStepEarlierInTheOrderEveryTime()
        {
            GameMap map = Map();
            List<Position> fromSouth = [East, .. Row(50, 23, 27), .. Column(27, 47, 49).AsEnumerable().Reverse(), new Position(27, 46)];
            Roads(map, fromSouth, Column(23, 47, 49), Row(47, 24, 26));
            Zone(map, 27, 44, COMCLR);
            TripRouter router = new TripRouter(map);

            for (int search = 0; search < 3; search++)
            {
                (_, List<Position> route) = Route(map, TrafficDestination.Commercial, router: router);

                CollectionAssert.AreEqual(fromSouth, route, $"Search {search}");
            }
        }

        // A road from the north perimeter comes down to (30, 51) and forks west and east to the two tiles beside the top
        // of a destination centred at (30, 54), as cheap as each other. The fork east is queued first, so (31, 52) is
        // reached first, but the trip arrives at (29, 52), the first of the two row by row.
        [TestMethod]
        public void Route_TwoTilesBesideADestinationAsCheap_ArrivesAtTheFirstRowByRow()
        {
            GameMap map = Map();
            List<Position> west = [.. Column(20, 46, 48).AsEnumerable().Reverse(), .. Row(46, 21, 30), .. Column(30, 47, 51),
                                   new Position(29, 51), new Position(29, 52)];
            Roads(map, west, [new Position(31, 51), new Position(31, 52)]);
            Zone(map, 30, 54, COMCLR);

            (_, List<Position> route) = Route(map, TrafficDestination.Commercial);

            CollectionAssert.AreEqual(west, route);
        }

        // A commercial zone's trip goes to commerce among others, but never to its own zone, which its road passes
        [TestMethod]
        [DataRow(false, TrafficResult.NoRouteFound)]
        [DataRow(true, TrafficResult.RouteFound)]
        public void Route_OwnZoneBesideTheRoad_GoesOnlyToAnother(bool another, TrafficResult expected)
        {
            GameMap map = Map();
            Zone(map, Origin.X, Origin.Y, COMCLR);
            Roads(map, Row(50, 22, 28));
            if (another)
            {
                Zone(map, 30, 50, COMCLR);
            }

            (TrafficResult result, List<Position> route) = Route(map, TrafficDestination.Industrial);

            Assert.AreEqual(expected, result);
            CollectionAssert.AreEqual(another ? Row(50, 22, 28) : [], route);
        }

        // A road from the south perimeter down to the row under the destination's footprint, then east along it: the
        // trip arrives at the row's first tile beside the footprint, at the zone's real size, past where a 3×3 zone
        // round the same centre would end
        [TestMethod]
        [DataRow(COMCLR, 3)]
        [DataRow(PORT, 4)]
        [DataRow(POWERPLANT, 4)]
        [DataRow(STADIUM, 4)]
        [DataRow(FULLSTADIUM, 4)]
        [DataRow(NUCLEAR, 4)]
        [DataRow(AIRPORT, 6)]
        public void Route_RoadAlongTheFootprintsFarSide_ArrivesBesideItsFirstTile(int centreTile, int size)
        {
            const int centreX = 40;
            const int centreY = 50;
            int underY = centreY + size - 1;
            GameMap map = Map();
            Roads(map, Column(20, 52, underY), Row(underY, 21, centreX - 1));
            Zone(map, centreX, centreY, centreTile, size);

            (TrafficResult result, List<Position> route) = Route(map, TrafficDestination.Commercial);

            Assert.AreEqual(TrafficResult.RouteFound, result);
            Assert.AreEqual(new Position(centreX - 1, underY), route[^1]);
        }

        // An industrial zone's trip goes to housing: a residential zone counts once a house stands on it
        [TestMethod]
        [DataRow(false, TrafficResult.NoRouteFound)]
        [DataRow(true, TrafficResult.RouteFound)]
        public void Route_ResidentialZoneBesideTheRoad_IsADestinationOnlyWithAHouse(bool house, TrafficResult expected)
        {
            GameMap map = Map();
            Roads(map, Row(50, 22, 28));
            Zone(map, 30, 50, FREEZ);
            if (house)
            {
                map.SetTile(31, 51, LHTHR, TileFlags.BLBNCNBIT);
            }

            Assert.AreEqual(expected, Route(map, TrafficDestination.Residential).Result);
        }

        // One router routes again after the map changes: with the only house of the destination bulldozed, the zone it
        // reached is no destination, though the search before found it
        [TestMethod]
        public void Route_AfterTheDestinationsHouseIsBulldozed_FindsNoRouteWithTheSameRouter()
        {
            GameMap map = Map();
            Roads(map, Row(50, 22, 28));
            Zone(map, 30, 50, FREEZ);
            map.SetTile(31, 51, LHTHR, TileFlags.BLBNCNBIT);
            TripRouter router = new TripRouter(map);
            Assert.AreEqual(TrafficResult.RouteFound, Route(map, TrafficDestination.Residential, router: router).Result);

            map.SetTile(31, 51, RESBASE + 8, TileFlags.BLBNCNBIT);

            Assert.AreEqual(TrafficResult.NoRouteFound, Route(map, TrafficDestination.Residential, router: router).Result);
        }

        // A destination beside a road the zone's roads never join is never picked, whatever the draw
        [TestMethod]
        public void Route_DestinationOnARoadNotJoined_IsNeverPicked()
        {
            GameMap map = Map();
            Roads(map, Row(50, 22, 28), Row(60, 22, 28));
            Zone(map, 30, 50, COMCLR);
            Zone(map, 30, 60, COMCLR);

            for (uint seed = 1; seed <= 20; seed++)
            {
                (_, List<Position> route) = Route(map, TrafficDestination.Commercial, seed: seed);

                Assert.AreEqual(new Position(28, 50), route[^1], $"Seed {seed}");
            }
        }

        // A road beside the zone that misses its perimeter, which leaves out the corners, is no road of the zone's
        [TestMethod]
        public void Route_NoRoadOnThePerimeter_FindsNoWayOut()
        {
            GameMap map = Map();
            Roads(map, [new Position(22, 48)], Row(50, 23, 28));
            Zone(map, 30, 50, COMCLR);

            (TrafficResult result, List<Position> route) = Route(map, TrafficDestination.Commercial);

            Assert.AreEqual(TrafficResult.NoWayOut, result);
            Assert.IsEmpty(route);
        }

        // A road from the south perimeter round to (31, 52), beside (31, 51) and no other zone's tile. A zone centred at
        // (32, 50) and another up and left of it both hold (31, 51). It is the zone's whose centre comes first in the
        // 3×3 round it, row by row: (30, 50) before (32, 50), and (32, 50) before a plant centred at (29, 49), which
        // only the wider window round the tile holds. A trip to houses reaches the residential zone only where it holds
        // the tile.
        [TestMethod]
        [DataRow(30, 50, RZB, 3, COMCLR, TrafficResult.RouteFound)]
        [DataRow(30, 50, COMCLR, 3, RZB, TrafficResult.NoRouteFound)]
        [DataRow(29, 49, NUCLEAR, 4, RZB, TrafficResult.RouteFound)]
        public void Route_FootprintsOverlappingBesideTheRoad_ReachTheZoneFirstRoundTheTile(int westX, int westY, int westTile,
                                                                                           int westSize, int eastTile,
                                                                                           TrafficResult expected)
        {
            GameMap map = Map();
            List<Position> road = [.. Column(20, 52, 53), .. Row(53, 21, 31), new Position(31, 52)];
            Roads(map, road);
            Zone(map, westX, westY, westTile, westSize);
            Zone(map, 32, 50, eastTile);

            (TrafficResult result, List<Position> route) = Route(map, TrafficDestination.Residential);

            Assert.AreEqual(expected, result);
            CollectionAssert.AreEqual(expected == TrafficResult.RouteFound ? road : new List<Position>(), route);
        }

        // A map with the trip's own zone, a built residential one, at the origin
        private static GameMap Map()
        {
            GameMap map = new GameMap(120, 100);
            Zone(map, Origin.X, Origin.Y, RZB);
            return map;
        }

        private static void Zone(GameMap map, int centreX, int centreY, int centreTile, int size = 3)
        {
            map.PutZone(centreX, centreY, centreTile, size);
        }

        private static void Roads(GameMap map, params List<Position>[] ways)
        {
            foreach (Position tile in ways.SelectMany(way => way))
            {
                map.SetTile(tile.X, tile.Y, ROADS, TileFlags.BULLBIT);
            }
        }

        // Takes the blocks of the tiles to their heaviest traffic
        private static void Jam(BlockMaps blockMaps, List<Position> tiles)
        {
            foreach (Position tile in tiles)
            {
                blockMaps.TrafficDensityMap.WorldSet(tile.X, tile.Y, Traffic.MaxTrafficDensity);
            }
        }

        // Straight rail along each way, a row or a column: east and west along a row, and north and south down a column
        private static void Track(GameMap map, params List<Position>[] ways)
        {
            foreach (List<Position> way in ways)
            {
                int straight = way.All(tile => tile.Y == way[0].Y) ? LHRAIL : LVRAIL;

                foreach (Position tile in way)
                {
                    map.SetTile(tile.X, tile.Y, straight, TileFlags.BLBNBIT);
                }
            }
        }

        private static void Station(GameMap map, int x, int y, bool across = true)
        {
            map.SetTile(x, y, across ? HRAILSTATION : VRAILSTATION, TileFlags.BLBNBIT);
        }

        // The tiles each way in turn, every one of them the way given: by road or rail on no ninths, and on foot across
        // open land, on every ninth
        private static List<RouteStep> Going(params (TravelMode Mode, List<Position> Tiles)[] legs)
        {
            return legs.SelectMany(leg => leg.Tiles.Select(tile => new RouteStep(tile, leg.Mode, leg.Mode == TravelMode.Walk ? Walkways.AllNinths : 0)))
                       .ToList();
        }

        // The tiles walked in turn, each along the ninths given of it
        private static List<RouteStep> Walking(params (List<Position> Tiles, int[] Ninths)[] legs)
        {
            return legs.SelectMany(leg => leg.Tiles.Select(tile => new RouteStep(tile, TravelMode.Walk, TripRoutes.Mask(leg.Ninths))))
                       .ToList();
        }

        private static (TrafficResult Result, List<Position> Route) Route(GameMap map, TrafficDestination destination,
                                                                          BlockMaps? blockMaps = null, uint seed = 0,
                                                                          TripRouter? router = null)
        {
            (TrafficResult result, List<RouteStep> steps) = Steps(map, destination, blockMaps, seed, router);

            return (result, steps.Select(step => step.Tile).ToList());
        }

        private static (TrafficResult Result, List<RouteStep> Route) Steps(GameMap map, TrafficDestination destination,
                                                                           BlockMaps? blockMaps = null, uint seed = 0,
                                                                           TripRouter? router = null)
        {
            (TrafficResult result, TripRoute route) = Routed(map, destination, blockMaps, seed, router);

            return (result, route.Steps);
        }

        private static (TrafficResult Result, TripRoute Route) Routed(GameMap map, TrafficDestination destination,
                                                                      BlockMaps? blockMaps = null, uint seed = 0,
                                                                      TripRouter? router = null)
        {
            TripRoute route = new TripRoute();
            TrafficResult result = (router ?? new TripRouter(map)).Route(
                Origin, destination, blockMaps ?? new BlockMaps(map.Width, map.Height), RandomStream.FromSeed(seed), route);

            return (result, route);
        }
    }
}
