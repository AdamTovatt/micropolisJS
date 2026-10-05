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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// Every command log under <c>conformance/logs/</c> replays to the state hash at each of its checkpoints.
    /// </summary>
    [TestClass]
    public sealed class LogReplayTests
    {
        private static readonly IReadOnlyList<ConformanceLog> Logs = ConformanceLogs.Load();

        // A log from a seed, built by commands at step 0 and checked there and after its run
        private const string ValidLog =
            "{\"formatVersion\":2,\"seed\":0,\"level\":0," +
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
            Assert.IsTrue(Logs.Any(log => log.Log.Start is SeedStart), "No log starts from a seed.");
            Assert.IsTrue(Logs.Any(log => log.Log.Start is SaveStart), "No log starts from a save.");
        }

        // A command applied a step early or late moves the hash where it should have applied, which only a checkpoint
        // taken there can see
        [TestMethod]
        public void Load_SharedLogs_CheckACommandPartwayThroughARunWhereItApplies()
        {
            Assert.IsTrue(Logs.Any(log => log.Log.Entries.Any(entry => entry.Step > 0 && log.Log.Checkpoints.Any(checkpoint => checkpoint.Step == entry.Step))),
                          "No log checks a command sent partway through its run at the step it applies.");
        }

        // Each disaster a player triggers, then the city running on from it, as only a log shows
        [TestMethod]
        public void Load_SharedLogs_TriggerEveryDisasterPartwayThroughARun()
        {
            HashSet<string> triggered = Logs
                .SelectMany(log => log.Log.Entries.Where(entry => entry.Step > 0 && entry.Step < log.Log.LastStep))
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

            string? difference = LogReplayer.FirstDifference(WithEntries(log, log.Log.Entries.Skip(1).ToList()));

            StringAssert.StartsWith(difference, "At step 0 the replay's state hash is ");
        }

        // The check can fail on a command after the city's first step, which only a later checkpoint sees
        [TestMethod]
        public void FirstDifference_FundsAddedAtStep1_NamesTheNextCheckpoint()
        {
            ConformanceLog log = BuiltByCommands();

            string? difference = LogReplayer.FirstDifference(WithEntries(log, [.. log.Log.Entries, Entry(1, new JsonObject { ["type"] = "addFunds" })]));

            StringAssert.StartsWith(difference, $"At step {log.Log.Checkpoints[1].Step} the replay's state hash is ");
        }

        // A version 1 log says no save format version, and its save is read as version 10, the version current when
        // logs began to say it, which is history and never moves with the current version. Once a later version is
        // current, the replay upgrades that save, as it does a version 2 log's that says 10
        [TestMethod]
        public void Verify_SameCityLoggedAtVersion1_ReachesTheSameCheckpoints()
        {
            ConformanceLog? fromSave = Logs.FirstOrDefault(log => log.Log.Start is SaveStart { SaveVersion: 10 });
            Assert.IsNotNull(fromSave, "This test needs a log from a save of version 10.");
            JsonObject versionOne = fromSave.Log.ToJson();
            versionOne["formatVersion"] = 1;
            versionOne.Remove("saveVersion");

            CommandLog read = CommandLog.Read(versionOne);

            Assert.AreEqual(10, ((SaveStart)read.Start).SaveVersion);
            // Verify fails on the first checkpoint whose hash differs, and these are the version 2 log's
            LogReplay.Verify(read);
        }

        // A log keeps a save as it was written, so a save from before an upgrade step was added replays through that
        // step: the city it starts is the one the save of the version before the current one loads as
        [TestMethod]
        public void Verify_SaveOfThePreviousVersion_ReplaysUpgradedToTheCityItLoadsAs()
        {
            // One cycle of the simulation's 16 phases at medium speed, which the samples are saved at, so every phase's
            // work runs on the city as loaded
            const int Steps = 48;
            int previous = SavedGame.CurrentVersion - 1;
            string sample = ConformanceFile.Read($"saveVersions/version{previous}.json");
            JsonObject state = SavedGame.StripGameKeys(JsonText.Parse(sample)!.AsObject());
            IReadOnlyList<Checkpoint> loaded = LogReplay.Run(SaveStart.Of(SavedGame.Load(sample, out _)), [], [0, Steps], Steps).Hashed;

            // Verify fails on the first checkpoint whose hash differs from the city the sample loads as
            LogReplay.Verify(new CommandLog(null, new SaveStart(state, previous), [], loaded));

            // And the upgrade is what made it so: read as the current version, the save loads no city, or another one
            Exception unupgraded = Assert.Throws<Exception>(
                () => LogReplay.Verify(new CommandLog(null, new SaveStart(state, SavedGame.CurrentVersion), [], loaded)));
            Assert.IsTrue(unupgraded is SaveFormatException or ReplayDiffersException, unupgraded.ToString());
        }

        [TestMethod]
        public void FirstDifference_PausedAtStep1_SaysTheLogStepsAPausedCity()
        {
            ConformanceLog log = BuiltByCommands();
            JsonObject pause = new JsonObject { ["type"] = "setSpeed", ["speed"] = (int)Speed.Paused };

            string? difference = LogReplayer.FirstDifference(WithEntries(log, [.. log.Log.Entries, Entry(1, pause)]));

            Assert.AreEqual($"The log steps a paused city, from step 1 to step {log.Log.LastStep}", difference);
        }

        // Only what the conformance reader refuses beyond CommandLog.Parse, whose own tests cover the rest
        [TestMethod]
        [DataRow("a log with an unknown member", "\"seed\":0,", "\"seed\":0,\"speed\":2,", "unknown member speed")]
        [DataRow("a log from a seed at no level", "\"level\":0,", "", "a level with a seed, and only then")]
        [DataRow("a log from a save at a level", "\"seed\":0,", "\"save\":{},", "a level with a seed, and only then")]
        [DataRow("a log from a seed with a save version", "\"seed\":0,", "\"seed\":0,\"saveVersion\":10,", "a saveVersion with a save, and only then")]
        [DataRow("a log from a save without its version", "\"seed\":0,\"level\":0,", "\"save\":{},", "a saveVersion with a save, and only then")]
        [DataRow("an entry without its player", "\"player\":\"local\",\"command\":{\"type\":\"addFunds\"}", "\"command\":{\"type\":\"addFunds\"}", "an entry lacks player")]
        [DataRow("an entry with an unknown member", "\"player\":\"local\",", "\"player\":\"local\",\"at\":1,", "an entry has an unknown member at")]
        [DataRow("a checkpoint with an unknown member", "{\"step\":2,", "{\"step\":2,\"at\":1,", "a checkpoint has an unknown member at")]
        public void Parse_BrokenLog_Throws(string description, string replaced, string replacement, string message)
        {
            string json = ValidLog.Replace(replaced, replacement);
            Assert.AreNotEqual(ValidLog, json, description);

            ConformanceAssert.Broken(() => ConformanceLogs.Parse("broken", json), description, message);
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
            ConformanceLog? log = Logs.FirstOrDefault(log => log.Log.Start is SeedStart && log.Log.Entries.Count > 0 &&
                                                             log.Log.Entries.All(entry => entry.Step == 0) && log.Log.Checkpoints.Count > 1);

            if (log is null)
            {
                Assert.Fail("These tests need a log from a seed built by commands at step 0, checked there and later.");
            }

            return log;
        }

        private static ConformanceLog WithEntries(ConformanceLog log, IReadOnlyList<LoggedCommand> entries)
        {
            return log with { Log = log.Log with { Entries = entries } };
        }

        private static LoggedCommand Entry(int step, JsonObject command)
        {
            return new LoggedCommand(step, PlayerIds.Local, command);
        }
    }
}
