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
            List<string> committed = Directory.GetFiles(Fixtures.CommittedLogs, $"*{Fixtures.LogExtension}")
                .Select(path => Path.GetFileName(path)[..^Fixtures.LogExtension.Length])
                .ToList();

            CollectionAssert.AreEquivalent(committed, Fixtures.Logs.Select(fixture => fixture.Name).ToList());
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
            string directory = CopyOfTheLogs();

            try
            {
                File.WriteAllText(Fixtures.LogPath(directory, "town"), "stale");

                IReadOnlyList<string> written = FixtureLogs.WriteAll(directory);

                Assert.HasCount(Fixtures.Logs.Count, written);
                foreach (Fixture fixture in Fixtures.Logs)
                {
                    Assert.AreEqual(Committed(fixture.Name), File.ReadAllText(Fixtures.LogPath(directory, fixture.Name)), fixture.Name);
                }
            }
            finally
            {
                Directory.Delete(directory, true);
            }
        }

        // A log that fails to build leaves every file as it was, though the logs built before it were fine
        [TestMethod]
        public void WriteAll_LogThatFailsToBuild_WritesNoFile()
        {
            string directory = CopyOfTheLogs();

            try
            {
                File.WriteAllText(Fixtures.LogPath(directory, "broke"), "stale");
                File.WriteAllText(Fixtures.LogPath(directory, "disasters"), "{}");

                Assert.ThrowsExactly<InvalidDataException>(() => FixtureLogs.WriteAll(directory));

                Assert.AreEqual("stale", File.ReadAllText(Fixtures.LogPath(directory, "broke")));
            }
            finally
            {
                Directory.Delete(directory, true);
            }
        }

        [TestMethod]
        public void Named_UnknownFixture_ThrowsListingTheFixtures()
        {
            ArgumentException exception = Assert.ThrowsExactly<ArgumentException>(() => Fixtures.Named("metropolis"));

            StringAssert.Contains(exception.Message, "No fixture named metropolis: the fixtures are broke, disasters");
        }

        private static string CopyOfTheLogs()
        {
            string directory = Directory.CreateTempSubdirectory("micropolis-logs-").FullName;

            foreach (string file in Directory.GetFiles(Fixtures.CommittedLogs, $"*{Fixtures.LogExtension}"))
            {
                File.Copy(file, Path.Combine(directory, Path.GetFileName(file)));
            }

            return directory;
        }
    }
}
