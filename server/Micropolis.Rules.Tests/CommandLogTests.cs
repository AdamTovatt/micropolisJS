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

namespace Micropolis.Rules.Tests
{
    [TestClass]
    public sealed class CommandLogTests
    {
        private const string Hash = "511c4154dd1a7184ac5f0ef97f91cf3b3886e9df0c03d1156372c701d43a8420";

        private const string ValidLog =
            "{\"formatVersion\":1,\"description\":\"d\",\"seed\":8,\"level\":2," +
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
        public void Parse_LogFromASave_ReadsTheSave()
        {
            CommandLog log = CommandLog.Parse(ValidLog.Replace("\"seed\":8,\"level\":2,", "\"save\":{\"simulation\":{}},"));

            Assert.AreEqual("{\"simulation\":{}}", ((SaveStart)log.Start).Save.ToJsonString());
        }

        [TestMethod]
        public void Write_LogWithNoEntries_WritesAnEmptyList()
        {
            CommandLog log = new CommandLog(null, new SeedStart(1, Level.Easy), [], [new Checkpoint(0, Hash)]);

            Assert.AreEqual(
                "{\n  \"formatVersion\": 1,\n  \"seed\": 1,\n  \"level\": 0,\n  \"entries\": [],\n  \"checkpoints\": [\n" +
                $"    {{\"step\":0,\"hash\":\"{Hash}\"}}\n  ]\n}}\n",
                log.Write());
        }

        [TestMethod]
        [DataRow("another version", "\"formatVersion\":1,", "\"formatVersion\":2,", "This is a version 2 command log")]
        [DataRow("no version", "\"formatVersion\":1,", "", "This is a version undefined command log")]
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
