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
    /// The station tool, and how the other tools meet a station: it goes only on a straight piece of rail, the rail
    /// beside it joins it only along its track, nothing is laid over it, and the bulldozer leaves the track it stood on.
    /// </summary>
    [TestClass]
    public sealed class StationToolTests
    {
        // Rail laid along row 50 or down column 50 through (50, 50), where the station goes, for $500
        [TestMethod]
        [DataRow(true, HRAILSTATION)]
        [DataRow(false, VRAILSTATION)]
        public void StationTool_StraightRail_PutsTheStationOfItsWay(bool across, int station)
        {
            GameMap map = new GameMap(120, 100);
            IReadOnlyDictionary<ToolName, CityTool> tools = CityTools.Create(map);
            LayRail(tools, across ? Row(50, 48, 52) : Column(50, 48, 52));
            Budget budget = new Budget { TotalFunds = 20000 };

            Assert.AreEqual(Outcome.Ok, Apply(tools[ToolName.Station], 50, 50, budget: budget));

            Assert.AreEqual(station | TileFlags.BLBNBIT, map.GetTile(50, 50).GetRawValue());
            Assert.AreEqual(20000 - 500, budget.TotalFunds);
            int straight = across ? LHRAIL : LVRAIL;
            Assert.AreEqual((straight, straight), across ? (map.GetTileValue(49, 50), map.GetTileValue(51, 50))
                                                         : (map.GetTileValue(50, 49), map.GetTileValue(50, 51)));
        }

        // Anything but a straight piece of rail takes no station: a curve, a junction, a crossing of road or a power
        // line, a bridge, a station, road or bare land. The map and funds are left as they were.
        [TestMethod]
        [DataRow(DIRT)]
        [DataRow(LVRAIL2)]
        [DataRow(LVRAIL6)]
        [DataRow(LVRAIL10)]
        [DataRow(HRAILROAD)]
        [DataRow(VRAILROAD)]
        [DataRow(RAILHPOWERV)]
        [DataRow(RAILVPOWERH)]
        [DataRow(HRAIL)]
        [DataRow(VRAIL)]
        [DataRow(HRAILSTATION)]
        [DataRow(ROADS)]
        public void StationTool_NoStraightRail_Fails(int tile)
        {
            GameMap map = new GameMap(120, 100);
            map.SetTile(50, 50, tile, TileFlags.BLBNBIT);
            Budget budget = new Budget { TotalFunds = 20000 };

            Assert.AreEqual(Outcome.Failed, Apply(CityTools.Create(map)[ToolName.Station], 50, 50, budget: budget));

            Assert.AreEqual(tile | TileFlags.BLBNBIT, map.GetTile(50, 50).GetRawValue());
            Assert.AreEqual(20000, budget.TotalFunds);
        }

        // Straight rail along row 50, and a curve at (50, 49) above it, set down from the east into the rail: a station
        // on (50, 50) joins nothing above it, so the curve turns straight, leading only east
        [TestMethod]
        public void StationTool_CurveLeadingIntoItsSide_TurnsTheCurveStraight()
        {
            GameMap map = new GameMap(120, 100);
            IReadOnlyDictionary<ToolName, CityTool> tools = CityTools.Create(map);
            LayRail(tools, Row(50, 48, 52));
            map.SetTile(50, 49, LVRAIL3, TileFlags.BLBNBIT);
            map.SetTile(51, 49, LHRAIL, TileFlags.BLBNBIT);

            Assert.AreEqual(Outcome.Ok, Apply(tools[ToolName.Station], 50, 50));

            Assert.AreEqual(LHRAIL, map.GetTileValue(50, 49));
        }

        // Rail laid along row 49 from the west, ending above a station at (50, 50): it turns down into a station whose
        // track runs north and south, and runs on past one whose track runs east and west
        [TestMethod]
        [DataRow(true, LHRAIL)]
        [DataRow(false, LVRAIL4)]
        public void RailTool_EndingBesideAStation_JoinsItOnlyAlongItsTrack(bool across, int end)
        {
            GameMap map = new GameMap(120, 100);
            IReadOnlyDictionary<ToolName, CityTool> tools = CityTools.Create(map);
            map.SetTile(50, 50, across ? HRAILSTATION : VRAILSTATION, TileFlags.BLBNBIT);

            LayRail(tools, Row(49, 47, 50));

            Assert.AreEqual(end, map.GetTileValue(50, 49));
        }

        // Rail laid on the river beside a station leads on from it as a tunnel, along the station's track: east of one
        // whose track runs east and west, below one whose track runs north and south
        [TestMethod]
        [DataRow(true, 51, 50, HRAIL)]
        [DataRow(false, 50, 51, VRAIL)]
        public void RailTool_OnTheRiverAlongAStationsTrack_LaysATunnel(bool across, int x, int y, int tunnel)
        {
            GameMap map = new GameMap(120, 100);
            map.SetTile(50, 50, across ? HRAILSTATION : VRAILSTATION, TileFlags.BLBNBIT);
            map.SetTile(x, y, RIVER, 0);

            Assert.AreEqual(Outcome.Ok, Apply(CityTools.Create(map)[ToolName.Rail], x, y));

            Assert.AreEqual(tunnel, map.GetTileValue(x, y));
        }

        // Neither road, rail nor a power line is laid over a station, auto-bulldoze or not
        [TestMethod]
        [DataRow(ToolName.Road, false)]
        [DataRow(ToolName.Road, true)]
        [DataRow(ToolName.Rail, true)]
        [DataRow(ToolName.Wire, true)]
        public void LayingTool_OnAStation_Fails(ToolName tool, bool autoBulldoze)
        {
            GameMap map = new GameMap(120, 100);
            map.SetTile(50, 50, HRAILSTATION, TileFlags.BLBNBIT);

            Assert.AreEqual(Outcome.Failed, Apply(CityTools.Create(map)[tool], 50, 50, autoBulldoze));
            Assert.AreEqual(HRAILSTATION | TileFlags.BLBNBIT, map.GetTile(50, 50).GetRawValue());
        }

        // The bulldozer takes a station back to the straight rail it stood on, for its $1
        [TestMethod]
        [DataRow(true, LHRAIL)]
        [DataRow(false, LVRAIL)]
        public void BulldozerTool_Station_LeavesTheTrack(bool across, int straight)
        {
            GameMap map = new GameMap(120, 100);
            IReadOnlyDictionary<ToolName, CityTool> tools = CityTools.Create(map);
            LayRail(tools, across ? Row(50, 48, 52) : Column(50, 48, 52));
            Apply(tools[ToolName.Station], 50, 50);
            Budget budget = new Budget { TotalFunds = 100 };

            Assert.AreEqual(Outcome.Ok, Apply(tools[ToolName.Bulldozer], 50, 50, budget: budget));

            Assert.AreEqual(straight | TileFlags.BLBNBIT, map.GetTile(50, 50).GetRawValue());
            Assert.AreEqual(100 - 1, budget.TotalFunds);
        }

        // A station on a line along row 50, and rail at (50, 49) above it, which the station never joined: the track the
        // bulldozer leaves joins it, a junction leading north, east and west, and the rail above turns down into it
        [TestMethod]
        public void BulldozerTool_StationWithRailAtItsSide_LeavesTrackJoiningIt()
        {
            GameMap map = new GameMap(120, 100);
            IReadOnlyDictionary<ToolName, CityTool> tools = CityTools.Create(map);
            LayRail(tools, Row(50, 48, 52));
            Apply(tools[ToolName.Station], 50, 50);
            LayRail(tools, [new Position(50, 49)]);
            Assert.AreEqual((HRAILSTATION, LHRAIL), (map.GetTileValue(50, 50), map.GetTileValue(50, 49)));

            Assert.AreEqual(Outcome.Ok, Apply(tools[ToolName.Bulldozer], 50, 50));

            Assert.AreEqual((LVRAIL6, LVRAIL), (map.GetTileValue(50, 50), map.GetTileValue(50, 49)));
        }

        private static void LayRail(IReadOnlyDictionary<ToolName, CityTool> tools, List<Position> tiles)
        {
            foreach (Position tile in tiles)
            {
                Assert.AreEqual(Outcome.Ok, Apply(tools[ToolName.Rail], tile.X, tile.Y));
            }
        }
    }
}
