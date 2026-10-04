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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// Every city run in C#: a new city from each conformance seed and each fixture's city, run at each
    /// speed, must emit the TypeScript's events in order and match its state hash at every checkpoint.
    /// </summary>
    [TestClass]
    public sealed class CityRunTests
    {
        private static readonly IReadOnlyList<ConformanceRun> Runs = ConformanceRuns.Load();

        // A run's index entry, for the reader's tests: a seed's run of two steps, checked at both ends
        private const string ValidRun =
            "{\"file\":\"f\",\"seed\":0,\"fixture\":null,\"level\":\"easy\",\"speed\":\"slow\",\"steps\":2,\"events\":0," +
            "\"checkpoints\":[{\"step\":0,\"hash\":\"h\"},{\"step\":2,\"hash\":\"h\"}]}";

        public static IEnumerable<object[]> AllRuns => Runs.Select(run => new object[] { run });

        public static string DisplayName(System.Reflection.MethodInfo method, object[] data)
        {
            return data[0].ToString()!;
        }

        [TestMethod]
        [DynamicData(nameof(AllRuns), DynamicDataDisplayName = nameof(DisplayName))]
        public void FirstDifference_EveryRun_IsNone(ConformanceRun run)
        {
            if (CityRunner.FirstDifference(run) is string difference)
            {
                Assert.Fail($"{run}: {difference}");
            }
        }

        // The seeds take the levels easy, medium and hard in turn, in maps.json's order
        [TestMethod]
        public void Runs_ComparedWithMapsJson_RunANewCityFromEachSeedAtEverySpeedAtItsLevel()
        {
            Level[] levels = [Level.Easy, Level.Medium, Level.Hard];
            IReadOnlyList<MapSeed> seeds = ConformanceMaps.Load().Seeds;

            for (int i = 0; i < seeds.Count; i++)
            {
                List<ConformanceRun> runs = Runs.Where(run => run.Seed == seeds[i].Seed).ToList();

                CollectionAssert.AreEquivalent(new[] { Speed.Slow, Speed.Medium, Speed.Fast }, runs.Select(run => run.RunningSpeed).ToList(), seeds[i].ToString());
                Assert.IsTrue(runs.All(run => run.GameLevel == levels[i % levels.Length]), $"{seeds[i]} is not run at {levels[i % levels.Length]}.");
            }
        }

        // The check can fail: a city that starts a dollar richer than the TypeScript's differs at step 0
        [TestMethod]
        public void FirstDifference_CityChangedBeforeItRuns_NamesTheHashAtStep0()
        {
            ConformanceRun run = Runs.First(run => run.Fixture is not null);
            Simulation city = CityRunner.StartCity(run, save => save["budget"]!["totalFunds"] = (long)save["budget"]!["totalFunds"]! + 1);

            string? difference = CityRunner.FirstDifference(run, city, ConformanceRuns.ReadEvents(run));

            StringAssert.StartsWith(difference, "The state hash after step 0 differs");
        }

        // The check can fail on the events alone: with the TypeScript's first event left out, the C#'s first differs
        [TestMethod]
        public void FirstDifference_FirstEventLeftOut_NamesTheFirstEvent()
        {
            ConformanceRun run = Runs[0];
            JsonArray expected = ConformanceRuns.ReadEvents(run);
            expected.RemoveAt(0);

            string? difference = CityRunner.FirstDifference(run, CityRunner.StartCity(run), expected);

            StringAssert.StartsWith(difference, "Event 0 differs");
        }

        // An event the C# emits past the TypeScript's last is a difference too, though every event before it matches
        [TestMethod]
        public void FirstDifference_LastEventLeftOut_NamesTheEventTheCSharpEmittedBeyond()
        {
            ConformanceRun run = Runs[0];
            JsonArray expected = ConformanceRuns.ReadEvents(run);
            expected.RemoveAt(expected.Count - 1);

            string? difference = CityRunner.FirstDifference(run, CityRunner.StartCity(run), expected);

            StringAssert.StartsWith(difference, $"Event {expected.Count} differs: expected no event, was {{");
        }

        [TestMethod]
        public void Parse_SharedFile_ReadsIt()
        {
            Assert.IsNotEmpty(ConformanceRuns.Parse(ConformanceFile.Read("runs/index.json")));
        }

        [TestMethod]
        [DataRow("a run from a seed and a fixture", "\"fixture\":null", "\"fixture\":\"suburb\"", "a seed or a fixture")]
        [DataRow("a run from neither", "\"seed\":0", "\"seed\":null", "a seed or a fixture")]
        [DataRow("checkpoints from after step 0", "{\"step\":0,", "{\"step\":1,", "at step 0 and at its last step")]
        [DataRow("checkpoints short of its last step", "{\"step\":2,", "{\"step\":1,", "at step 0 and at its last step")]
        [DataRow("a run without its level", "\"level\":\"easy\",", "", "level")]
        public void Parse_BrokenIndex_Throws(string description, string replaced, string replacement, string message)
        {
            ConformanceAssert.Broken(() => ConformanceRuns.Parse($"{{\"runs\":[{ValidRun.Replace(replaced, replacement)}]}}"), description, message);
        }

        [TestMethod]
        public void Parse_NoRuns_Throws()
        {
            ConformanceAssert.Broken(() => ConformanceRuns.Parse("{\"runs\":[]}"), "no runs", "runs is empty");
        }

        [TestMethod]
        public void ReadEvents_CountNotTheIndexs_Throws()
        {
            ConformanceRun run = Runs[0];

            ConformanceAssert.Broken(() => ConformanceRuns.ReadEvents(run with { Events = run.Events + 1 }), "an event count the file disagrees with",
                                     $"holds {run.Events} events, not the {run.Events + 1}");
        }
    }
}
