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
    /// The erasers a player applies holding Shift with a tool, each taking off a tile only what its tool puts down, at
    /// the bulldozer's cost, and the erasing of walkway ninth by ninth.
    /// </summary>
    [TestClass]
    public sealed class EraserTests
    {
        private const long Funds = 1000;

        // A line's eraser takes the line alone off a tile: bare land for the line on its own, a road with traffic on it
        // among them, the other line where it crossed one, with the flags that line is laid with, and water for the line
        // crossing it, a bridge, a drawbridge's piece open or closed, a tunnel or a line under water, before the
        // connections round it are fixed
        [TestMethod]
        [DataRow(ToolName.Road, ROADS, DIRT, TileFlags.NOFLAGS)]
        [DataRow(ToolName.Road, HTRFBASE + 2, DIRT, TileFlags.NOFLAGS)]
        [DataRow(ToolName.Road, HROADPOWER, LVPOWER, TileFlags.BLBNCNBIT)]
        [DataRow(ToolName.Road, VROADPOWER, LHPOWER, TileFlags.BLBNCNBIT)]
        [DataRow(ToolName.Road, HRAILROAD, LHRAIL, TileFlags.BLBNBIT)]
        [DataRow(ToolName.Road, VRAILROAD, LVRAIL, TileFlags.BLBNBIT)]
        [DataRow(ToolName.Road, HBRIDGE, RIVER, TileFlags.NOFLAGS)]
        [DataRow(ToolName.Road, VBRIDGE, RIVER, TileFlags.NOFLAGS)]
        [DataRow(ToolName.Road, BRWH, RIVER, TileFlags.NOFLAGS)]
        [DataRow(ToolName.Road, BRWV, RIVER, TileFlags.NOFLAGS)]
        [DataRow(ToolName.Road, HBRDG0, RIVER, TileFlags.NOFLAGS)]
        [DataRow(ToolName.Road, HBRDG3, RIVER, TileFlags.NOFLAGS)]
        [DataRow(ToolName.Road, VBRDG0, RIVER, TileFlags.NOFLAGS)]
        [DataRow(ToolName.Road, VBRDG3, RIVER, TileFlags.NOFLAGS)]
        [DataRow(ToolName.Rail, LHRAIL, DIRT, TileFlags.NOFLAGS)]
        [DataRow(ToolName.Rail, VRAILROAD, ROADS, TileFlags.BLBNBIT)]
        [DataRow(ToolName.Rail, HRAILROAD, ROADS2, TileFlags.BLBNBIT)]
        [DataRow(ToolName.Rail, RAILHPOWERV, LVPOWER, TileFlags.BLBNCNBIT)]
        [DataRow(ToolName.Rail, HRAIL, RIVER, TileFlags.NOFLAGS)]
        [DataRow(ToolName.Rail, VRAIL, RIVER, TileFlags.NOFLAGS)]
        [DataRow(ToolName.Wire, LHPOWER, DIRT, TileFlags.NOFLAGS)]
        [DataRow(ToolName.Wire, HROADPOWER, ROADS, TileFlags.BLBNBIT)]
        [DataRow(ToolName.Wire, RAILVPOWERH, LVRAIL, TileFlags.BLBNBIT)]
        [DataRow(ToolName.Wire, HPOWER, RIVER, TileFlags.NOFLAGS)]
        [DataRow(ToolName.Wire, VPOWER, RIVER, TileFlags.NOFLAGS)]
        public void PieceLeft_LineOnATile_IsTheRestOfIt(ToolName tool, int before, int after, int flags)
        {
            IErasedTile line = (IErasedTile)CityTools.Create(new GameMap(10, 10))[tool];

            Assert.AreEqual(new Piece(after, flags), line.PieceLeft(before));
        }

        // A power line crossing a road north to south, with power lines above and below it: the road's eraser leaves the
        // line north to south, joined to them and conducting, for the bulldozer's cost
        [TestMethod]
        public void Erase_RoadCrossingAPowerLine_LeavesTheLineJoined()
        {
            GameMap map = new GameMap(120, 100);
            CityTool wire = CityTools.Create(map)[ToolName.Wire];
            foreach (Position tile in Column(50, 49, 51))
            {
                Apply(wire, tile.X, tile.Y);
            }
            Apply(CityTools.Create(map)[ToolName.Road], 50, 50, autoBulldoze: false);
            Assert.AreEqual(HROADPOWER, map.GetTileValue(50, 50));
            Budget budget = new Budget { TotalFunds = Funds };

            Assert.AreEqual(Outcome.Ok, Erase(map, ToolName.Road, 50, 50, budget));

            Assert.AreEqual((LVPOWER | TileFlags.BLBNCNBIT, Funds - StagedTool.BulldozerCost),
                            (map.GetTile(50, 50).GetRawValue(), budget.TotalFunds));
        }

        // A line's eraser on a tile that carries none of its line fails and charges nothing: road's on rail, rail's on a
        // station, which is the station tool's, and wire's on bare land
        [TestMethod]
        [DataRow(ToolName.Road, LHRAIL)]
        [DataRow(ToolName.Rail, HRAILSTATION)]
        [DataRow(ToolName.Wire, DIRT)]
        [DataRow(ToolName.Park, WOODS)]
        [DataRow(ToolName.Station, LHRAIL)]
        public void Erase_TileHoldingNoneOfTheKind_Fails(ToolName tool, int tile)
        {
            GameMap map = new GameMap(120, 100);
            map.SetTile(50, 50, tile, TileFlags.BLBNBIT);
            Budget budget = new Budget { TotalFunds = Funds };

            Assert.AreEqual(Outcome.Failed, Erase(map, tool, 50, 50, budget));

            Assert.AreEqual((tile, Funds), (map.GetTileValue(50, 50), budget.TotalFunds));
        }

        // A road's eraser leaves the sidewalk on the bare land it makes, which takes walkway, but takes a bridge's walkway
        // off with the bridge, the water under it taking none, at the bulldozer's cost again
        [TestMethod]
        [DataRow(ROADS, true)]
        [DataRow(HBRIDGE, false)]
        public void Erase_RoadWithWalkway_KeepsItWhereTheTileLeftTakesOne(int road, bool kept)
        {
            GameMap map = new GameMap(120, 100);
            map.SetTile(50, 50, road, TileFlags.BULLBIT);
            map.SetWalkway(50, 50, Ground.Walkway(0, 1, 2));
            Budget budget = new Budget { TotalFunds = Funds };

            Assert.AreEqual(Outcome.Ok, Erase(map, ToolName.Road, 50, 50, budget));

            Assert.AreEqual(kept ? Ground.Walkway(0, 1, 2) : 0, map.GetWalkway(50, 50));
            Assert.AreEqual(Funds - (kept ? 1 : 2) * StagedTool.BulldozerCost, budget.TotalFunds);
        }

        // A road's eraser on the east arm of a crossroads leaves the rest joined as a T, the roads round it fixed
        [TestMethod]
        public void Erase_ArmOfACrossroads_FixesTheRoadsRoundIt()
        {
            GameMap map = new GameMap(120, 100);
            CityTool road = CityTools.Create(map)[ToolName.Road];
            foreach (Position tile in Row(50, 49, 51).Concat(Column(50, 49, 51)))
            {
                Apply(road, tile.X, tile.Y);
            }
            Assert.AreEqual(INTERSECTION, map.GetTileValue(50, 50));

            Assert.AreEqual(Outcome.Ok, Erase(map, ToolName.Road, 51, 50, new Budget { TotalFunds = Funds }));

            Assert.AreEqual((DIRT, ROADS10), (map.GetTileValue(51, 50), map.GetTileValue(50, 50)));
        }

        // A zone's or building's eraser blows up the one under the tile, from any of its tiles, when it is of the
        // tool's kind, for the bulldozer's cost; on another kind it fails
        [TestMethod]
        [DataRow(ToolName.Residential, ToolName.Residential, true)]
        [DataRow(ToolName.Residential, ToolName.Commercial, false)]
        [DataRow(ToolName.Commercial, ToolName.Commercial, true)]
        [DataRow(ToolName.Industrial, ToolName.Industrial, true)]
        [DataRow(ToolName.Industrial, ToolName.Residential, false)]
        [DataRow(ToolName.Coal, ToolName.Coal, true)]
        [DataRow(ToolName.Airport, ToolName.Airport, true)]
        [DataRow(ToolName.Stadium, ToolName.Stadium, true)]
        [DataRow(ToolName.Stadium, ToolName.Nuclear, false)]
        public void Erase_BuildingUnderTheTile_BlowsItUpOnlyOfTheToolsKind(ToolName built, ToolName erased, bool blownUp)
        {
            GameMap map = new GameMap(120, 100);
            int size = CityTools.Sizes[built];
            Assert.AreEqual(Outcome.Ok, Apply(CityTools.Create(map)[built], 50, 50));
            Budget budget = new Budget { TotalFunds = Funds };
            // A building's centre is one tile in from its top left, so its top left is (49, 49) and its bottom right
            // tile, which the eraser is applied at, size - 1 on from there
            int corner = 50 - 1 + size - 1;

            Assert.AreEqual(blownUp ? Outcome.Ok : Outcome.Failed, Erase(map, erased, corner, corner, budget));

            IEnumerable<int> footprint = Enumerable.Range(49, size).SelectMany(y => Enumerable.Range(49, size).Select(x => map.GetTileValue(x, y)));
            Assert.AreEqual(blownUp, footprint.All(TileUtils.IsManualExplosion));
            Assert.AreEqual(blownUp ? Funds - StagedTool.BulldozerCost : Funds, budget.TotalFunds);
        }

        // What a zone or building became after its tool put it down is still that tool's to erase: a residential zone
        // whose homes have grown, or that became a hospital, and a stadium full for a game
        [TestMethod]
        [DataRow(ToolName.Residential, RZB + 9, 3)]
        [DataRow(ToolName.Residential, HOSPITAL, 3)]
        [DataRow(ToolName.Stadium, FULLSTADIUM, 4)]
        public void Erase_ZoneChangedSinceItWasPutDown_BlowsItUp(ToolName tool, int centre, int size)
        {
            GameMap map = new GameMap(120, 100);
            map.PutZone(50, 50, centre, size);

            Assert.AreEqual(Outcome.Ok, Erase(map, tool, 50, 50, new Budget { TotalFunds = Funds }));

            Assert.IsTrue(TileUtils.IsManualExplosion(map.GetTileValue(50, 50)));
        }

        // A park's eraser leaves bare land, which keeps the path on it, and a station's the track it stood on
        [TestMethod]
        [DataRow(ToolName.Park, WOODS3, DIRT)]
        [DataRow(ToolName.Park, FOUNTAIN, DIRT)]
        [DataRow(ToolName.Station, HRAILSTATION, LHRAIL)]
        public void Erase_ParkOrStation_LeavesWhatItWasPutDownOn(ToolName tool, int before, int after)
        {
            GameMap map = new GameMap(120, 100);
            map.SetTile(50, 50, before, TileFlags.BLBNBIT);
            map.SetWalkway(50, 50, Ground.Walkway(4));

            Assert.AreEqual(Outcome.Ok, Erase(map, tool, 50, 50, new Budget { TotalFunds = Funds }));

            Assert.AreEqual((after, Ground.Walkway(4)), (map.GetTileValue(50, 50), map.GetWalkway(50, 50)));
        }

        // Every tool but the bulldozer has an eraser
        [TestMethod]
        public void Erasers_EveryToolButTheBulldozer_HasOne()
        {
            GameMap map = new GameMap(10, 10);

            CollectionAssert.AreEquivalent(Enum.GetValues<ToolName>().Where(tool => tool != ToolName.Bulldozer).ToList(),
                                           CityTools.Erasers(map, CityTools.Create(map)).Keys.ToList());
        }

        // An erase command erases along its path, the wire's here taking the power line off both its tiles, each for the
        // bulldozer's cost
        [TestMethod]
        public void ApplyCommands_EraseCommand_ErasesAlongItsPath()
        {
            Simulation city = Simulation.NewCity(new GameMap(120, 100), 1, Level.Easy, Speed.Medium);
            city.Map.SetTile(5, 5, LHPOWER, TileFlags.BLBNCNBIT);
            city.Map.SetTile(6, 5, LHPOWER, TileFlags.BLBNCNBIT);
            long funds = city.Budget.TotalFunds;

            IReadOnlyList<CommandResult> results = city.ApplyCommands(
            [
                new ReceivedCommand("ada", JsonNode.Parse("""{"type":"erase","tool":"wire","path":[{"x":5,"y":5},{"x":6,"y":5}]}""")),
            ]);

            Assert.AreEqual(Outcome.Ok, results[0].Outcome);
            Assert.AreEqual((DIRT, DIRT), (city.Map.GetTileValue(5, 5), city.Map.GetTileValue(6, 5)));
            Assert.AreEqual(funds - 2 * StagedTool.BulldozerCost, city.Budget.TotalFunds);
        }

        // The eraseWalkway command erases walkway along a path of ninths, each for the bulldozer's cost, failing where a
        // ninth holds none but going on along the rest. Ninths (3, 4), (4, 4) and (5, 4) of the grid of ninths are
        // ninths 3, 4 and 5 of tile (1, 1), the middle row's, of which the tile holds walkway on 3 and 4 alone.
        [TestMethod]
        public void ApplyCommands_EraseWalkwayCommand_ErasesTheNinthsAlongItsPath()
        {
            Simulation city = Simulation.NewCity(new GameMap(120, 100), 1, Level.Easy, Speed.Medium);
            city.Map.SetWalkway(1, 1, Ground.Walkway(3, 4));
            long funds = city.Budget.TotalFunds;

            IReadOnlyList<CommandResult> results = city.ApplyCommands(
            [
                new ReceivedCommand("ada", JsonNode.Parse("""{"type":"eraseWalkway","path":[{"x":3,"y":4},{"x":4,"y":4},{"x":5,"y":4}]}""")),
            ]);

            Assert.AreEqual(Outcome.Failed, results[0].Outcome);
            Assert.AreEqual(0, city.Map.GetWalkway(1, 1));
            Assert.AreEqual(funds - 2 * StagedTool.BulldozerCost, city.Budget.TotalFunds);
        }

        private static Outcome Erase(GameMap map, ToolName tool, int x, int y, Budget budget)
        {
            CityTool eraser = CityTools.Erasers(map, CityTools.Create(map))[tool];
            return Apply(eraser, x, y, autoBulldoze: true, budget);
        }
    }
}
