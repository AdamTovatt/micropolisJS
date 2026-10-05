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
using Micropolis.Conformance;
using Micropolis.Rules;

namespace Micropolis.Headless.Tests
{
    [TestClass]
    public sealed class HeadlessRunnerTests
    {
        private static readonly Fixture MidRun = Fixtures.MidRun.Single(log => log.Name == "suburbMidRun");

        private static string LogPath(string name)
        {
            return Fixtures.LogPath(ConformanceDirectories.Committed, name);
        }

        private static CommandLog Committed(string name)
        {
            return CommandLog.Parse(File.ReadAllText(LogPath(name)));
        }

        // The replay of a log file of the text given
        private static RunReport RunLog(string log)
        {
            using TemporaryDirectory directory = new TemporaryDirectory();
            return HeadlessRunner.Run(new ReplayLog(directory.Write("log.json", log)), HeadlessFiles.Committed);
        }

        private static string Hash(Simulation city)
        {
            return StateHash.HashSavedState(city.Save());
        }

        // The run checkpoint is the fixture's golden run: its city from its built save, at its saved speed
        [TestMethod]
        public void Run_FixtureForItsRun_EndsAtItsRunCheckpoint()
        {
            RunReport report = HeadlessRunner.Run(new RunCity(new RunStart(null, "town", null), Fixtures.RunSteps), HeadlessFiles.Committed);

            Assert.AreEqual(Committed("town").Checkpoints[1].Hash, report.Lines[0]);
            Assert.IsNull(report.Failure);
        }

        // The expected hash is the same city stepped directly, which pins the wiring, not the rules: the fixture logs
        // pin those. A hash copied from another run would be a golden outside the logs, which no command regenerates
        // after a rule change. The summary: 2000 steps at fast speed are 125 units of city time, two years and a half
        // from 1900; nothing is built, so no one lives there, and no tax has touched the 20000 a city starts with.
        [TestMethod]
        public void Run_Seed_PrintsTheHashThenTheYearPopulationAndFunds()
        {
            RunReport report = HeadlessRunner.Run(new RunCity(new RunStart(5, null, Speed.Fast), 2000), HeadlessFiles.Committed);

            Simulation city = Simulation.NewCity(5, Level.Easy, Speed.Fast);
            for (int i = 0; i < 2000; i++)
            {
                city.Step();
            }

            CollectionAssert.AreEqual(new[] { Hash(city), "year 1902, population 0, funds 20000" }, report.Lines.ToArray());
        }

        [TestMethod]
        public void StartCity_Fixture_IsItsCityAsBuilt()
        {
            Assert.AreEqual(Committed("suburb").Checkpoints[0].Hash, Hash(HeadlessRunner.StartCity(new RunStart(null, "suburb", null), ConformanceDirectories.Committed)));
        }

        // The city is the built save the directories hold, read rather than built again from the fixture's log
        [TestMethod]
        public void StartCity_Fixture_LoadsTheBuiltSaveInTheDirectories()
        {
            using TemporaryDirectory conformance = new TemporaryDirectory();
            FixtureSavePoint built = FixtureSaves.At("suburb", FixtureSaves.Built);
            JsonObject save = JsonNode.Parse(built.ReadCommitted())!.AsObject();
            save["budget"]!["totalFunds"] = 12345;
            conformance.Write(Path.Combine("saves", Path.GetFileName(built.FilePath(conformance.Conformance))), CanonicalJson.Write(save));

            Simulation city = HeadlessRunner.StartCity(new RunStart(null, "suburb", null), conformance.Conformance);

            Assert.AreEqual(12345L, city.Budget.TotalFunds);
        }

        // That only the speed changes is FixtureSavesTests'; the run's speed reaching the city is the runner's
        [TestMethod]
        [DataRow(Speed.Slow)]
        [DataRow(Speed.Fast)]
        public void StartCity_FixtureGivenASpeed_RunsAtIt(Speed speed)
        {
            Simulation city = HeadlessRunner.StartCity(new RunStart(null, "suburb", speed), ConformanceDirectories.Committed);

            Assert.AreEqual(speed, city.Speed);
        }

