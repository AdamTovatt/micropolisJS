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

using System.Globalization;
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
                // The one sample whose migration runs a game rule, the year end, which another lane ports. The stand-in
                // that throws here goes when that lane merges (PortStandInsTests), and the sample is held then.
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
        [DataRow("a negative version", "-3", "The save's version is -3, older than version 5")]
        [DataRow("a version JavaScript writes with an exponent", "1e21", "The save's version is 1e+21, newer than version 9")]
        [DataRow("a version that is not whole", "5.5", "The save's version must be a whole number, not 5.5")]
        [DataRow("a version that is text", "\"5\"", "The save's version must be a whole number, not a string.")]
        [DataRow("a version that is a list", "[5]", "The save's version must be a whole number, not a list.")]
        [DataRow("a version that is null", "null", "The save's version must be a whole number, not null.")]
        public void Load_SaveOfAnotherVersion_IsRefusedNamingIt(string description, string version, string message)
        {
            string text = Edited("version5.json", savedGame => savedGame["version"] = JsonText.Parse(version));
            CultureInfo culture = CultureInfo.CurrentCulture;

            try
            {
                // A culture that writes numbers unlike JavaScript: a minus sign of its own, and a decimal comma
                CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("sv-SE");

                SaveFormatException exception = Assert.Throws<SaveFormatException>(() => SavedGame.Load(text, out _), description);

                StringAssert.StartsWith(exception.Message, message, description);
            }
            finally
            {
                CultureInfo.CurrentCulture = culture;
            }
        }

        // JSON.parse reads a number too large for a double as infinite, which no save can hold, wherever it is
        [TestMethod]
        [DataRow(null, "version", "The save's state.version is a number too large for a double.")]
        [DataRow("budget", "totalFunds", "The save's state.budget.totalFunds is a number too large for a double.")]
        public void Load_SaveHoldingANumberTooLargeForADouble_IsRefusedNamingWhere(string? group, string key, string message)
        {
            const string Marker = "a number too large for a double";
            string text = Edited("version7.json", savedGame => (group is null ? savedGame : savedGame[group]!.AsObject())[key] = Marker)
                .Replace($"\"{Marker}\"", "1e400");

            SaveFormatException exception = Assert.Throws<SaveFormatException>(() => SavedGame.Load(text, out _));

            Assert.AreEqual(message, exception.Message);
        }

        // As the TypeScript's `if`: the year end is paid for a value JavaScript takes as true, as for true itself, and
        // not for one it takes as false, as for a save that never waited. Each outcome is compared with true's or with
        // the key's absence, whether the payment is ported yet or not.
        [TestMethod]
        [DataRow("1", true)]
        [DataRow("\"yes\"", true)]
        [DataRow("[]", true)]
        [DataRow("{}", true)]
        [DataRow("0", false)]
        [DataRow("\"\"", false)]
        [DataRow("null", false)]
        [DataRow("false", false)]
        public void Load_Version7AwaitingValueThatIsNotBoolean_IsReadAsJavaScriptReadsIt(string awaiting, bool paid)
        {
            string Outcome(Action<JsonObject> editBudget)
            {
                string text = Edited("version7.json", savedGame => editBudget(savedGame["budget"]!.AsObject()));

                try
                {
                    return CanonicalJson.Write(SavedGame.Load(text, out _).Save());
                }
                catch (NotPortedException exception)
                {
                    return $"stopped at {exception.Unit}";
                }
            }

            string expected = paid
                ? Outcome(budget => budget["awaitingValues"] = true)
                : Outcome(budget => budget.Remove("awaitingValues"));

            Assert.AreEqual(expected, Outcome(budget => budget["awaitingValues"] = JsonText.Parse(awaiting)));
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
