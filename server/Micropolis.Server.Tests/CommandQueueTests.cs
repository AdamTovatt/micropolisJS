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

namespace Micropolis.Server.Tests
{
    /// <summary>
    /// The command queue and the recorder it drives, as test/commandQueue.ts and test/commandLog.ts test the browser's:
    /// commands applied in the order they arrived, each stamped with the step it precedes, and the log's checkpoints.
    /// </summary>
    [TestClass]
    public sealed class CommandQueueTests
    {
        // What an addFunds command grants, the debug menu's grant
        private const long AddedFunds = 20000;

        [TestMethod]
        public void ApplyCommands_Queued_AppliesThemInTheOrderTheyArrived()
        {
            Simulation city = NewCity();
            CommandQueue queue = new CommandQueue(city, new CommandRecorder(city, new SeedStart(2026, Level.Easy)));
            long funds = city.Budget.TotalFunds;

            queue.Send(new ReceivedCommand("first", new JsonObject { ["type"] = "setSpeed", ["speed"] = 0 }));
            queue.Send(new ReceivedCommand("second", new JsonObject { ["type"] = "setSpeed", ["speed"] = 3 }));
            Assert.AreEqual(Speed.Medium, city.Speed);

            Assert.AreEqual(2, queue.ApplyCommands());

            Assert.AreEqual(Speed.Fast, city.Speed);
            Assert.AreEqual(funds, city.Budget.TotalFunds);
        }

        [TestMethod]
        public void ApplyCommands_Twice_AppliesEachCommandOnce()
        {
            Simulation city = NewCity();
            CommandQueue queue = new CommandQueue(city, new CommandRecorder(city, new SeedStart(2026, Level.Easy)));
            long funds = city.Budget.TotalFunds;
            queue.Send(new ReceivedCommand("player", new JsonObject { ["type"] = "addFunds" }));

            queue.ApplyCommands();

            Assert.AreEqual(0, queue.ApplyCommands());
            Assert.AreEqual(funds + AddedFunds, city.Budget.TotalFunds);
        }

        [TestMethod]
        public void Step_Twice_CountsTheSteps()
        {
            Simulation city = NewCity();
            CommandQueue queue = new CommandQueue(city, new CommandRecorder(city, new SeedStart(2026, Level.Easy)));

            queue.Step();
            queue.Step();

            Assert.AreEqual(2, queue.StepIndex);
            Assert.AreEqual(2, city.SpeedCycle);
        }

        [TestMethod]
        public void Log_CommandsBetweenSteps_StampsEachWithTheStepItPrecedes()
        {
            Simulation city = NewCity();
            CommandRecorder recorder = new CommandRecorder(city, new SeedStart(2026, Level.Easy));
            CommandQueue queue = new CommandQueue(city, recorder);

            queue.Send(new ReceivedCommand("ada", new JsonObject { ["type"] = "setAutoBudget", ["on"] = false }));
            queue.ApplyCommands();
            queue.Step();
            queue.Step();
            queue.Send(new ReceivedCommand("grace", new JsonObject { ["type"] = "addFunds" }));
            queue.Send(new ReceivedCommand("ada", new JsonObject { ["type"] = "setSpeed", ["speed"] = 2 }));
            queue.ApplyCommands();

            CollectionAssert.AreEqual(
                new[] { "0 ada setAutoBudget", "2 grace addFunds", "2 ada setSpeed" },
                ReadBack(recorder).Entries.Select(entry => $"{entry.Step} {entry.Player} {(string)entry.Command!["type"]!}").ToArray());
        }

        [TestMethod]
        public void Log_NewCity_StartsFromItsSeedAndLevelWithACheckpointOfTheCityNow()
        {
            Simulation city = NewCity();
            CommandRecorder recorder = new CommandRecorder(city, new SeedStart(2026, Level.Easy));

            CommandLog log = ReadBack(recorder);

            Assert.AreEqual(new SeedStart(2026, Level.Easy), log.Start);
            Assert.IsNull(log.Description);
            Assert.IsEmpty(log.Entries);
            CollectionAssert.AreEqual(new[] { new Checkpoint(0, StateHash.HashSavedState(city.Save())) }, log.Checkpoints.ToArray());
        }

