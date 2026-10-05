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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// A candidate fire station's reach, which the debug channel answers for the end-to-end runner, against what
    /// stations built with the game's tools come to.
    /// </summary>
    [TestClass]
    public sealed class EmergencyServicesTests
    {
        // Two stations, each powered by a coal plant against its east side, with its road on the first tile of its
        // perimeter: the first's in its own block of the fire station map, the second's in the block diagonal to its
        // own, where its cover is noted. They stand far enough apart that neither's cover reaches the other's targets,
        // as the reach of each treats it as the only station.
        private static readonly (Position Station, Position Road, Position Plant) InItsBlock = (new Position(12, 12), new Position(11, 10), new Position(15, 12));
        private static readonly (Position Station, Position Road, Position Plant) RoadInTheNextBlock = (new Position(64, 57), new Position(63, 55), new Position(67, 57));

        // Steps at fast speed enough for the power scan to reach the stations and the fire analysis to spread their
        // cover since, short of the year end
        private const int Steps = 600;

        // Steps at fast speed past the first year end, which sets what the fire department needs, so its funding can
        // then be cut
        private const int StepsPastTheYearEnd = 800;

        private static Simulation _funded = null!;
        private static Simulation _underfunded = null!;

        // Built once and only read after, which the reach leaves as it was
        [ClassInitialize]
        public static void BuildCities(TestContext _)
        {
            _funded = Built();
            Assert.AreEqual(Budget.MaxFireStationEffect, _funded.Budget.FireEffect, "the stations are fully funded");

            _underfunded = Built();
            Step(_underfunded, StepsPastTheYearEnd - Steps);
            Apply(_underfunded, new JsonObject { ["type"] = "setBudget", ["fire"] = 90, ["tax"] = _underfunded.Budget.CityTax });
            Step(_underfunded, Steps);
            Assert.IsLessThan(Budget.MaxFireStationEffect, _underfunded.Budget.FireEffect, "the stations are underfunded");
        }

        [TestMethod]
        [DataRow(12, 12, DisplayName = "the station's own tile")]
        [DataRow(23, 12, DisplayName = "the block beside the station's")]
        [DataRow(23, 20, DisplayName = "the block diagonal to the station's")]
        [DataRow(40, 12, DisplayName = "a block three away")]
        [DataRow(119, 99, DisplayName = "the far corner")]
        public void FireStationReach_StationWithItsRoadInItsBlock_IsTheCoverageMapAtTheTarget(int x, int y)
        {
            AssertTheCoverage(_funded, InItsBlock.Station, InItsBlock.Road, new Position(x, y));
        }

        [TestMethod]
        [DataRow(64, 57, DisplayName = "the station's own tile")]
        [DataRow(63, 55, DisplayName = "the road's tile")]
        [DataRow(55, 55, DisplayName = "the block beside the road's, away from the station")]
        [DataRow(72, 57, DisplayName = "the block beside the station's, away from the road")]
        public void FireStationReach_StationWithItsRoadInTheNextBlock_IsTheCoverageMapAtTheTarget(int x, int y)
        {
            AssertTheCoverage(_funded, RoadInTheNextBlock.Station, RoadInTheNextBlock.Road, new Position(x, y));
        }

        [TestMethod]
        [DataRow(12, 12, DisplayName = "the station's own tile")]
        [DataRow(23, 12, DisplayName = "the block beside the station's")]
        public void FireStationReach_UnderfundedStation_IsTheCoverageMapAtTheTarget(int x, int y)
        {
            AssertTheCoverage(_underfunded, InItsBlock.Station, InItsBlock.Road, new Position(x, y));
        }

        // Without that, a target far from the stations would agree with an answer of no cover at all
        [TestMethod]
        public void FireStationReach_StationsBuilt_CoverTheirRoadsTiles()
        {
            Assert.IsGreaterThan(0, _funded.BlockMaps.FireStationEffectMap.WorldGet(InItsBlock.Road.X, InItsBlock.Road.Y));
            Assert.IsGreaterThan(0, _funded.BlockMaps.FireStationEffectMap.WorldGet(RoadInTheNextBlock.Road.X, RoadInTheNextBlock.Road.Y));
        }

        [TestMethod]
        public void FireStationReach_AnyStation_LeavesTheCityAsItWas()
        {
            string before = _funded.Save().ToJsonString();

            EmergencyServices.FireStationReach(_funded.Map, _funded.Budget.FireEffect, new Position(60, 50), new Position(60, 50));

            Assert.AreEqual(before, _funded.Save().ToJsonString());
        }

        // Roads on a perimeter tile and on every one after it in the answer's order: the station finds the first, so the
        // answer's order is the order the station searches in
        [TestMethod]
        public void FireStationReach_EachTileOfThePerimeter_IsTheRoadTheStationFindsBeforeTheTilesAfterIt()
        {
            IReadOnlyList<RoadReach> perimeter = EmergencyServices.FireStationReach(new GameMap(120, 100), Budget.MaxFireStationEffect,
                InItsBlock.Station, InItsBlock.Station).Perimeter;

            Assert.HasCount(12, perimeter);
            for (int i = 0; i < perimeter.Count; i++)
            {
                GameMap map = new GameMap(120, 100);
                foreach (RoadReach tile in perimeter.Skip(i))
                {
                    map.SetTile(tile.X, tile.Y, TileValues.ROADS, TileFlags.NOFLAGS);
                }

                Position? found = new Traffic(map, RandomStream.FromSeed(0), new Trips(map))
                    .FindPerimeterRoad(InItsBlock.Station);

                Assert.AreEqual(new Position(perimeter[i].X, perimeter[i].Y), found, $"with roads from the perimeter's tile {i}");
            }
        }

        [TestMethod]
        public void FireStationReach_StationInTheCorner_HasOnlyThePerimeterOnTheMap()
        {
            IReadOnlyList<RoadReach> perimeter = EmergencyServices.FireStationReach(new GameMap(120, 100), Budget.MaxFireStationEffect,
                new Position(0, 1), new Position(0, 1)).Perimeter;

            CollectionAssert.AreEqual(new[] { (2, 0), (2, 1), (2, 2), (1, 3), (0, 3) }, perimeter.Select(tile => (tile.X, tile.Y)).ToArray());
        }

        // The reach of the station, asked of the city as it stands, has the station's own road where the station found
        // it, with the cover the city's coverage map has at the target
        private static void AssertTheCoverage(Simulation city, Position station, Position road, Position target)
        {
            Assert.AreEqual(road, city.TrafficManager.FindPerimeterRoad(station), "the station's road");
            Assert.IsTrue(city.Map.GetTile(station.X, station.Y).IsPowered(), "the station is powered");

            FireStationReach reach = EmergencyServices.FireStationReach(city.Map, city.Budget.FireEffect, station, target);

            RoadReach atTheRoad = reach.Perimeter.Single(tile => tile.X == road.X && tile.Y == road.Y);
            Assert.AreEqual(city.BlockMaps.FireStationEffectMap.WorldGet(target.X, target.Y), atTheRoad.Cover);
        }

        // Both stations, their roads and plants, through the game's tools, with disasters off so none strikes them, then
        // the steps
        private static Simulation Built()
        {
            Simulation city = Simulation.NewCity(new GameMap(120, 100), 1, Level.Easy, Speed.Fast);
            Apply(city, new JsonObject { ["type"] = "setDisasters", ["on"] = false });

            foreach ((Position station, Position road, Position plant) in new[] { InItsBlock, RoadInTheNextBlock })
            {
                Apply(city, Tool("fire", station));
                Apply(city, Tool("road", road));
                Apply(city, Tool("coal", plant));
            }

            Step(city, Steps);
            return city;
        }

        private static void Apply(Simulation city, JsonObject command)
        {
            CommandResult result = city.ApplyCommands([new ReceivedCommand("ada", command)]).Single();
            Assert.AreEqual(Outcome.Ok, result.Outcome, $"{command.ToJsonString()}: {result.Reason}");
        }

        private static void Step(Simulation city, int steps)
        {
            for (int i = 0; i < steps; i++)
            {
                city.Step();
            }
        }

        private static JsonObject Tool(string tool, Position at)
        {
            return new JsonObject
            {
                ["type"] = "tool",
                ["tool"] = tool,
                ["path"] = new JsonArray(new JsonObject { ["x"] = at.X, ["y"] = at.Y }),
                ["autoBulldoze"] = true,
            };
        }
    }
}
