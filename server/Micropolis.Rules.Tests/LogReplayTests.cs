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
    /// Every command log under <c>conformance/logs/</c> replays in C# to the TypeScript's state hash at each of its
    /// checkpoints.
    /// </summary>
    [TestClass]
    public sealed class LogReplayTests
    {
        private static readonly IReadOnlyList<ConformanceLog> Logs = ConformanceLogs.Load();

        // A log from a seed, built by commands at step 0 and checked there and after its run
        private const string ValidLog =
            "{\"formatVersion\":1,\"seed\":0,\"level\":0," +
            "\"entries\":[{\"step\":0,\"player\":\"local\",\"command\":{\"type\":\"addFunds\"}}," +
            "{\"step\":0,\"player\":\"local\",\"command\":{\"type\":\"setAutoBudget\",\"on\":false}}]," +
            "\"checkpoints\":[{\"step\":0,\"hash\":\"" + Hash + "\"},{\"step\":2,\"hash\":\"" + Hash + "\"}]}";

        private const string Hash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

        public static IEnumerable<object[]> AllLogs => Logs.Select(log => new object[] { log });

        public static string DisplayName(System.Reflection.MethodInfo method, object[] data)
        {
            return data[0].ToString()!;
        }

        [TestMethod]
        [DynamicData(nameof(AllLogs), DynamicDataDisplayName = nameof(DisplayName))]
        public void FirstDifference_EveryLog_IsNone(ConformanceLog log)
        {
            if (LogReplayer.FirstDifference(log) is string difference)
            {
                Assert.Fail($"{log}: {difference}");
            }
        }

        [TestMethod]
        public void Load_SharedLogs_StartFromASeedAndFromASave()
        {
            Assert.IsTrue(Logs.Any(log => log.Seed is not null), "No log starts from a seed.");
            Assert.IsTrue(Logs.Any(log => log.Save is not null), "No log starts from a save.");
        }

        // A command applied a step early or late moves the hash where it should have applied, which only a checkpoint
        // the TypeScript took there can see
        [TestMethod]
        public void Load_SharedLogs_CheckACommandPartwayThroughARunWhereItApplies()
        {
            Assert.IsTrue(Logs.Any(log => log.Entries.Any(entry => entry.Step > 0 && log.Checkpoints.Any(checkpoint => checkpoint.Step == entry.Step))),
                          "No log checks a command sent partway through its run at the step it applies.");
        }

        // Each disaster a player triggers, then the city running on from it, as only a log shows
        [TestMethod]
        public void Load_SharedLogs_TriggerEveryDisasterPartwayThroughARun()
        {
            HashSet<string> triggered = Logs
                .SelectMany(log => log.Entries.Where(entry => entry.Step > 0 && entry.Step < log.LastStep))
                .Where(entry => (string?)entry.Command?["type"] == "triggerDisaster")
                .Select(entry => (string)entry.Command!["kind"]!)
                .ToHashSet();

            List<string> missing = ProtocolJson.Names<DisasterKind>().Where(kind => !triggered.Contains(kind)).ToList();

            Assert.IsEmpty(missing, $"No log triggers these partway through its run and runs on: {string.Join(", ", missing)}.");
        }

        // The check can fail: the city a log builds without its first command differs where it is built
        [TestMethod]
        public void FirstDifference_FirstCommandLeftOut_NamesTheCheckpointAtStep0()
        {
            ConformanceLog log = BuiltByCommands();
            ConformanceLog changed = log with { Entries = log.Entries.Skip(1).ToList() };

            string? difference = LogReplayer.FirstDifference(changed);

            StringAssert.StartsWith(difference, "The state hash at step 0 differs");
        }

        // The check can fail on a command after the city's first step, which only a later checkpoint sees
        [TestMethod]
        public void FirstDifference_FundsAddedAtStep1_NamesTheNextCheckpoint()
        {
            ConformanceLog log = BuiltByCommands();
            ConformanceLog changed = log with { Entries = [.. log.Entries, Entry(1, new JsonObject { ["type"] = "addFunds" })] };

            string? difference = LogReplayer.FirstDifference(changed);

            StringAssert.StartsWith(difference, $"The state hash at step {log.Checkpoints[1].Step} differs");
        }

        [TestMethod]
        public void FirstDifference_PausedAtStep1_SaysTheLogStepsAPausedCity()
        {
            ConformanceLog log = BuiltByCommands();
            JsonObject pause = new JsonObject { ["type"] = "setSpeed", ["speed"] = (int)Speed.Paused };
            ConformanceLog changed = log with { Entries = [.. log.Entries, Entry(1, pause)] };

            string? difference = LogReplayer.FirstDifference(changed);

            Assert.AreEqual("The log steps a paused city at step 1.", difference);
        }

        [TestMethod]
        public void Parse_ValidLog_ReadsItsStartEntriesAndCheckpoints()
        {
            ConformanceLog log = ConformanceLogs.Parse("valid", ValidLog);

            Assert.AreEqual(0u, log.Seed);
            Assert.AreEqual(Level.Easy, log.GameLevel);
            Assert.IsNull(log.Save);
            Assert.AreEqual(new LogEntry(0, "local", null), log.Entries[1] with { Command = null });
            Assert.AreEqual("{\"type\":\"setAutoBudget\",\"on\":false}", log.Entries[1].Command!.ToJsonString());
            CollectionAssert.AreEqual(new[] { new RunCheckpoint(0, Hash), new RunCheckpoint(2, Hash) }, log.Checkpoints.ToArray());
            Assert.AreEqual(2, log.LastStep);
        }

        [TestMethod]
        public void Parse_LogFromASave_ReadsTheSaveAndNoSeed()
        {
            ConformanceLog log = ConformanceLogs.Parse("save", ValidLog.Replace("\"seed\":0,\"level\":0,", "\"save\":{\"simulation\":{}},"));

            Assert.IsNull(log.Seed);
            Assert.IsNull(log.GameLevel);
            Assert.AreEqual("{\"simulation\":{}}", log.Save!.ToJsonString());
        }

        // A log the game wrote without checkpoints at its end ends at its last command
        [TestMethod]
        public void Parse_EntryAfterTheLastCheckpoint_EndsTheReplayAtTheEntry()
        {
            ConformanceLog log = ConformanceLogs.Parse("late", ValidLog.Replace("{\"step\":0,\"player\":\"local\",\"command\":{\"type\":\"setAutoBudget\"",
                                                                                "{\"step\":5,\"player\":\"local\",\"command\":{\"type\":\"setAutoBudget\""));

            Assert.AreEqual(5, log.LastStep);
        }

        [TestMethod]
        [DataRow("a log of another version", "\"formatVersion\":1", "\"formatVersion\":2", "This is a version 2 command log")]
        [DataRow("a log whose description is no string", "\"formatVersion\":1,", "\"formatVersion\":1,\"description\":2,", "description is a string")]
        [DataRow("a log from a seed and a save", "\"level\":0,", "\"level\":0,\"save\":{},", "exactly one of seed or save")]
        [DataRow("a log from a seed at no level", "\"level\":0,", "", "a level with a seed, and only then")]
        [DataRow("a log from a save at a level", "\"seed\":0,", "\"save\":{},", "a level with a seed, and only then")]
        [DataRow("a log from a save that is no object", "\"seed\":0,\"level\":0,", "\"save\":[],", "save is an object")]
        [DataRow("a log at a level past hard", "\"level\":0", "\"level\":3", "the seed, a uint32, and the level, 0 to 2")]
        [DataRow("a log with an unknown member", "\"seed\":0,", "\"seed\":0,\"speed\":2,", "unknown member speed")]
        [DataRow("an entry without its player", "\"player\":\"local\",\"command\":{\"type\":\"addFunds\"}", "\"command\":{\"type\":\"addFunds\"}", "an entry lacks player")]
        [DataRow("an entry with an unknown member", "\"player\":\"local\",", "\"player\":\"local\",\"at\":1,", "an entry has an unknown member at")]
        [DataRow("an entry before step 0", "\"entries\":[{\"step\":0", "\"entries\":[{\"step\":-1", "Entry 0 of the command log is not a {step, player, command}")]
        [DataRow("an entry between steps", "\"entries\":[{\"step\":0", "\"entries\":[{\"step\":0.5", "Entry 0 of the command log is not a {step, player, command}")]
        [DataRow("entries out of order", "\"entries\":[{\"step\":0", "\"entries\":[{\"step\":1", "comes before the entry above it")]
        [DataRow("checkpoints at one step", "{\"step\":2,", "{\"step\":0,", "is not after the one above it")]
        [DataRow("a hash that is not one", "\"},{\"step\":2", "0\"},{\"step\":2", "Checkpoint 0 of the command log is not a {step, hash}")]
        public void Parse_BrokenLog_Throws(string description, string replaced, string replacement, string message)
        {
            string json = ValidLog.Replace(replaced, replacement);
            Assert.AreNotEqual(ValidLog, json, description);

            ConformanceAssert.Broken(() => ConformanceLogs.Parse("broken", json), description, message);
        }

        [TestMethod]
        public void Parse_EntriesNotAList_Throws()
        {
            JsonObject log = JsonNode.Parse(ValidLog)!.AsObject();
            log["entries"] = new JsonObject();

            ConformanceAssert.Broken(() => ConformanceLogs.Parse("broken", log.ToJsonString()), "entries that are no list", "entries are a list");
        }

        [TestMethod]
        public void Parse_NoCheckpoints_Throws()
        {
            string json = ValidLog[..ValidLog.IndexOf("\"checkpoints\"", StringComparison.Ordinal)] + "\"checkpoints\":[]}";

            ConformanceAssert.Broken(() => ConformanceLogs.Parse("broken", json), "a log that checks nothing", "checkpoints is empty");
        }

        // A log built by its commands at step 0, checked there and later
        private static ConformanceLog BuiltByCommands()
        {
            ConformanceLog? log = Logs.FirstOrDefault(log => log.Seed is not null && log.Entries.Count > 0 &&
                                                             log.Entries.All(entry => entry.Step == 0) && log.Checkpoints.Count > 1);

            if (log is null)
            {
                Assert.Fail("These tests need a log from a seed built by commands at step 0, checked there and later.");
            }

            return log;
        }

        private static LogEntry Entry(int step, JsonObject command)
        {
            return new LogEntry(step, "local", command);
        }
    }
}
