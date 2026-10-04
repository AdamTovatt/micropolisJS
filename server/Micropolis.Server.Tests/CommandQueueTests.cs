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
        [TestMethod]
        public void ApplyCommands_Queued_AppliesThemInTheOrderTheyArrived()
        {
            Simulation city = NewCity();
            CommandQueue queue = new CommandQueue(city, new CommandRecorder(city, CommandRecorder.NewCityStart(2026, Level.Easy)));
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
            CommandQueue queue = new CommandQueue(city, new CommandRecorder(city, CommandRecorder.NewCityStart(2026, Level.Easy)));
            long funds = city.Budget.TotalFunds;
            queue.Send(new ReceivedCommand("player", new JsonObject { ["type"] = "addFunds" }));

            queue.ApplyCommands();

            Assert.AreEqual(0, queue.ApplyCommands());
            Assert.AreEqual(funds + 20000, city.Budget.TotalFunds);
        }

        [TestMethod]
        public void Step_Twice_CountsTheSteps()
        {
            Simulation city = NewCity();
            CommandQueue queue = new CommandQueue(city, new CommandRecorder(city, CommandRecorder.NewCityStart(2026, Level.Easy)));

            queue.Step();
            queue.Step();

            Assert.AreEqual(2, queue.StepIndex);
            Assert.AreEqual(2, city.SpeedCycle);
        }

        [TestMethod]
        public void Log_CommandsBetweenSteps_StampsEachWithTheStepItPrecedes()
        {
            Simulation city = NewCity();
            CommandRecorder recorder = new CommandRecorder(city, CommandRecorder.NewCityStart(2026, Level.Easy));
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
                recorder.Log()["entries"]!.AsArray()
                    .Select(entry => $"{(long)entry!["step"]!} {(string)entry["player"]!} {(string)entry["command"]!["type"]!}").ToArray());
        }

        [TestMethod]
        public void Log_NewCity_StartsFromItsSeedAndLevelWithACheckpointOfTheCityNow()
        {
            Simulation city = NewCity();
            CommandRecorder recorder = new CommandRecorder(city, CommandRecorder.NewCityStart(2026, Level.Easy));

            JsonObject log = recorder.Log();

            Assert.AreEqual(
                CanonicalJson.Write(new JsonObject
                {
                    ["formatVersion"] = CommandRecorder.LogFormatVersion,
                    ["seed"] = 2026,
                    ["level"] = 0,
                    ["entries"] = new JsonArray(),
                    ["checkpoints"] = new JsonArray(new JsonObject { ["step"] = 0, ["hash"] = StateHash.HashSavedState(city.Save()) }),
                }),
                CanonicalJson.Write(log));
        }

        [TestMethod]
        public void Log_PastACheckpointInterval_ChecksEveryIntervalAndTheCityNow()
        {
            Simulation city = NewCity();
            CommandRecorder recorder = new CommandRecorder(city, CommandRecorder.NewCityStart(2026, Level.Easy));
            CommandQueue queue = new CommandQueue(city, recorder);

            for (int i = 0; i <= CommandRecorder.CheckpointInterval; i++)
            {
                queue.Step();
            }

            CollectionAssert.AreEqual(
                new long[] { 0, CommandRecorder.CheckpointInterval, CommandRecorder.CheckpointInterval + 1 },
                recorder.Log()["checkpoints"]!.AsArray().Select(checkpoint => (long)checkpoint!["step"]!).ToArray());
        }

        [TestMethod]
        public void SavedStart_City_StartsTheLogFromItsSave()
        {
            Simulation city = NewCity();

            JsonObject start = CommandRecorder.SavedStart(city);

            Assert.AreEqual(CanonicalJson.Write(new JsonObject { ["save"] = city.Save() }), CanonicalJson.Write(start));
        }

        private static Simulation NewCity()
        {
            return Simulation.NewCity(2026, Level.Easy, Speed.Medium);
        }
    }
}
