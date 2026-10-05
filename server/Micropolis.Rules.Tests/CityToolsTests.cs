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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The tools' rules that no fixture's city reaches: the fixtures' logs and <c>conformance/commands.json</c> prove
    /// the rest.
    /// </summary>
    [TestClass]
    public sealed class CityToolsTests
    {
        [TestMethod]
        public void Create_EveryToolName_HasATool()
        {
            IReadOnlyDictionary<ToolName, CityTool> tools = CityTools.Create(new GameMap(120, 100));

            CollectionAssert.AreEquivalent(Enum.GetValues<ToolName>(), tools.Keys.ToArray());
        }

        // As checkBorder in the original: a wire that ends beside the residential zone on (51, 49) to (53, 51) turns
        // into it, since a building conducts. The wire's tiles are laid in order, as a drag lays them, and it ends at
        // the last.
        [TestMethod]
        [DataRow("above", new[] { 49, 50, 51 }, new[] { 48, 48, 48 }, TileValues.LHPOWER, TileValues.LVPOWER4)]
        [DataRow("left of", new[] { 50, 50, 50 }, new[] { 47, 48, 49 }, TileValues.LVPOWER, TileValues.LVPOWER2)]
        [DataRow("below", new[] { 49, 50, 51 }, new[] { 52, 52, 52 }, TileValues.LHPOWER, TileValues.LVPOWER5)]
        [DataRow("right of", new[] { 54, 54, 54 }, new[] { 47, 48, 49 }, TileValues.LVPOWER, TileValues.LVPOWER5)]
        public void BuildingTool_WireEndingBesideTheSite_TurnsIntoTheBuilding(string side, int[] xs, int[] ys, int before, int after)
        {
            GameMap map = new GameMap(120, 100);
            IReadOnlyDictionary<ToolName, CityTool> tools = CityTools.Create(map);

            for (int i = 0; i < xs.Length; i++)
            {
                Apply(tools[ToolName.Wire], xs[i], ys[i], false);
            }

            int endX = xs[^1];
            int endY = ys[^1];
            Assert.AreEqual(before, map.GetTileValue(endX, endY), side);

            Assert.AreEqual(Outcome.Ok, Apply(tools[ToolName.Residential], 52, 50, false), side);
            Assert.AreEqual(after, map.GetTileValue(endX, endY), side);
        }

        // Dozing costs 1, and water 5 more where the doze changes the tile; the road beside is fixed to run across
        [TestMethod]
        public void BulldozerTool_RiverEdge_CostsSixAndFixesTheRoadBeside()
        {
            GameMap map = new GameMap(120, 100);
            map.SetTile(51, 50, TileValues.REDGE, TileFlags.BULLBIT);
            map.SetTile(50, 50, TileValues.ROADS2, TileFlags.BLBNBIT);
            Budget budget = new Budget { TotalFunds = 100 };

            Assert.AreEqual(Outcome.Ok, Apply(CityTools.Create(map)[ToolName.Bulldozer], 51, 50, false, budget));
            Assert.AreEqual(100 - (1 + 5), budget.TotalFunds);
            Assert.AreEqual(TileValues.DIRT, map.GetTileValue(51, 50));
            Assert.AreEqual(TileValues.ROADS, map.GetTileValue(50, 50));
        }

        // What the bulldozer stages around a river it can't doze is dropped with the rest
        [TestMethod]
        public void BulldozerTool_PlainRiver_FailsAndChangesNothing()
        {
            GameMap map = new GameMap(120, 100);
            map.SetTile(51, 50, TileValues.RIVER, TileFlags.NOFLAGS);
            map.SetTile(50, 50, TileValues.ROADS2, TileFlags.BLBNBIT);

            Assert.AreEqual(Outcome.Failed, Apply(CityTools.Create(map)[ToolName.Bulldozer], 51, 50, false));
            Assert.AreEqual(TileValues.RIVER, map.GetTile(51, 50).GetRawValue());
            Assert.AreEqual(TileValues.ROADS2 | TileFlags.BLBNBIT, map.GetTile(50, 50).GetRawValue());
        }

        // As putDownPark in the original, which compares the tile with its flags to plain dirt
        [TestMethod]
        public void ParkTool_DirtWithFlags_NeedsTheBulldozer()
        {
            GameMap map = new GameMap(120, 100);
            map.SetTile(10, 10, TileValues.DIRT, TileFlags.BULLBIT);

            Assert.AreEqual(Outcome.NeedsBulldoze, Apply(CityTools.Create(map)[ToolName.Park], 10, 10, false));
            Assert.AreEqual(TileValues.DIRT | TileFlags.BULLBIT, map.GetTile(10, 10).GetRawValue());
        }

        [TestMethod]
        [DataRow(1, 1)]
        [DataRow(118, 1)]
        [DataRow(1, 98)]
        [DataRow(118, 98)]
        public void BuildingTool_InTheCorner_BuildsWithoutReadingOffTheMap(int x, int y)
        {
            GameMap map = new GameMap(120, 100);

            Assert.AreEqual(Outcome.Ok, Apply(CityTools.Create(map)[ToolName.Residential], x, y, false));
            Assert.AreEqual(TileValues.FREEZ, map.GetTileValue(x, y));
        }

        private static Outcome Apply(CityTool tool, int x, int y, bool autoBulldoze, Budget? budget = null)
        {
            tool.DoTool(x, y, RandomStream.SimulationStream(0), autoBulldoze);
            tool.ModifyIfEnoughFunding(budget ?? new Budget { TotalFunds = 20000 });
            return tool.Result;
        }
    }
}
