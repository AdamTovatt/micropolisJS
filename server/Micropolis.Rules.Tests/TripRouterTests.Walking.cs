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
    // The router's routes on foot: along walkways, and across open land at a trip's ends. Unless a test says otherwise,
    // rubble lies everywhere but the trip's zone (RubbleMap), which no one walks across.
    public sealed partial class TripRouterTests
    {
        // The north row of a tile's ninths, along its north side, and the south row, along its south side
        private static readonly int[] NorthRow = [0, 1, 2];
        private static readonly int[] SouthRow = [6, 7, 8];

        // A path along the middle of row 50 from the east perimeter, its first ninth on the perimeter tile's side facing
        // the zone, to beside the destination: the zone needs no road, and the trip walks every tile
        [TestMethod]
        public void Route_PathFromTheZonesEdge_WalksItToTheDestination()
        {
            GameMap map = RubbleMap();
            List<Position> path = Row(50, 22, 27);
            Ground.OpenLand(map, path);
            Ground.Path(map, path, Ground.AcrossTheMiddle);
            Zone(map, 29, 50, COMCLR);

            (TrafficResult result, List<RouteStep> route) = Steps(map, TrafficDestination.Commercial);

            Assert.AreEqual(TrafficResult.RouteFound, result);
            CollectionAssert.AreEqual(Going((TravelMode.Walk, path)), route);
        }

        // A path that runs along the east side of the perimeter tile, rail, which isn't open land, touching none of its
        // side facing the zone, is no way out of it
        [TestMethod]
        public void Route_PathNotAlongTheZonesEdge_IsNoWayOut()
        {
            GameMap map = RubbleMap();
            List<Position> path = Row(50, 22, 27);
            Ground.OpenLand(map, path);
            map.SetTile(22, 50, LVRAIL, TileFlags.BLBNBIT);
            Ground.Path(map, [path[0]], 2, 5, 8);
            Ground.Path(map, path.Skip(1), Ground.AcrossTheMiddle);
            Zone(map, 29, 50, COMCLR);

            Assert.AreEqual(TrafficResult.NoWayOut, Steps(map, TrafficDestination.Commercial).Result);
        }

        // Sidewalks along the north and the south side of a road along row 50 from (23, 50), a path to the north one from
        // the zone's edge across rail at (22, 50), and one south from the south one's tile at (25, 50) to beside the
        // destination centred at (25, 53): the two sidewalks join only where a path crosses the road at (25, 50), from the
        // one side to the other
        [TestMethod]
        [DataRow(true, TrafficResult.RouteFound)]
        [DataRow(false, TrafficResult.NoRouteFound)]
        public void Route_SidewalksEitherSideOfARoad_JoinOnlyByACrossing(bool crossing, TrafficResult expected)
        {
            GameMap map = RubbleMap();
            List<Position> road = Row(50, 23, 27);
            map.SetTile(22, 50, LVRAIL, TileFlags.BLBNBIT);
            Ground.OpenLand(map, [new Position(25, 51)]);
            Roads(map, road);
            Ground.Path(map, [new Position(22, 50)], NorthRow);
            Ground.Path(map, road, [.. NorthRow, .. SouthRow]);
            Ground.Path(map, [new Position(25, 51)], Ground.DownTheMiddle);
            if (crossing)
            {
                map.SetWalkway(25, 50, Ground.Walkway([.. NorthRow, .. SouthRow, .. Ground.DownTheMiddle]));
            }
            Zone(map, 25, 53, COMCLR);

            (TrafficResult result, List<RouteStep> route) = Steps(map, TrafficDestination.Commercial);

            Assert.AreEqual(expected, result);
            CollectionAssert.AreEqual(crossing ? Going((TravelMode.Walk, [.. Row(50, 22, 25), new Position(25, 51)])) : [], route);
        }

        // A road along row 50 from the zone's edge, with a sidewalk along its north side, to beside a destination north of
        // it, the route as many tiles as the destination's centre lies east of (22, 50). Walking costs PathCost a step
        // after the first, and driving DriveStartCost and RoadCost a step, so the trip walks while its steps after the
        // first, times what a step on foot costs more, fall short of the drive's start, and drives from there, a drive
        // as cheap winning the tie, and on
        [TestMethod]
        [DataRow(26, true)]
        [DataRow(22 + TripRouter.DriveStartCost / (TripRouter.PathCost - TripRouter.RoadCost), true)]
        [DataRow(23 + TripRouter.DriveStartCost / (TripRouter.PathCost - TripRouter.RoadCost), false)]
        [DataRow(40, false)]
        public void Route_SidewalkBesideARoad_WalksShortTripsAndDrivesLongOnes(int destinationX, bool walks)
        {
            GameMap map = RubbleMap();
            List<Position> road = Row(50, 22, destinationX - 1);
            Roads(map, road);
            Ground.Path(map, road, NorthRow);
            Zone(map, destinationX, 48, COMCLR);

            (_, List<RouteStep> route) = Steps(map, TrafficDestination.Commercial);

            CollectionAssert.AreEqual(Going((walks ? TravelMode.Walk : TravelMode.Road, road)), route);
        }

        // A road on the one tile of the zone's perimeter beside a destination centred at (24, 50): a drive of one tile,
        // costing DriveStartCost over a straight run of none, which SlowAllowance lets through as not slow
        [TestMethod]
        public void Route_DriveOfOneTile_IsNotSlow()
        {
            GameMap map = RubbleMap();
            Roads(map, [East]);
            Zone(map, 24, 50, COMCLR);

            (TrafficResult result, List<RouteStep> route) = Steps(map, TrafficDestination.Commercial);

            Assert.AreEqual(TrafficResult.RouteFound, result);
            CollectionAssert.AreEqual(Going((TravelMode.Road, [East])), route);
        }

        // Open land along row 50 from the zone's edge, with no road, station or walkway anywhere: a destination whose
        // footprint starts four tiles past the perimeter is a walk of four, and one MostWalkedTiles past it a walk of that
        // many, which comes out slow, OpenLandCost a step being more than SlowCostPerTile, so a town that only walks
        // grows held back; one a tile further is one more than a walk across open land goes, which is no way out
        [TestMethod]
        [DataRow(27, TrafficResult.RouteFound)]
        [DataRow(23 + TripRouter.MostWalkedTiles, TrafficResult.SlowRoute)]
        [DataRow(24 + TripRouter.MostWalkedTiles, TrafficResult.NoWayOut)]
        public void Route_OpenLandToTheDestination_WalksItWithinMostWalkedTiles(int destinationX, TrafficResult expected)
        {
            GameMap map = RubbleMap();
            Ground.OpenLand(map, Row(50, 22, 30));
            Zone(map, destinationX, 50, COMCLR);

            (TrafficResult result, List<RouteStep> route) = Steps(map, TrafficDestination.Commercial);

            Assert.AreEqual(expected, result);
            CollectionAssert.AreEqual(expected == TrafficResult.NoWayOut ? [] : Going((TravelMode.Walk, Row(50, 22, destinationX - 2))), route);
        }

        // The wild woods along row 50 from the zone's edge to beside a destination are no open land: no one walks across
        // them, and the zone has no way out
        [TestMethod]
        public void Route_WildWoodsToTheDestination_IsNoWayOut()
        {
            GameMap map = RubbleMap();
            foreach (Position tile in Row(50, 22, 24))
            {
                map.SetTile(tile.X, tile.Y, WOODS, TileFlags.BLBNBIT);
            }
            Zone(map, 26, 50, COMCLR);

            Assert.AreEqual(TrafficResult.NoWayOut, Steps(map, TrafficDestination.Commercial).Result);
        }

        // Open land from the zone's edge along row 50 to a path at (25, 50), which runs on to (40, 50), and open land from
        // its end to beside a destination centred at (44, 50): the trip walks across open land at each end of the path
        [TestMethod]
        public void Route_OpenLandAtEachEndOfAPath_WalksAcrossItToAndFromThePath()
        {
            GameMap map = RubbleMap();
            Ground.OpenLand(map, Row(50, 22, 42));
            Ground.Path(map, Row(50, 25, 40), Ground.AcrossTheMiddle);
            Zone(map, 44, 50, COMCLR);

            (TrafficResult result, List<RouteStep> route) = Steps(map, TrafficDestination.Commercial);

            Assert.AreEqual(TrafficResult.RouteFound, result);
            CollectionAssert.AreEqual(Going((TravelMode.Walk, Row(50, 22, 42))), route);
        }

        // A path within a walk across open land of the zone, which reaches no destination, is a way out of it: the trip
        // finds no route, rather than no way out
        [TestMethod]
        public void Route_PathAWalkFromTheZoneReachingNoDestination_FindsNoRoute()
        {
            GameMap map = RubbleMap();
            Ground.OpenLand(map, Row(50, 22, 30));
            Ground.Path(map, Row(50, 25, 30), Ground.AcrossTheMiddle);

            Assert.AreEqual(TrafficResult.NoRouteFound, Steps(map, TrafficDestination.Commercial).Result);
        }

        // A path along row 50 to beside the destination, whose middle tile at (25, 50) has turned to rubble, which takes
        // no walkway, though the map scan has yet to clear it: no one walks it
        [TestMethod]
        public void Route_PathOnATileThatTakesNone_IsNotWalked()
        {
            GameMap map = RubbleMap();
            List<Position> path = Row(50, 22, 27);
            Ground.OpenLand(map, path);
            Ground.Path(map, path, Ground.AcrossTheMiddle);
            map.SetTile(25, 50, RUBBLE, TileFlags.BULLBIT);
            Zone(map, 29, 50, COMCLR);

            Assert.AreEqual(TrafficResult.NoRouteFound, Steps(map, TrafficDestination.Commercial).Result);
        }

        // A path from the zone's edge to a station at (25, 50), which a ride takes east to one at (30, 50), and a path on
        // from its east side to beside the destination
        [TestMethod]
        public void Route_PathToAndFromStations_WalksToTheTrainAndFromIt()
        {
            GameMap map = RubbleMap();
            List<Position> toStation = Row(50, 22, 24);
            List<Position> fromStation = Row(50, 31, 32);
            Ground.OpenLand(map, [.. toStation, .. fromStation]);
            Ground.Path(map, [.. toStation, .. fromStation], Ground.AcrossTheMiddle);
            Station(map, 25, 50);
            Track(map, Row(50, 26, 29));
            Station(map, 30, 50);
            Zone(map, 34, 50, COMCLR);

            (_, List<RouteStep> route) = Steps(map, TrafficDestination.Commercial);

            CollectionAssert.AreEqual(Going((TravelMode.Walk, toStation), (TravelMode.Rail, Row(50, 25, 30)), (TravelMode.Walk, fromStation)), route);
        }

        // A map of rubble with the trip's own zone at the origin
        private static GameMap RubbleMap()
        {
            GameMap map = Map();
            Ground.NoOpenLand(map);
            return map;
        }
    }
}
