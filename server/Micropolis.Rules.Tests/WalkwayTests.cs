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

using System.Text.Json.Nodes;
using static Micropolis.Rules.Tests.ToolUse;
using static Micropolis.Rules.TileValues;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The walkways on ninths of a tile: their pieces, the walkway tool, the tools that build over them, the map scan
    /// that clears them from a tile that takes none, their upkeep, and the walkway command.
    /// </summary>
    [TestClass]
    public sealed class WalkwayTests
    {
        // The ninths of a tile that share a side form its pieces, each in the order of its first ninth: the four corners
        // and the middle are five, and a ring round the middle one
        [TestMethod]
        [DataRow(new[] { 0, 2, 4, 6, 8 }, new[] { 1 << 0, 1 << 2, 1 << 4, 1 << 6, 1 << 8 })]
        [DataRow(new[] { 0, 1, 2, 3, 5, 6, 7, 8 }, new[] { 0b111101111 })]
        [DataRow(new[] { 0, 1, 2, 6, 7, 8 }, new[] { 0b000000111, 0b111000000 })]
        public void Pieces_Ninths_AreTheGroupsSharingASide(int[] ninths, int[] pieces)
        {
            int mask = ninths.Aggregate(0, (bits, ninth) => bits | (1 << ninth));

            CollectionAssert.AreEqual(pieces, Walkways.Pieces(mask).ToArray().Select(piece => (int)piece).ToArray());
        }

        // A ninth on a tile's edge takes its place along that side: from the west along the north and south sides, and
        // from the north along the east and west ones
        [TestMethod]
        [DataRow(2, TileUtils.NorthSide, 0b100)]
        [DataRow(2, TileUtils.EastSide, 0b001)]
        [DataRow(6, TileUtils.SouthSide, 0b001)]
        [DataRow(6, TileUtils.WestSide, 0b100)]
        [DataRow(4, TileUtils.NorthSide, 0)]
        public void Edge_NinthOnASide_TakesItsPlaceAlongIt(int ninth, int side, int places)
        {
            Assert.AreEqual(places, Walkways.Edge(1 << ninth, side));
        }

        // A road's carriageway is the middle ninth and the middle of each side it leaves by; a tile no car drives on has
        // none
        [TestMethod]
        [DataRow(ROADS, new[] { 3, 4, 5 })]
        [DataRow(ROADS2, new[] { 1, 4, 7 })]
        [DataRow(ROADS3, new[] { 1, 4, 5 })]
        [DataRow(INTERSECTION, new[] { 1, 3, 4, 5, 7 })]
        [DataRow(HRAILROAD, new[] { 1, 4, 7 })]
        [DataRow(LHRAIL, new int[0])]
        [DataRow(DIRT, new int[0])]
        public void Carriageway_EachKindOfTile_IsTheMiddleAndTheSidesItsRoadLeavesBy(int tile, int[] ninths)
        {
            Assert.AreEqual(TripRoutes.Mask(ninths), Walkways.Carriageway(tile));
        }

        // A path down the middle of a road along a row crosses it on the carriageway's middle ninth alone, and a sidewalk
        // along its north side crosses nothing
        [TestMethod]
        [DataRow(new[] { 1, 4, 7 }, new[] { 4 })]
        [DataRow(new[] { 0, 1, 2 }, new int[0])]
        [DataRow(new[] { 0, 1, 2, 3, 4, 5 }, new[] { 3, 4, 5 })]
        public void Crossings_PathOnARoad_AreItsNinthsOnTheCarriageway(int[] path, int[] crossings)
        {
            Assert.AreEqual(TripRoutes.Mask(crossings), Walkways.Crossings(Ground.Walkway(path), ROADS));
        }

        // A footbridge or an underpass across the carriageway is no crossing, and stops no car
        [TestMethod]
        [DataRow(WalkwayKind.Footbridge)]
        [DataRow(WalkwayKind.Underpass)]
        public void Crossings_FootbridgeOrUnderpassOnTheCarriageway_AreNone(WalkwayKind kind)
        {
            int walkway = new[] { 1, 4, 7 }.Aggregate(0, (bits, ninth) => Walkways.With(bits, ninth, (int)kind));

            Assert.AreEqual(0, Walkways.Crossings(walkway, ROADS));
        }

        // A tile holding a path on two ninths, a footbridge and an underpass costs the two ninths and the upkeep of a
        // tile of each
        [TestMethod]
        public void Upkeep_TileHoldingEveryKind_IsEachKindsUpkeepTogether()
        {
            int walkway = Walkways.With(Walkways.With(Ground.Walkway(0, 1), 4, (int)WalkwayKind.Footbridge), 7,
                                        (int)WalkwayKind.Underpass);

            Assert.AreEqual(2 + Walkways.FootbridgeUpkeep + Walkways.UnderpassUpkeep, Walkways.Upkeep(walkway));
        }

        // A path on bare land costs PathCost, and on a ninth that holds one already nothing
        [TestMethod]
        public void Lay_BareLandThenAgain_CostsAPathOnce()
        {
            GameMap map = new GameMap(10, 10);
            WalkwayTool tool = new WalkwayTool(map);
            Budget budget = new Budget { TotalFunds = 100 };

            Assert.AreEqual(Outcome.Ok, Lay(tool, 4, 5, budget));
            Assert.AreEqual(Outcome.Ok, Lay(tool, 4, 5, budget));

            Assert.AreEqual(Ground.Walkway(7), map.GetWalkway(1, 1));
            Assert.AreEqual(100 - WalkwayTool.PathCost, budget.TotalFunds);
            Assert.AreEqual(1, map.WalkwayUpkeep);
        }

        // Bare land, a park's trees and fountain, road and rail take walkway; water takes none, nor the wild woods, rubble,
        // a station, a power line or a zone, which need the bulldozer
        [TestMethod]
        [DataRow(DIRT, Outcome.Ok)]
        [DataRow(WOODS, Outcome.NeedsBulldoze)]
        [DataRow(WOODS2, Outcome.Ok)]
        [DataRow(WOODS5, Outcome.Ok)]
        [DataRow(FOUNTAIN, Outcome.Ok)]
        [DataRow(ROADS, Outcome.Ok)]
        [DataRow(HBRIDGE, Outcome.Ok)]
        [DataRow(LHRAIL, Outcome.Ok)]
        [DataRow(HRAILROAD, Outcome.Ok)]
        [DataRow(RIVER, Outcome.OnWater)]
        [DataRow(RUBBLE, Outcome.NeedsBulldoze)]
        [DataRow(HRAILSTATION, Outcome.NeedsBulldoze)]
        [DataRow(LHPOWER, Outcome.NeedsBulldoze)]
        [DataRow(FREEZ, Outcome.NeedsBulldoze)]
        public void Lay_EachKindOfTile_TakesAPathOnlyWhereItTakesWalkway(int tile, Outcome expected)
        {
            GameMap map = new GameMap(10, 10);
            map.SetTile(1, 1, tile, 0);

            Assert.AreEqual(expected, Lay(new WalkwayTool(map), 4, 4, new Budget { TotalFunds = 100 }));
            Assert.AreEqual(expected == Outcome.Ok, map.GetWalkway(1, 1) != 0);
        }

        // A footbridge goes on road, rail or water, and an underpass on road or rail; neither on bare land or in a park,
        // where a path goes, nor an underpass on water or a bridge, under which lies water
        [TestMethod]
        [DataRow(DIRT, WalkwayKind.Footbridge, Outcome.NeedsBulldoze)]
        [DataRow(FOUNTAIN, WalkwayKind.Underpass, Outcome.NeedsBulldoze)]
        [DataRow(RIVER, WalkwayKind.Footbridge, Outcome.Ok)]
        [DataRow(CHANNEL, WalkwayKind.Footbridge, Outcome.Ok)]
        [DataRow(RIVER, WalkwayKind.Underpass, Outcome.OnWater)]
        [DataRow(ROADS, WalkwayKind.Footbridge, Outcome.Ok)]
        [DataRow(ROADS, WalkwayKind.Underpass, Outcome.Ok)]
        [DataRow(LHRAIL, WalkwayKind.Underpass, Outcome.Ok)]
        [DataRow(HBRIDGE, WalkwayKind.Underpass, Outcome.OnWater)]
        [DataRow(HRAIL, WalkwayKind.Underpass, Outcome.OnWater)]
        [DataRow(HBRIDGE, WalkwayKind.Footbridge, Outcome.Ok)]
        [DataRow(HRAIL, WalkwayKind.Path, Outcome.Ok)]
        [DataRow(HRAILSTATION, WalkwayKind.Footbridge, Outcome.NeedsBulldoze)]
        public void Lay_FootbridgeOrUnderpass_GoesOnlyWhereTheTileTakesItsKind(int tile, WalkwayKind kind, Outcome expected)
        {
            GameMap map = new GameMap(10, 10);
            map.SetTile(1, 1, tile, 0);

            Assert.AreEqual(expected, Lay(new WalkwayTool(map), 4, 4, new Budget { TotalFunds = 1000 }, kind));
            Assert.AreEqual(expected == Outcome.Ok ? Walkways.With(0, 4, (int)kind) : 0, map.GetWalkway(1, 1));
        }

        // A footbridge or an underpass down the middle of a road tile and on to the next costs its price once a tile,
        // however many of its ninths it takes, and its upkeep a tile
        [TestMethod]
        [DataRow(WalkwayKind.Footbridge, WalkwayTool.FootbridgeCost, Walkways.FootbridgeUpkeep)]
        [DataRow(WalkwayKind.Underpass, WalkwayTool.UnderpassCost, Walkways.UnderpassUpkeep)]
        public void Lay_FootbridgeOrUnderpassOverTiles_CostsATileAtATime(WalkwayKind kind, long cost, int upkeep)
        {
            GameMap map = new GameMap(10, 10);
            map.SetTile(1, 1, ROADS, 0);
            map.SetTile(1, 2, ROADS, 0);
            WalkwayTool tool = new WalkwayTool(map);
            Budget budget = new Budget { TotalFunds = 1000 };

            for (int ninthY = 3; ninthY <= 6; ninthY++)
            {
                Assert.AreEqual(Outcome.Ok, Lay(tool, 4, ninthY, budget, kind));
            }

            Assert.AreEqual(1000 - 2 * cost, budget.TotalFunds);
            Assert.AreEqual(2 * upkeep, map.WalkwayUpkeep);
        }

        // A city that can't pay for a ninth lays none
        [TestMethod]
        public void Lay_TooLittleMoney_LaysNothing()
        {
            GameMap map = new GameMap(10, 10);

            Assert.AreEqual(Outcome.NoMoney, Lay(new WalkwayTool(map), 4, 4, new Budget { TotalFunds = WalkwayTool.PathCost - 1 }));
            Assert.AreEqual(0, map.GetWalkway(1, 1));
        }

        // A zone placed over paths on two tiles of bare land needs the bulldozer; with auto-bulldoze it clears each tile's
        // path for the bulldozer's cost, as it clears rubble
        [TestMethod]
        [DataRow(false, Outcome.NeedsBulldoze)]
        [DataRow(true, Outcome.Ok)]
        public void BuildingTool_OverPaths_ClearsThemOnlyWithAutoBulldoze(bool autoBulldoze, Outcome expected)
        {
            GameMap map = new GameMap(120, 100);
            map.SetWalkway(51, 50, Ground.Walkway(4));
            map.SetWalkway(50, 49, Ground.Walkway(0, 1));
            Budget budget = new Budget { TotalFunds = 1000 };

            Assert.AreEqual(expected, Apply(CityTools.Create(map)[ToolName.Residential], 51, 50, autoBulldoze, budget));

            Assert.AreEqual((autoBulldoze ? 0 : Ground.Walkway(4), autoBulldoze ? 0 : Ground.Walkway(0, 1)),
                            (map.GetWalkway(51, 50), map.GetWalkway(50, 49)));
            Assert.AreEqual(autoBulldoze ? 1000 - ToolCosts.All[ToolName.Residential] - 2 * StagedTool.BulldozerCost : 1000, budget.TotalFunds);
            Assert.AreEqual(autoBulldoze ? 0 : 3, map.WalkwayUpkeep);
        }

        // Road and rail laid over a path keep it, as a sidewalk or a crossing, and a park planted on it keeps it
        [TestMethod]
        [DataRow(ToolName.Road)]
        [DataRow(ToolName.Rail)]
        [DataRow(ToolName.Park)]
        public void Tool_OverAPath_KeepsIt(ToolName tool)
        {
            GameMap map = new GameMap(120, 100);
            map.SetWalkway(50, 50, Ground.Walkway(1, 4, 7));

            Assert.AreEqual(Outcome.Ok, Apply(CityTools.Create(map)[tool], 50, 50, false));
            Assert.AreEqual(Ground.Walkway(1, 4, 7), map.GetWalkway(50, 50));
        }

        // A road laid over a footbridge on the river makes a bridge, which takes the footbridge, so it keeps it, and with
        // auto-bulldoze costs what the bridge does over water holding none: the bulldozer charges only where it clears
        [TestMethod]
        public void RoadTool_OverAFootbridgeOnTheRiver_KeepsItAtTheBridgesCost()
        {
            int footbridge = Walkways.With(0, 4, (int)WalkwayKind.Footbridge);
            long[] spent = new long[2];
            for (int i = 0; i < 2; i++)
            {
                GameMap map = new GameMap(120, 100);
                // A river running north to south, which the road crosses from west to east
                for (int y = 48; y <= 52; y++)
                {
                    map.SetTile(50, y, RIVER, 0);
                }

                map.SetTile(49, 50, ROADS, TileFlags.BULLBIT);
                map.SetWalkway(50, 50, i == 0 ? footbridge : 0);
                Budget budget = new Budget { TotalFunds = 1000 };

                Assert.AreEqual(Outcome.Ok, Apply(CityTools.Create(map)[ToolName.Road], 50, 50, true, budget));
                Assert.AreEqual((true, i == 0 ? footbridge : 0), (TileUtils.IsBridge(map.GetTileValue(50, 50)), map.GetWalkway(50, 50)));
                spent[i] = 1000 - budget.TotalFunds;
            }

            Assert.AreEqual(spent[1], spent[0]);
        }

        // A power line on its own takes no walkway, so laid over a path it needs the bulldozer, as a building does, and
        // leaves the path be; with auto-bulldoze it clears the path for the bulldozer's cost
        [TestMethod]
        [DataRow(false, Outcome.NeedsBulldoze)]
        [DataRow(true, Outcome.Ok)]
        public void WireTool_OverAPath_ClearsItOnlyWithAutoBulldoze(bool autoBulldoze, Outcome expected)
        {
            GameMap map = new GameMap(120, 100);
            map.SetWalkway(50, 50, Ground.Walkway(1, 4, 7));
            Budget budget = new Budget { TotalFunds = 1000 };

            Assert.AreEqual(expected, Apply(CityTools.Create(map)[ToolName.Wire], 50, 50, autoBulldoze, budget));

            Assert.AreEqual(autoBulldoze ? 0 : Ground.Walkway(1, 4, 7), map.GetWalkway(50, 50));
            Assert.AreEqual(autoBulldoze ? 1000 - ToolCosts.All[ToolName.Wire] - StagedTool.BulldozerCost : 1000, budget.TotalFunds);
        }

        // The bulldozer's first hit on a road with a sidewalk and a crossing clears every ninth of walkway on it, for the
        // bulldozer's cost, and leaves the road; its next hit takes the road back to bare land
        [TestMethod]
        public void BulldozerTool_RoadWithWalkway_ClearsTheWalkwayThenTheRoad()
        {
            GameMap map = new GameMap(120, 100);
            map.SetTile(50, 50, ROADS, TileFlags.BULLBIT);
            map.SetWalkway(50, 50, Ground.Walkway(0, 1, 2, 4, 7));
            CityTool bulldozer = CityTools.Create(map)[ToolName.Bulldozer];
            Budget budget = new Budget { TotalFunds = 100 };

            Assert.AreEqual(Outcome.Ok, Apply(bulldozer, 50, 50, false, budget));
            Assert.AreEqual((ROADS, 0, 100 - StagedTool.BulldozerCost), (map.GetTileValue(50, 50), map.GetWalkway(50, 50), budget.TotalFunds));

            Assert.AreEqual(Outcome.Ok, Apply(bulldozer, 50, 50, false, budget));
            Assert.AreEqual(DIRT, map.GetTileValue(50, 50));
        }

        // The map scan clears the walkway from a tile that has turned to rubble, and leaves it on bare land and road
        [TestMethod]
        [DataRow(RUBBLE, false)]
        [DataRow(DIRT, true)]
        [DataRow(ROADS, true)]
        public void MapScan_WalkwayOnATile_ClearsItWhereTheTileTakesNone(int tile, bool kept)
        {
            Simulation city = Simulation.NewCity(new GameMap(120, 100), 1, Level.Easy, Speed.Medium);
            city.Map.SetTile(50, 50, tile, TileFlags.BULLBIT);
            city.Map.SetWalkway(50, 50, Ground.Walkway(4));

            city.MapScanner.MapScan(50, 51, city.ConstructSimData());

            Assert.AreEqual(kept ? Ground.Walkway(4) : 0, city.Map.GetWalkway(50, 50));
            Assert.AreEqual(kept ? 1 : 0, city.Map.WalkwayUpkeep);
        }

        // A tile of road holding a path on ninth 0 and a footbridge on ninth 4 that has turned to bare land keeps the
        // path, which bare land takes, and loses the footbridge, which it doesn't
        [TestMethod]
        public void MapScan_KindsOnATileTurnedToBareLand_KeepsOnlyThoseItTakes()
        {
            Simulation city = Simulation.NewCity(new GameMap(120, 100), 1, Level.Easy, Speed.Medium);
            city.Map.SetTile(50, 50, DIRT, TileFlags.BULLBIT);
            city.Map.SetWalkway(50, 50, Walkways.With(Ground.Walkway(0), 4, (int)WalkwayKind.Footbridge));

            city.MapScanner.MapScan(50, 51, city.ConstructSimData());

            Assert.AreEqual((Ground.Walkway(0), 1L), (city.Map.GetWalkway(50, 50), city.Map.WalkwayUpkeep));
        }

        // Each three ninths of walkway cost the year what a tile of road does, at the level's multiplier, the easy
        // level's 0.7, rounding down: 30 ninths as 10 tiles of road, 31 as 10 too, 10 as 3 and 2 as none
        [TestMethod]
        [DataRow(30L, 7L)]
        [DataRow(31L, 7L)]
        [DataRow(10L, 2L)]
        [DataRow(2L, 0L)]
        public void CollectTax_Walkways_AddToTheTransportUpkeep(long ninths, long upkeep)
        {
            Budget budget = new Budget();

            budget.CollectTax(Level.Easy, new Census(), ninths);

            Assert.AreEqual(upkeep, budget.RoadMaintenanceBudget);
        }

        // A walkway command lays its path ninth by ninth, across a tile's edge, and the map counts the ninths
        [TestMethod]
        public void ApplyCommands_WalkwayCommand_LaysThePath()
        {
            Simulation city = Simulation.NewCity(new GameMap(120, 100), 1, Level.Easy, Speed.Medium);
            JsonNode? command = JsonNode.Parse("""{"type":"walkway","kind":"path","path":[{"x":5,"y":4},{"x":6,"y":4}]}""");

            CommandResult result = city.ApplyCommands([new ReceivedCommand("ada", command)]).Single();

            Assert.AreEqual(Outcome.Ok, result.Outcome);
            Assert.AreEqual((Ground.Walkway(5), Ground.Walkway(3)), (city.Map.GetWalkway(1, 1), city.Map.GetWalkway(2, 1)));
            Assert.AreEqual(2, city.Map.WalkwayUpkeep);
        }

        // A zone centred at (50, 50) with a path on (52, 50), a tile of its perimeter, has a way out where a ninth of it
        // lies along the tile's west side, facing the zone, as one with a road there does; not where the path keeps to
        // the tile's east side, nor once the tile has turned to rubble, which takes no walkway, though the map scan has
        // yet to clear it
        [TestMethod]
        [DataRow(new[] { 3 }, DIRT, true)]
        [DataRow(new[] { 2, 5, 8 }, DIRT, false)]
        [DataRow(new[] { 3 }, RUBBLE, false)]
        public void HasWayAtEdge_PathOnTheZonesPerimeter_IsAWayOutOnlyAlongItsEdge(int[] ninths, int tile, bool wayOut)
        {
            GameMap map = new GameMap(120, 100);
            map.PutZone(50, 50, RZB, 3);
            Traffic traffic = new Traffic(map, RandomStream.FromSeed(0), new Trips(() => 0));

            Assert.IsFalse(traffic.HasWayAtEdge(new Position(50, 50)));
            map.SetTile(52, 50, tile, TileFlags.BULLBIT);
            map.SetWalkway(52, 50, Ground.Walkway(ninths));
            Assert.AreEqual(wayOut, traffic.HasWayAtEdge(new Position(50, 50)));
        }

        private static Outcome Lay(WalkwayTool tool, int ninthX, int ninthY, Budget budget,
                                   WalkwayKind kind = WalkwayKind.Path)
        {
            tool.Lay(ninthX, ninthY, kind);
            tool.ModifyIfEnoughFunding(budget);
            return tool.Result;
        }
    }
}
