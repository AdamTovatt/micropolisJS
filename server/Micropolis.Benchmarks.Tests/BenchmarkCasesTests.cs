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
using Micropolis.Conformance;
using Micropolis.Rules;

namespace Micropolis.Benchmarks.Tests
{
    [TestClass]
    public sealed class BenchmarkCasesTests
    {
        [TestMethod]
        public void All_Fixtures_AreEveryRunSaveInNameOrder()
        {
            List<string> runSaves = Directory.GetFiles(ConformanceDirectories.Committed.Saves, "*.run.json")
                .Select(path => Path.GetFileName(path)[..^".run.json".Length])
                .Order(StringComparer.Ordinal)
                .ToList();

            List<FixtureCase> fixtures = BenchmarkCases.All().OfType<FixtureCase>().ToList();

            CollectionAssert.AreEqual(runSaves, fixtures.Select(fixture => fixture.Name).ToList());
            CollectionAssert.AreEqual(runSaves.Select(name => $"{name}.run").ToList(), fixtures.Select(fixture => fixture.Save.Name).ToList());
        }

        [TestMethod]
        public void All_Fixtures_RunAtTheirSavedSpeed()
        {
            foreach (FixtureCase fixture in BenchmarkCases.All().OfType<FixtureCase>())
            {
                JsonNode save = JsonNode.Parse(fixture.Save.ReadCommitted())!;

                Assert.AreEqual((int)save["simulation"]!["speed"]!, (int)fixture.Speed, fixture.Name);
            }
        }

        [TestMethod]
        public void All_NewCitiesAtEachRunningSpeedThenTheZonedMap_FollowTheFixtures()
        {
            IReadOnlyList<BenchmarkCase> cases = BenchmarkCases.All();

            CollectionAssert.AreEqual(
                new BenchmarkCase[]
                {
                    new NewCityCase(0, Level.Easy, Speed.Slow),
                    new NewCityCase(0, Level.Easy, Speed.Medium),
                    new NewCityCase(0, Level.Easy, Speed.Fast),
                    new ZonedMapCase(Speed.Fast),
                },
                cases.TakeLast(4).ToList());
            Assert.AreEqual(cases.Count - 4, cases.OfType<FixtureCase>().Count());
        }

        [TestMethod]
        public void SettingsFor_ZonedMap_RunsNoMoreThanItsOwnStepsOrTheSettings()
        {
            ZonedMapCase zoned = new ZonedMapCase(Speed.Fast);

            Assert.AreEqual(BenchmarkSettings.Default with { Warmup = ZonedMapCase.MostWarmup, Steps = ZonedMapCase.MostSteps },
                            zoned.SettingsFor(BenchmarkSettings.Default));
            Assert.AreEqual(new BenchmarkSettings(16, 32, 1), zoned.SettingsFor(new BenchmarkSettings(16, 32, 1)));
        }

        [TestMethod]
        public void SettingsFor_OtherCases_AreTheSettings()
        {
            Assert.AreEqual(BenchmarkSettings.Default, new NewCityCase(0, Level.Easy, Speed.Fast).SettingsFor(BenchmarkSettings.Default));
            Assert.AreEqual(BenchmarkSettings.Default, new FixtureCase("suburb", Speed.Medium, false).SettingsFor(BenchmarkSettings.Default));
        }

        // Every lot, the three tiles each way after a road, holds a zone or a plant, and once the first cycle's power scan
        // has run, the plants power every zone
        [TestMethod]
        public void Start_ZonedMap_IsBuiltUpAndPoweredFromEdgeToEdge()
        {
            Simulation city = new ZonedMapCase(Speed.Fast).Start();
            for (int step = 0; step < 16; step++)
            {
                city.Step();
            }

            int lotsAcross = city.Map.Width / 4;
            int lotsDown = city.Map.Height / 4;
            List<Tile> centres = Enumerable.Range(0, lotsDown)
                .SelectMany(row => Enumerable.Range(0, lotsAcross).Select(column => city.Map.GetTile(4 * column + 2, 4 * row + 2)))
                .ToList();

            Assert.IsTrue(centres.All(centre => centre.IsZone()));
            Assert.AreEqual(12, ZonedMapCase.PlantLots.Count);
            Assert.AreEqual(ZonedMapCase.PlantLots.Count, centres.Count(centre => centre.GetValue() == TileValues.NUCLEAR));
            Assert.AreEqual(0, centres.Count(centre => !centre.IsPowered()));
        }

        [TestMethod]
        public void Of_Fixtures_RunWithDisastersOnWhenMadeForThem()
        {
            List<FixtureCase> fixtures = BenchmarkCases.Of([Fixtures.Named("suburb"), Fixtures.Named("forestFire"), Fixtures.Named("disasters")])
                .OfType<FixtureCase>().ToList();

            CollectionAssert.AreEqual(
                new[] { new FixtureCase("disasters", Speed.Medium, true), new FixtureCase("forestFire", Speed.Medium, true),
                        new FixtureCase("suburb", Speed.Medium, false) },
                fixtures);
        }

        [TestMethod]
        public void Start_Fixture_SetsTheDisastersGiven()
        {
            Simulation city = new FixtureCase("suburb", Speed.Medium, true).Start();

            Assert.IsTrue(city.DisasterManager.DisastersEnabled);
        }

        [TestMethod]
        public void Start_Fixture_IsTheSavedCityOtherwise()
        {
            FixtureCase fixture = new FixtureCase("suburb", Speed.Medium, false);
            string saved = fixture.Save.ReadCommitted();

            Assert.AreEqual(saved, CanonicalJson.Write(fixture.Start().Save()));
        }

        [TestMethod]
        public void Start_FixtureAtAnotherSpeed_FailsNamingBoth()
        {
            InvalidDataException exception = Assert.ThrowsExactly<InvalidDataException>(
                () => new FixtureCase("suburb", Speed.Fast, false).Start());

            StringAssert.Contains(exception.Message, "saved at Medium, but its case runs it at Fast");
        }
    }
}
