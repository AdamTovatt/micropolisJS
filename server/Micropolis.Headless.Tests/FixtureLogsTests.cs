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

namespace Micropolis.Headless.Tests
{
    /// <summary>
    /// The fixture tool against the committed logs: each log it builds, its checkpoints worked out by its own replay,
    /// is the committed file byte for byte. A change to a fixture's commands, or to a rule its replay reaches, fails
    /// here until the logs are written again.
    /// </summary>
    [TestClass]
    public sealed class FixtureLogsTests
    {
        public static IEnumerable<object[]> Logs => Fixtures.Logs.Select(fixture => new object[] { fixture.Name });

        private static string Committed(string name)
        {
            return File.ReadAllText(Fixtures.LogPath(Fixtures.CommittedLogs, name));
        }

        [TestMethod]
        [DynamicData(nameof(Logs))]
        public void Build_EachLog_WritesTheCommittedFileByteForByte(string name)
        {
            Fixture fixture = Fixtures.Logs.Single(log => log.Name == name);

            Assert.AreEqual(Committed(name), FixtureLogs.Build(fixture, Fixtures.CommittedLogs).Write());
        }

        [TestMethod]
        public void Logs_ComparedWithTheCommittedFiles_AreOneEach()
        {
            List<string> committed = Directory.GetFiles(Fixtures.CommittedLogs, $"*{CommandLog.FileExtension}")
                .Select(path => Path.GetFileName(path)[..^CommandLog.FileExtension.Length])
                .ToList();

            CollectionAssert.AreEquivalent(committed, FixtureLogs.Names.ToList());
        }

        [TestMethod]
        public void CopyPlaythrough_GoldenPlaythrough_WritesTheCommittedFileByteForByte()
        {
            Assert.AreEqual(Committed(FixtureLogs.Playthrough), FixtureLogs.CopyPlaythrough(FixtureLogs.CommittedGoldenPlaythrough).Write());
        }

        [TestMethod]
        [DataRow("{\"log\":", "is not JSON: ", DisplayName = "text that is no JSON")]
        [DataRow("{\"checkpoints\":[]}", "holds no log: A command log is a JSON object", DisplayName = "JSON with no log")]
        public void CopyPlaythrough_GoldenPlaythroughWithNoLog_ThrowsNamingTheFile(string golden, string problem)
        {
            using TemporaryDirectory directory = new TemporaryDirectory();
            string path = directory.Write("goldenPlaythrough.json", golden);

            InvalidDataException exception = Assert.ThrowsExactly<InvalidDataException>(() => FixtureLogs.CopyPlaythrough(path));

            StringAssert.StartsWith(exception.Message, $"The golden playthrough {path} {problem}");
        }

        // As the generator does, the tool copies only a log that still replays, since a rule change that moves the
        // playthrough is pinned by running it again, not by copying its log
        [TestMethod]
        public void CopyPlaythrough_GoldenLogThatNoLongerReplays_ThrowsAskingForItToBeRepinned()
        {
            using TemporaryDirectory directory = new TemporaryDirectory();
            JsonObject golden = JsonNode.Parse(File.ReadAllText(FixtureLogs.CommittedGoldenPlaythrough))!.AsObject();
            JsonNode checkpoint = golden["log"]!["checkpoints"]!.AsArray()[^1]!;
            checkpoint["hash"] = new string('0', 64);
            string path = directory.Write("goldenPlaythrough.json", golden.ToJsonString());

            ReplayDiffersException exception = Assert.ThrowsExactly<ReplayDiffersException>(() => FixtureLogs.CopyPlaythrough(path));

            StringAssert.StartsWith(exception.Message, "The golden playthrough's log does not replay: re-pin the playthrough with npm run e2e:golden first. ");
            StringAssert.Contains(exception.Message, $"but the log's checkpoint is {new string('0', 64)}");
        }

        // The save is committed data, so the byte-for-byte check holds it to itself: what it proves is that the tool
        // starts from it and writes it back unchanged
        [TestMethod]
        public void Build_FixtureFromItsCommittedSave_StartsFromTheSaveItsLogKeeps()
        {
            CommandLog committed = CommandLog.Parse(Committed("disasters"));

            CommandLog built = FixtureLogs.Build(Fixtures.Named("disasters"), Fixtures.CommittedLogs);

            Assert.IsInstanceOfType<SaveStart>(built.Start);
            Assert.AreEqual(((SaveStart)committed.Start).Save.ToJsonString(), ((SaveStart)built.Start).Save.ToJsonString());
        }

        [TestMethod]
        public void Build_FixtureWithACommandChanged_MovesItsCheckpoints()
        {
            Fixture town = Fixtures.Named("town");
            Fixture changed = town with { Entries = town.Entries.Skip(1).ToList() };

            CommandLog built = FixtureLogs.Build(changed, Fixtures.CommittedLogs);
            CommandLog committed = CommandLog.Parse(Committed("town"));

            Assert.AreNotEqual(committed.Checkpoints[0].Hash, built.Checkpoints[0].Hash);
            Assert.AreNotEqual(committed.Checkpoints[1].Hash, built.Checkpoints[1].Hash);
        }

        [TestMethod]
        public void WriteAll_CopyOfTheLogs_WritesEachAsCommitted()
        {
            using TemporaryDirectory logs = TemporaryDirectory.WithTheLogs();
            logs.Write($"town{CommandLog.FileExtension}", "stale");

            IReadOnlyList<string> written = FixtureLogs.WriteAll(logs.Path, FixtureLogs.CommittedGoldenPlaythrough);

            Assert.HasCount(FixtureLogs.Names.Count, written);
            foreach (string name in FixtureLogs.Names)
            {
                Assert.AreEqual(Committed(name), File.ReadAllText(Fixtures.LogPath(logs.Path, name)), name);
            }
        }

        // A log that fails to build leaves every file as it was, though the logs built before it were fine
        [TestMethod]
        public void WriteAll_LogThatFailsToBuild_WritesNoFile()
        {
            using TemporaryDirectory logs = TemporaryDirectory.WithTheLogs();
            logs.Write($"broke{CommandLog.FileExtension}", "stale");
            logs.Write($"disasters{CommandLog.FileExtension}", "{}");

            Assert.ThrowsExactly<InvalidDataException>(() => FixtureLogs.WriteAll(logs.Path, FixtureLogs.CommittedGoldenPlaythrough));

            Assert.AreEqual("stale", File.ReadAllText(Fixtures.LogPath(logs.Path, "broke")));
        }

        [TestMethod]
        public void Named_UnknownFixture_ThrowsListingTheFixtures()
        {
            ArgumentException exception = Assert.ThrowsExactly<ArgumentException>(() => Fixtures.Named("metropolis"));

            StringAssert.Contains(exception.Message, "No fixture named metropolis: the fixtures are broke, disasters");
        }
    }
}
