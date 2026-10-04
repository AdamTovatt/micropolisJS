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

using System.Text.Json.Nodes;
using Micropolis.Rules;

namespace Micropolis.Benchmarks.Tests
{
    [TestClass]
    public sealed class BenchmarkCasesTests
    {
        private static readonly IReadOnlyDictionary<string, string> NoneNotRun = new Dictionary<string, string>();

        [TestMethod]
        public void All_Fixtures_AreEveryRunSaveButThoseNotRunInNameOrder()
        {
            List<string> runSaves = Directory.GetFiles(Path.Combine(RepositoryFiles.Root, "conformance", "saves"), "*.run.json")
                .Select(path => Path.GetFileName(path)[..^".run.json".Length])
                .Where(name => !BenchmarkCases.NotRun.ContainsKey(name))
                .Order(StringComparer.Ordinal)
                .ToList();

            List<FixtureCase> fixtures = BenchmarkCases.All().OfType<FixtureCase>().ToList();

            CollectionAssert.AreEqual(runSaves, fixtures.Select(fixture => fixture.Name).ToList());
            CollectionAssert.AreEqual(runSaves.Select(name => $"conformance/saves/{name}.run.json").ToList(),
                                      fixtures.Select(fixture => fixture.SavePath).ToList());
        }

        [TestMethod]
        public void All_Fixtures_RunAtTheirSavedSpeed()
        {
            foreach (FixtureCase fixture in BenchmarkCases.All().OfType<FixtureCase>())
            {
                JsonNode save = JsonNode.Parse(File.ReadAllText(Path.Combine(RepositoryFiles.Root, fixture.SavePath)))!;

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
            List<FixtureCase> fixtures = BenchmarkCases.Of(["disasters", "forestFire", "suburb"], NoneNotRun).OfType<FixtureCase>().ToList();

            CollectionAssert.AreEqual(
                new[] { new FixtureCase("disasters", Speed.Medium, true), new FixtureCase("forestFire", Speed.Medium, true),
                        new FixtureCase("suburb", Speed.Medium, false) },
                fixtures);
        }

        [TestMethod]
        public void Of_FixturesNotRun_AreLeftOut()
        {
            IReadOnlyList<BenchmarkCase> cases = BenchmarkCases.Of(
                ["suburb", "town"], new Dictionary<string, string> { ["town"] = "a reason" });

            CollectionAssert.AreEqual(new[] { "suburb" }, cases.OfType<FixtureCase>().Select(fixture => fixture.Name).ToList());
        }

        [TestMethod]
        public void Of_AFixtureNotRunThatIsntAFixture_FailsNamingIt()
        {
            InvalidDataException exception = Assert.ThrowsExactly<InvalidDataException>(
                () => BenchmarkCases.Of(["suburb"], new Dictionary<string, string> { ["suburbia"] = "a reason" }));

            StringAssert.Contains(exception.Message, "The fixture suburbia isn't run");
        }

        [TestMethod]
        public void FixtureNames_Checkpoints_AreTheirFixturesInOrdinalOrder()
        {
            CollectionAssert.AreEqual(new[] { "B", "a", "b" },
                                      BenchmarkCases.FixtureNames("""{"b":{},"a":{},"B":{}}""").ToList());
        }

        [TestMethod]
        public void FixtureNames_NoFixtures_Fails()
        {
            Assert.ThrowsExactly<InvalidDataException>(() => BenchmarkCases.FixtureNames("{}"));
        }

        [TestMethod]
        public void NotRun_EachFixture_StillFailsToRunInCSharp()
        {
            // An entry the C# simulation can now run fails here, so it leaves the list and its fixture joins the report
            foreach (string fixture in BenchmarkCases.NotRun.Keys)
            {
                FixtureCase benchmarkCase = (FixtureCase)BenchmarkCases.Of([fixture], NoneNotRun)[0];

                Assert.Throws<Exception>(() => StepTimer.Measure(benchmarkCase, BenchmarkSettings.Default with { Repeats = 1 }),
                                         fixture);
            }
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
            string saved = File.ReadAllText(Path.Combine(RepositoryFiles.Root, fixture.SavePath));

            Assert.AreEqual(saved, CanonicalJson.Write(fixture.Start().Save()));
        }

        [TestMethod]
        public void Start_FixtureAtAnotherSpeed_FailsNamingBoth()
        {
            InvalidDataException exception = Assert.ThrowsExactly<InvalidDataException>(
                () => new FixtureCase("suburb", Speed.Fast, false).Start());

            StringAssert.Contains(exception.Message, "saved at Medium, but its case runs it at Fast");
        }

        [TestMethod]
        public void ToJson_ExampleCases_IsTheExampleCaseList()
        {
            JsonNode written = JsonNode.Parse(BenchmarkCases.ToJson(Examples.Cases, Examples.Settings))!;

            Assert.IsTrue(JsonNode.DeepEquals(JsonNode.Parse(Examples.Read("caseList.json")), written), written.ToJsonString());
        }
    }
}
