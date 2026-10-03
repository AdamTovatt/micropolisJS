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
    /// The migration of saved games against the sample saves under <c>conformance/saveVersions/</c>, one or more of
    /// each version from 5 on, frozen as the game wrote them, and the state the TypeScript's migration loads each to,
    /// which <c>conformance/migrated/</c> holds.
    /// </summary>
    [TestClass]
    public sealed class SavedGameTests
    {
        private const string AwaitingBudgetSample = "version7AwaitingBudget.json";

        public static IEnumerable<object[]> Samples => Directory.GetFiles(RepositoryFiles.GetPath("conformance/saveVersions"), "*.json")
            .Order(StringComparer.Ordinal)
            .Select(path => new object[] { Path.GetFileName(path) });

        [TestMethod]
        [DynamicData(nameof(Samples))]
        public void Load_SampleSave_IsTheStateTypeScriptMigratesItTo(string fileName)
        {
            string expected = ConformanceFile.Read($"migrated/{fileName}");
            Simulation city;
            string name;

            try
            {
                city = SavedGame.Load(ConformanceFile.Read($"saveVersions/{fileName}"), out name);
            }
            catch (NotPortedException exception) when (fileName == AwaitingBudgetSample && exception.Unit == "budget.doBudgetNow")
            {
                // The one sample whose migration runs a game rule, the year end, which another lane ports
                Assert.Inconclusive($"{exception.Unit} is not ported yet.");
                return;
            }

            Assert.AreEqual("Sample", name);
            JsonObject state = city.Save();

            if (CanonicalJson.Write(state) != expected)
            {
                Assert.Fail(SnapshotComparison.StateDifference(JsonNode.Parse(expected)!, state, city) ?? "The states differ.");
            }
        }

        // Every version from the oldest migrated to the current one has a sample, so a new version can't go untested
        [TestMethod]
        public void Samples_EveryVersionFromTheOldest_HasOne()
        {
            HashSet<int> versions = Samples
                .Select(sample => (int)(double)JsonText.Parse(ConformanceFile.Read($"saveVersions/{sample[0]}"))!["version"]!)
                .ToHashSet();

            CollectionAssert.AreEquivalent(Enumerable.Range(SavedGame.OldestVersion, SavedGame.CurrentVersion - SavedGame.OldestVersion + 1).ToList(),
                                           versions.ToList());
        }

        [TestMethod]
        public void Migrate_CurrentSave_IsUnchanged()
        {
            string text = ConformanceFile.Read($"saveVersions/version{SavedGame.CurrentVersion}.json");

            Assert.AreEqual(CanonicalJson.Write(JsonText.Parse(text)), CanonicalJson.Write(SavedGame.Migrate(text)));
        }

        [TestMethod]
        [DataRow("an older version", "4", "The save's version is 4, older than version 5")]
        [DataRow("the first version", "1", "The save's version is 1, older than version 5")]
        [DataRow("a newer version", "10", "The save's version is 10, newer than version 9")]
        [DataRow("a version that is not whole", "5.5", "The save's version must be a whole number, not 5.5")]
        [DataRow("a version that is text", "\"5\"", "The save's version must be a whole number, not \"5\"")]
        public void Load_SaveOfAnotherVersion_IsRefusedNamingIt(string description, string version, string message)
        {
            string text = Edited("version5.json", savedGame => savedGame["version"] = JsonText.Parse(version));

            SaveFormatException exception = Assert.Throws<SaveFormatException>(() => SavedGame.Load(text, out _), description);

            StringAssert.StartsWith(exception.Message, message, description);
        }

        [TestMethod]
        public void Load_SaveWithoutAVersion_IsRefused()
        {
            string text = Edited("version5.json", savedGame => savedGame.Remove("version"));

            SaveFormatException exception = Assert.Throws<SaveFormatException>(() => SavedGame.Load(text, out _));

            StringAssert.StartsWith(exception.Message, "The save's version must be a whole number, not missing");
        }

        // A sample with one key replaced, or removed when the replacement is null: at the top of the saved game, or in
        // one of its groups
        [TestMethod]
        [DataRow("version9.json", null, "name", "5", "The save's name must be a string.")]
        [DataRow("version9.json", null, "name", null, "The save's name must be a string.")]
        [DataRow("version6.json", null, "evaluation", null, "The save's evaluation must be an object.")]
        [DataRow("version7.json", null, "budget", "[]", "The save's budget must be an object.")]
        [DataRow("version8.json", "evaluation", "problemOrder", null, "The save's problemOrder must be a list.")]
        public void Load_SaveMissingWhatItsMigrationReads_IsRefusedNamingIt(string sample, string? group, string key, string? replacement, string message)
        {
            string text = Edited(sample, savedGame =>
            {
                JsonObject container = group is null ? savedGame : savedGame[group]!.AsObject();

                if (replacement is null)
                {
                    container.Remove(key);
                }
                else
                {
                    container[key] = JsonText.Parse(replacement);
                }
            });

            SaveFormatException exception = Assert.Throws<SaveFormatException>(() => SavedGame.Load(text, out _));

            Assert.AreEqual(message, exception.Message);
        }

        [TestMethod]
        [DataRow("{", "The save's state is not JSON")]
        [DataRow("", "The save's state is not JSON")]
        [DataRow("[]", "The save's state must be an object.")]
        [DataRow("null", "The save's state must be an object.")]
        public void Load_TextThatIsNoSavedGame_IsRefused(string text, string message)
        {
            SaveFormatException exception = Assert.Throws<SaveFormatException>(() => SavedGame.Load(text, out _));

            StringAssert.StartsWith(exception.Message, message);
        }

        // A sample's text with the saved game edited as parsed, so the edit doesn't depend on how the sample is laid out
        private static string Edited(string sample, Action<JsonObject> edit)
        {
            JsonObject savedGame = JsonText.Parse(ConformanceFile.Read($"saveVersions/{sample}"))!.AsObject();
            edit(savedGame);
            return CanonicalJson.Write(savedGame);
        }
    }
}
