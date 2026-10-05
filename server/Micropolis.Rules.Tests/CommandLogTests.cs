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
    [TestClass]
    public sealed class CommandLogTests
    {
        private const string Hash = "511c4154dd1a7184ac5f0ef97f91cf3b3886e9df0c03d1156372c701d43a8420";

        private const string ValidLog =
            "{\"formatVersion\":2,\"description\":\"d\",\"seed\":8,\"level\":2," +
            "\"entries\":[{\"step\":0,\"player\":\"local\",\"command\":{\"type\":\"addFunds\"}}]," +
            "\"checkpoints\":[{\"step\":3,\"hash\":\"" + Hash + "\"}]}";

        public static IEnumerable<object[]> CommittedLogs => ConformanceLogs.Files().Select(file => new object[] { file });

        // A log is written as the conformance files lay it out, so each committed log reads and writes back unchanged
        [TestMethod]
        [DynamicData(nameof(CommittedLogs))]
        public void Write_CommittedLogParsed_GivesItsTextBack(string file)
        {
            string text = ConformanceLogs.Read(file);

            Assert.AreEqual(text, CommandLog.Parse(text).Write());
        }

        [TestMethod]
        public void Parse_ValidLog_ReadsItsStartEntriesAndCheckpoints()
        {
            CommandLog log = CommandLog.Parse(ValidLog);

            Assert.AreEqual("d", log.Description);
            Assert.AreEqual(new SeedStart(8, Level.Hard), log.Start);
            Assert.HasCount(1, log.Entries);
            Assert.AreEqual(PlayerIds.Local, log.Entries[0].Player);
            Assert.AreEqual("{\"type\":\"addFunds\"}", log.Entries[0].Command!.ToJsonString());
            Assert.AreEqual(new Checkpoint(3, Hash), log.Checkpoints.Single());
            Assert.AreEqual(3, log.LastStep);
        }

        [TestMethod]
        public void Parse_LogFromASave_ReadsTheSaveAndItsVersion()
        {
            CommandLog log = CommandLog.Parse(ValidLog.Replace("\"seed\":8,\"level\":2,", "\"saveVersion\":7,\"save\":{\"simulation\":{}},"));

            SaveStart start = (SaveStart)log.Start;
            Assert.AreEqual("{\"simulation\":{}}", start.Save.ToJsonString());
            Assert.AreEqual(7, start.SaveVersion);
        }

        // A version 1 log says no save format version, so any it gives is ignored
        [TestMethod]
        [DataRow("{\"simulation\":{}}", DisplayName = "no save version")]
        [DataRow("{\"simulation\":{}},\"saveVersion\":7", DisplayName = "a save version")]
        public void Parse_Version1LogFromASave_ReadsTheSaveAsTheVersionOneSaveVersion(string save)
        {
            string text = ValidLog.Replace("\"formatVersion\":2,", "\"formatVersion\":1,").Replace("\"seed\":8,\"level\":2,", $"\"save\":{save},");

            CommandLog log = CommandLog.Parse(text);

            Assert.AreEqual(CommandLog.VersionOneSaveVersion, ((SaveStart)log.Start).SaveVersion);
        }

        [TestMethod]
        public void Write_LogFromASave_WritesItsVersionBesideIt()
        {
            CommandLog log = new CommandLog(null, new SaveStart(new JsonObject { ["simulation"] = new JsonObject() }, 7), [], [new Checkpoint(0, Hash)]);

            Assert.AreEqual(
                "{\n  \"formatVersion\": 2,\n  \"saveVersion\": 7,\n  \"save\": {\"simulation\":{}},\n  \"entries\": [],\n  \"checkpoints\": [\n" +
                $"    {{\"step\":0,\"hash\":\"{Hash}\"}}\n  ]\n}}\n",
                log.Write());
        }

        [TestMethod]
        public void Parse_WrittenLogFromASave_WritesItBack()
        {
            string text = new CommandLog(null, new SaveStart(new JsonObject { ["simulation"] = new JsonObject() }, 7), [], [new Checkpoint(0, Hash)]).Write();

            Assert.AreEqual(text, CommandLog.Parse(text).Write());
        }

        // A log holds no other key, and a saveVersion beside a seed is one
        [TestMethod]
        public void Parse_LogFromASeedWithASaveVersion_IgnoresIt()
        {
            CommandLog log = CommandLog.Parse(ValidLog.Replace("\"seed\":8,", "\"seed\":8,\"saveVersion\":3,"));

            Assert.AreEqual(new SeedStart(8, Level.Hard), log.Start);
        }

        // The server counts steps as a long, which a log holds up to the largest safe integer, CommandLog.MaxStep
        [TestMethod]
        [DataRow(2147483648L, DisplayName = "past int")]
        [DataRow(CommandLog.MaxStep, DisplayName = "2^53 - 1")]
        public void Parse_StepPastInt_ReadsIt(long step)
        {
            CommandLog log = CommandLog.Parse(ValidLog.Replace("{\"step\":3,", $"{{\"step\":{step},"));

            Assert.AreEqual(step, log.Checkpoints.Single().Step);
            Assert.AreEqual(step, log.LastStep);
        }

        [TestMethod]
        public void ToJson_Log_ReadsBackAsTheLogItWrites()
        {
            CommandLog log = CommandLog.Parse(ValidLog);

            JsonObject json = log.ToJson();

            Assert.AreEqual(ValidLog, json.ToJsonString());
            // Read from the object as built, whose numbers are ints and longs rather than parsed text, as the server's are
            Assert.AreEqual(log.Write(), CommandLog.Read(json).Write());
        }

        [TestMethod]
        public void Write_LogWithNoEntries_WritesAnEmptyList()
        {
            CommandLog log = new CommandLog(null, new SeedStart(1, Level.Easy), [], [new Checkpoint(0, Hash)]);

            Assert.AreEqual(
                "{\n  \"formatVersion\": 2,\n  \"seed\": 1,\n  \"level\": 0,\n  \"entries\": [],\n  \"checkpoints\": [\n" +
                $"    {{\"step\":0,\"hash\":\"{Hash}\"}}\n  ]\n}}\n",
                log.Write());
        }

        [TestMethod]
        [DataRow("a later version", "\"formatVersion\":2,", "\"formatVersion\":3,", "This is a version 3 command log: only versions 1 to 2")]
        [DataRow("version 0", "\"formatVersion\":2,", "\"formatVersion\":0,", "This is a version 0 command log")]
        [DataRow("no version", "\"formatVersion\":2,", "", "This is a version undefined command log")]
        [DataRow("a save without its version", "\"seed\":8,\"level\":2,", "\"save\":{},", "A command log's save has a saveVersion")]
        [DataRow("a save version before the oldest", "\"seed\":8,\"level\":2,", "\"saveVersion\":4,\"save\":{},", "A command log's save has a saveVersion")]
        [DataRow("a save version past the current", "\"seed\":8,\"level\":2,", "\"saveVersion\":1000,\"save\":{},", "A command log's save has a saveVersion")]
        [DataRow("a save version between versions", "\"seed\":8,\"level\":2,", "\"saveVersion\":7.5,\"save\":{},", "A command log's save has a saveVersion")]
        [DataRow("a seed and a save", "\"seed\":8,", "\"seed\":8,\"save\":{},", "exactly one of seed or save")]
        [DataRow("neither a seed nor a save", "\"seed\":8,\"level\":2,", "", "exactly one of seed or save")]
        [DataRow("a save that is no object", "\"seed\":8,\"level\":2,", "\"save\":[],", "A command log's save is an object")]
        [DataRow("a seed past uint32", "\"seed\":8,", "\"seed\":4294967296,", "the seed, a uint32, and the level, 0 to 2")]
        [DataRow("a level past hard", "\"level\":2,", "\"level\":3,", "the seed, a uint32, and the level, 0 to 2")]
        [DataRow("a description that is no string", "\"description\":\"d\",", "\"description\":1,", "description is a string")]
        [DataRow("entries that are no list", "\"entries\":[{\"step\":0,\"player\":\"local\",\"command\":{\"type\":\"addFunds\"}}]",
                 "\"entries\":{}", "A command log's entries are a list")]
        [DataRow("checkpoints that are no list", "\"checkpoints\":[{\"step\":3,\"hash\":\"" + Hash + "\"}]", "\"checkpoints\":3",
                 "A command log's checkpoints are a list")]
        [DataRow("an entry without a player", "\"player\":\"local\",", "", "Entry 0 of the command log is not a {step, player, command}")]
        [DataRow("an entry before step 0", "{\"step\":0,\"player\"", "{\"step\":-1,\"player\"", "Entry 0 of the command log is not a {step, player, command}")]
        [DataRow("an entry between steps", "{\"step\":0,\"player\"", "{\"step\":0.5,\"player\"", "Entry 0 of the command log is not a {step, player, command}")]
        [DataRow("a checkpoint past 2^53 - 1", "{\"step\":3,\"hash\"", "{\"step\":9007199254740992,\"hash\"",
                 "Checkpoint 0 of the command log is not a {step, hash}")]
        [DataRow("an entry without a command", ",\"command\":{\"type\":\"addFunds\"}", "", "Entry 0 of the command log is not a {step, player, command}")]
        [DataRow("an entry before the one above it", "{\"step\":0,\"player\"",
                 "{\"step\":1,\"player\":\"local\",\"command\":null},{\"step\":0,\"player\"", "Entry 1 of the command log, at step 0, comes before")]
        [DataRow("a hash that isn't SHA-256", Hash, "abc", "Checkpoint 0 of the command log is not a {step, hash}")]
        [DataRow("checkpoints at one step", "{\"step\":3,\"hash\":\"" + Hash + "\"}",
                 "{\"step\":3,\"hash\":\"" + Hash + "\"},{\"step\":3,\"hash\":\"" + Hash + "\"}", "Checkpoint 1 of the command log, at step 3, is not after")]
        public void Parse_BrokenLog_ThrowsNamingTheProblem(string description, string replaced, string replacement, string problem)
        {
            string text = ValidLog.Replace(replaced, replacement);
            Assert.AreNotEqual(ValidLog, text, "The replacement changed nothing.");

            InvalidDataException exception = Assert.ThrowsExactly<InvalidDataException>(() => CommandLog.Parse(text), description);

            StringAssert.Contains(exception.Message, problem);
        }

        [TestMethod]
        [DataRow("not JSON", "{", "A command log is JSON")]
        [DataRow("a list", "[]", "A command log is a JSON object")]
        public void Parse_NoLogObject_ThrowsNamingTheProblem(string description, string text, string problem)
        {
            InvalidDataException exception = Assert.ThrowsExactly<InvalidDataException>(() => CommandLog.Parse(text), description);

            StringAssert.Contains(exception.Message, problem);
        }
    }
}