        [TestMethod]
        [DataRow(null, null, DisplayName = "neither")]
        [DataRow(1u, "town", DisplayName = "both")]
        public void StartCity_NotExactlyOneStart_ThrowsNamingTheProblem(uint? seed, string? fixture)
        {
            ArgumentException exception = Assert.ThrowsExactly<ArgumentException>(
                () => HeadlessRunner.StartCity(new RunStart(seed, fixture, null), ConformanceDirectories.Committed));

            Assert.AreEqual("A run starts from either a seed or a fixture", exception.Message);
        }

        [TestMethod]
        public void Run_CommittedLog_CountsItsOutcomesAndMatchesEveryCheckpoint()
        {
            RunReport report = HeadlessRunner.Run(new ReplayLog(LogPath(MidRun.Name)), HeadlessFiles.Committed);

            // Every command of the mid-run log applies
            Assert.AreEqual($"{MidRun.Entries.Count} commands: {MidRun.Entries.Count} ok", report.Lines[0]);
            Assert.AreEqual($"{MidRun.CheckpointSteps.Count} checkpoints match", report.Lines[1]);
            Assert.AreEqual(Committed(MidRun.Name).Checkpoints[^1].Hash, report.Lines[2]);
            Assert.IsNull(report.Failure);
        }

        [TestMethod]
        public void Run_LogWithoutCheckpoints_FailsHavingVerifiedNothing()
        {
            const string log = "{\"formatVersion\":2,\"seed\":8,\"level\":0,\"entries\":[" +
                               "{\"step\":2,\"player\":\"local\",\"command\":{\"type\":\"addFunds\"}}," +
                               "{\"step\":2,\"player\":\"ada\",\"command\":{\"type\":\"nothing\"}}],\"checkpoints\":[]}";

            RunReport report = RunLog(log);

            Assert.AreEqual("2 commands: 1 ok, 1 rejected", report.Lines[0]);
            Assert.AreEqual("The log has no checkpoints, so its replay verified nothing", report.Failure);
        }

        [TestMethod]
        public void Run_LogWithAWrongCheckpoint_FailsNamingItsStep()
        {
            string log = File.ReadAllText(LogPath(MidRun.Name));
            Checkpoint checkpoint = Committed(MidRun.Name).Checkpoints[2];

            ReplayDiffersException exception = Assert.ThrowsExactly<ReplayDiffersException>(
                () => RunLog(log.Replace(checkpoint.Hash, new string('0', 64))));

            Assert.AreEqual($"At step {checkpoint.Step} the replay's state hash is {checkpoint.Hash}, but the log's checkpoint is {new string('0', 64)}",
                            exception.Message);
        }

        [TestMethod]
        public void Run_LogThatStepsAPausedCity_Fails()
        {
            const string log = "{\"formatVersion\":2,\"seed\":8,\"level\":0,\"entries\":[" +
                               "{\"step\":0,\"player\":\"local\",\"command\":{\"type\":\"setSpeed\",\"speed\":0}}]," +
                               "\"checkpoints\":[{\"step\":5,\"hash\":\"" + "0000000000000000000000000000000000000000000000000000000000000000" + "\"}]}";

            StepsFailedException exception = Assert.ThrowsExactly<StepsFailedException>(() => RunLog(log));

            Assert.AreEqual("The log steps a paused city, from step 0 to step 5", exception.Message);
        }

        [TestMethod]
        public void Advance_PausedCity_ThrowsRatherThanStepping()
        {
            Simulation city = Simulation.NewCity(1, Level.Easy, Speed.Paused);

            Assert.ThrowsExactly<StepsFailedException>(() => HeadlessRunner.Advance(city, 1));
        }

        [TestMethod]
        public void OutcomeCounts_NoCommands_CountsNone()
        {
            Assert.AreEqual("0 commands", HeadlessRunner.OutcomeCounts([]));
        }
    }
}