        [TestMethod]
        public void Log_CityFromASave_StartsFromItsSavedStateEachTimeItIsRead()
        {
            StartingCity start = StartingCity.FromSave(SavedGame.Write("Town", NewCity()));
            CommandRecorder recorder = new CommandRecorder(start.City, start.LogStart);

            // The recorder keeps one start for every log it gives, which a player may ask for again and again
            ReadBack(recorder);
            CommandLog log = ReadBack(recorder);

            Assert.AreEqual(CanonicalJson.Write(start.City.Save()), CanonicalJson.Write(((SaveStart)log.Start).Save));
            Assert.AreEqual(StateHash.HashSavedState(start.City.Save()), log.Checkpoints.Single().Hash);
        }

        [TestMethod]
        public void Log_CityFromASave_ReplaysInTheRulesToEveryCheckpoint()
        {
            Simulation played = NewCity();
            StepTimes(played, 100);
            StartingCity start = StartingCity.FromSave(SavedGame.Write("Town", played));
            CommandRecorder recorder = new CommandRecorder(start.City, start.LogStart);
            CommandQueue queue = new CommandQueue(start.City, recorder);

            queue.Send(new ReceivedCommand("ada", new JsonObject { ["type"] = "addFunds" }));
            queue.ApplyCommands();
            queue.Step();
            queue.Step();
            queue.Send(new ReceivedCommand("grace", new JsonObject { ["type"] = "setBudget", ["tax"] = 9 }));
            queue.ApplyCommands();
            queue.Step();

            CommandLog log = ReadBack(recorder);
            Replay replay = LogReplay.Verify(log);

            Assert.IsInstanceOfType<SaveStart>(log.Start);
            CollectionAssert.AreEqual(log.Checkpoints.ToArray(), replay.Hashed.ToArray());
            CollectionAssert.AreEqual(new[] { Outcome.Ok, Outcome.Ok }, replay.Results.Select(result => result.Outcome).ToArray());
        }

        [TestMethod]
        public void Log_PastACheckpointInterval_ChecksEveryIntervalAndTheCityNow()
        {
            Simulation city = NewCity();
            CommandRecorder recorder = new CommandRecorder(city, new SeedStart(2026, Level.Easy));
            CommandQueue queue = new CommandQueue(city, recorder);

            for (int i = 0; i <= CommandLog.CheckpointInterval; i++)
            {
                queue.Step();
            }

            // Each checkpoint is the hash of the city before the step it names, as a twin stepped that far has it
            Simulation twin = NewCity();
            List<Checkpoint> expected = new List<Checkpoint> { new Checkpoint(0, StateHash.HashSavedState(twin.Save())) };
            StepTimes(twin, CommandLog.CheckpointInterval);
            expected.Add(new Checkpoint(CommandLog.CheckpointInterval, StateHash.HashSavedState(twin.Save())));
            StepTimes(twin, 1);
            expected.Add(new Checkpoint(CommandLog.CheckpointInterval + 1, StateHash.HashSavedState(twin.Save())));
            CollectionAssert.AreEqual(expected, ReadBack(recorder).Checkpoints.ToList());
        }

        // The recorder's log as a player is sent it, read back as a command log is read
        private static CommandLog ReadBack(CommandRecorder recorder)
        {
            return CommandLog.Parse(recorder.Log().ToJson().ToJsonString());
        }

        private static void StepTimes(Simulation city, int steps)
        {
            for (int i = 0; i < steps; i++)
            {
                city.Step();
            }
        }

        private static Simulation NewCity()
        {
            return Simulation.NewCity(2026, Level.Easy, Speed.Medium);
        }
    }
}
