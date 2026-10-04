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
    [TestClass]
    public sealed class HeadlessRunnerTests
    {
        private static readonly Fixture MidRun = Fixtures.MidRun.Single(log => log.Name == "suburbMidRun");

        private static string LogPath(string name)
        {
            return Fixtures.LogPath(Fixtures.CommittedLogs, name);
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
            RunReport report = HeadlessRunner.Run(new RunCity(new RunStart(null, "town", null, null), Fixtures.RunSteps), HeadlessFiles.Committed);

            Assert.AreEqual(Committed("town").Checkpoints[1].Hash, report.Lines[0]);
            Assert.IsNull(report.Failure);
        }

        // The expected hash is the same city stepped directly, which pins the wiring, not the rules: the fixture logs
        // pin those. A hash copied from the TypeScript runner would be a golden outside the logs, which no command
        // regenerates after a rule change. The summary: 2000 steps at fast speed are 125 units of city time, two years
        // and a half from 1900; nothing is built, so no one lives there, and no tax has touched the 20000 a city starts
        // with.
        [TestMethod]
        public void Run_Seed_PrintsTheHashThenTheYearPopulationAndFunds()
        {
            RunReport report = HeadlessRunner.Run(new RunCity(new RunStart(5, null, null, Speed.Fast), 2000), HeadlessFiles.Committed);

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
            Assert.AreEqual(Committed("suburb").Checkpoints[0].Hash, Hash(HeadlessRunner.StartCity(new RunStart(null, "suburb", null, null), Fixtures.CommittedLogs)));
        }

        [TestMethod]
        public void StartCity_FixtureAtAnotherSpeed_KeepsItsStream()
        {
            Simulation saved = HeadlessRunner.StartCity(new RunStart(null, "suburb", null, null), Fixtures.CommittedLogs);

            Simulation city = HeadlessRunner.StartCity(new RunStart(null, "suburb", null, Speed.Fast), Fixtures.CommittedLogs);

            Assert.AreEqual(Speed.Medium, saved.Speed);
            Assert.AreEqual(Speed.Fast, city.Speed);
            CollectionAssert.AreEqual(saved.Random.GetState(), city.Random.GetState());
        }

        [TestMethod]
        public void StartCity_FixtureReseeded_TakesTheSeedAndItsSimulationStream()
        {
            Simulation city = HeadlessRunner.StartCity(new RunStart(null, "suburb", 7, null), Fixtures.CommittedLogs);

            Assert.AreEqual(7u, city.Seed);
            CollectionAssert.AreEqual(RandomStream.SimulationStream(7).GetState(), city.Random.GetState());
            Assert.AreEqual(Speed.Medium, city.Speed);
        }

        [TestMethod]
        [DataRow(null, null, null, "A run starts from either a seed or a fixture", DisplayName = "neither")]
        [DataRow(1u, "town", null, "A run starts from either a seed or a fixture", DisplayName = "both")]
        [DataRow(1u, null, 2u, "Reseeding replaces a fixture's stream", DisplayName = "a seed reseeded")]
        public void StartCity_WrongStart_ThrowsNamingTheProblem(uint? seed, string? fixture, uint? reseed, string problem)
        {
            ArgumentException exception = Assert.ThrowsExactly<ArgumentException>(
                () => HeadlessRunner.StartCity(new RunStart(seed, fixture, reseed, null), Fixtures.CommittedLogs));

            StringAssert.Contains(exception.Message, problem);
        }

        [TestMethod]
        public void StartFromSave_SavedPausedWithNoSpeed_ThrowsAskingForOne()
        {
            JsonObject save = Simulation.NewCity(1, Level.Easy, Speed.Paused).Save();

            ArgumentException exception = Assert.ThrowsExactly<ArgumentException>(() => HeadlessRunner.StartFromSave(save, null, null));

            Assert.AreEqual("The city is saved paused: give a speed to run it", exception.Message);
        }

        [TestMethod]
        public void StartFromSave_SavedPausedGivenASpeed_RunsAtIt()
        {
            JsonObject save = Simulation.NewCity(1, Level.Easy, Speed.Paused).Save();

            Assert.AreEqual(Speed.Slow, HeadlessRunner.StartFromSave(save, null, Speed.Slow).Speed);
        }

        [TestMethod]
        public void Run_CommittedLog_CountsItsOutcomesAndMatchesEveryCheckpoint()
        {
            RunReport report = HeadlessRunner.Run(new ReplayLog(LogPath(MidRun.Name)), HeadlessFiles.Committed);

            // Every command of the mid-run log applies, as the generator checks
            Assert.AreEqual($"{MidRun.Entries.Count} commands: {MidRun.Entries.Count} ok", report.Lines[0]);
            Assert.AreEqual($"{MidRun.CheckpointSteps.Count} checkpoints match", report.Lines[1]);
            Assert.AreEqual(Committed(MidRun.Name).Checkpoints[^1].Hash, report.Lines[2]);
            Assert.IsNull(report.Failure);
        }

        [TestMethod]
        public void Run_LogWithoutCheckpoints_FailsHavingVerifiedNothing()
        {
            const string log = "{\"formatVersion\":1,\"seed\":8,\"level\":0,\"entries\":[" +
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
            const string log = "{\"formatVersion\":1,\"seed\":8,\"level\":0,\"entries\":[" +
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
