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
        public void All_NewCities_FollowTheFixturesAtEachRunningSpeed()
        {
            IReadOnlyList<BenchmarkCase> cases = BenchmarkCases.All();

            CollectionAssert.AreEqual(
                new BenchmarkCase[]
                {
                    new NewCityCase(0, Level.Easy, Speed.Slow),
                    new NewCityCase(0, Level.Easy, Speed.Medium),
                    new NewCityCase(0, Level.Easy, Speed.Fast),
                },
                cases.TakeLast(3).ToList());
            Assert.AreEqual(cases.Count - 3, cases.OfType<FixtureCase>().Count());
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
