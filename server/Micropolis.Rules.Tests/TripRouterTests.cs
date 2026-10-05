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
    /// The router over hand-built maps. The trip starts from a zone centred at (20, 50), whose footprint is columns 19 to
    /// 21 and rows 49 to 51, so its perimeter's east middle tile is (22, 50), its north middle (20, 48), its north-east
    /// (21, 48) and its south middle (20, 52). A commercial zone is the destination unless a test says otherwise, and
    /// each destination's route ends at a tile beside it no other's does.
    /// </summary>
    [TestClass]
    public sealed class TripRouterTests
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

        // From (23, 50) two ways as long reach (27, 50): north round row 48 on road, or south round row 52 on rail
        [TestMethod]
        public void Route_RailAndRoadAsLong_TakesTheRail()
        {
            GameMap map = Map();
            Roads(map, Row(50, 22, 23), Column(23, 48, 49), Row(48, 24, 27), Column(27, 49, 49), Row(50, 27, 28));
            List<Position> rail = [new Position(23, 51), .. Row(52, 23, 27), new Position(27, 51)];
            foreach (Position tile in rail)
            {
                map.SetTile(tile.X, tile.Y, HRAIL, 0);
            }
            Zone(map, 30, 50, COMCLR);

            (_, List<Position> route) = Route(map, TrafficDestination.Commercial);

            CollectionAssert.AreEqual(new List<Position> { East, new Position(23, 50) }.Concat(rail).Concat(Row(50, 27, 28)).ToList(), route);
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

        // Along row 50 from the perimeter, three destinations: one centred at (25, 52) whose route is 3 tiles, to
        // (24, 50), weighing 58, one at (40, 48) at 18 tiles, to (39, 50), weighing 43, and one at (55, 48) at 33
        // tiles, to (54, 50), weighing 28. Row by row the two above the road come first, so a draw from 0 to 42 picks
        // (40, 48), from 43 to 70 (55, 48), and from 71 to 128 (25, 52): each its weight's share of the 129 draws.
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
        public void Route_NoRoadOnThePerimeter_FindsNoRoad()
        {
            GameMap map = Map();
            Roads(map, [new Position(22, 48)], Row(50, 23, 28));
            Zone(map, 30, 50, COMCLR);

            (TrafficResult result, List<Position> route) = Route(map, TrafficDestination.Commercial);

            Assert.AreEqual(TrafficResult.NoRoadFound, result);
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

        // The tiles of a row from one column to another, west to east
        private static List<Position> Row(int y, int fromX, int toX)
        {
            return Enumerable.Range(fromX, toX - fromX + 1).Select(x => new Position(x, y)).ToList();
        }

        // The tiles of a column from one row to another, north to south
        private static List<Position> Column(int x, int fromY, int toY)
        {
            return Enumerable.Range(fromY, toY - fromY + 1).Select(y => new Position(x, y)).ToList();
        }

        private static (TrafficResult Result, List<Position> Route) Route(GameMap map, TrafficDestination destination,
                                                                          BlockMaps? blockMaps = null, uint seed = 0,
                                                                          TripRouter? router = null)
        {
            List<Position> route = new List<Position>();
            TrafficResult result = (router ?? new TripRouter(map)).Route(
                Origin, destination, (blockMaps ?? new BlockMaps(map.Width, map.Height)).TrafficDensityMap,
                RandomStream.FromSeed(seed), route);

            return (result, route);
        }
    }
}
