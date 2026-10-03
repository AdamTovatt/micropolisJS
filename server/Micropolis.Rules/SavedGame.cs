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

using System.Text.Json;
using System.Text.Json.Nodes;

namespace Micropolis.Rules
{
    /// <summary>
    /// A saved game as the browser stores it, and its migration from an older version to the current one, as
    /// <c>src/savedGame.ts</c> migrates it: the simulation's save beside the game's own keys, the city's name and the
    /// version stamped on it.
    /// </summary>
    /// <remarks>
    /// It migrates from version 5 on, the first that holds the complete simulation state, which this private build has
    /// written since the headless runner came. The steps from versions 1 to 4 stay in TypeScript's
    /// <c>transitionOldSave</c> until the TypeScript simulation is deleted, and an older save is refused, naming its
    /// version.
    /// </remarks>
    public static class SavedGame
    {
        /// <summary>
        /// The oldest version migrated.
        /// </summary>
        public const int OldestVersion = 5;

        // The step that upgrades a save from each version to the next, from OldestVersion on, as UPGRADES in
        // src/savedGame.ts has them from its own: a save is upgraded by every step from its own version's on
        private static readonly IReadOnlyList<Action<JsonObject>> Upgrades =
        [
            // From version 5: the flag for whether the player had followed the donation link, for a donation request
            // the game no longer makes
            savedGame => savedGame.Remove("everClicked"),

            // From version 6: the score breakdown wasn't recorded, so none shows until the next evaluation
            savedGame => Group(savedGame, "evaluation")["cityScoreBreakdown"] = new JsonArray(),

            // From version 7: auto-bulldoze became the player's preference, kept apart from the city, and the year end
            // stopped waiting for the player: a save made while it waited pays it with the values it holds
            UpgradeFromVersion7,

            // From version 8: the worst four problems, with 7 for none, where an evaluation wrote every problem in
            // vote order with null for none past the worst four
            savedGame =>
            {
                JsonObject evaluation = Group(savedGame, "evaluation");
                JsonArray problems = new JsonArray();

                foreach (JsonNode? problem in Array(evaluation, "problemOrder").Take(4))
                {
                    problems.Add(problem is null ? 7 : problem.DeepClone());
                }

                evaluation["problemOrder"] = problems;
            },
        ];

        /// <summary>
        /// The version a save is stamped with now, one past the last step's.
        /// </summary>
        public static int CurrentVersion => OldestVersion + Upgrades.Count;

        // The game's own keys, which a saved game holds beside the simulation's save
        private static readonly IReadOnlyList<string> GameKeys = ["name", "version"];

        /// <summary>
        /// The city a saved game's text holds, migrated to the current version, as <c>SaveFormat.parse</c> reads it
        /// and the city host loads it. A save from before <see cref="OldestVersion"/> or after the current version,
        /// or without a whole version, fails with a <see cref="SaveFormatException"/> naming its version.
        /// </summary>
        public static Simulation Load(string savedGameText, out string name)
        {
            JsonObject savedGame = Migrate(savedGameText);

            name = Validation.TryGetString(savedGame["name"], out string? text)
                ? text!
                : throw new SaveFormatException("name", "must be a string");

            foreach (string key in GameKeys)
            {
                savedGame.Remove(key);
            }

            return Simulation.FromSave(CanonicalJson.Write(savedGame));
        }

        /// <summary>
        /// The saved game the text holds, migrated to the current version and stamped with it.
        /// </summary>
        public static JsonObject Migrate(string savedGameText)
        {
            JsonObject savedGame;

            try
            {
                savedGame = JsonText.Parse(savedGameText) as JsonObject ?? throw new SaveFormatException("state", "must be an object");
            }
            catch (JsonException exception)
            {
                throw new SaveFormatException("state", $"is not JSON: {exception.Message}");
            }

            int version = Version(savedGame);

            foreach (Action<JsonObject> upgrade in Upgrades.Skip(version - OldestVersion))
            {
                upgrade(savedGame);
            }

            savedGame["version"] = CurrentVersion;
            return savedGame;
        }

        private static int Version(JsonObject savedGame)
        {
            JsonNode? node = savedGame["version"];

            if (!Validation.TryGetWholeNumber(node, out double version))
            {
                string found = savedGame.ContainsKey("version") ? CanonicalJson.Stringify(node) : "missing";
                throw new SaveFormatException("version", $"must be a whole number, not {found}");
            }

            if (version < OldestVersion)
            {
                throw new SaveFormatException("version", $"is {version}, older than version {OldestVersion}, the first that holds the complete state: only the TypeScript migrates it");
            }

            if (version > CurrentVersion)
            {
                throw new SaveFormatException("version", $"is {version}, newer than version {CurrentVersion}, the newest there is");
            }

            return (int)version;
        }

        private static void UpgradeFromVersion7(JsonObject savedGame)
        {
            savedGame.Remove("autoBulldoze");

            // The one step that runs a game rule, because no rewriting of the fields can stand in for a year end that
            // never happened
            JsonObject budget = Group(savedGame, "budget");
            bool awaiting = budget["awaitingValues"] is JsonValue value && value.GetValueKind() == JsonValueKind.True;
            budget.Remove("awaitingValues");

            if (awaiting)
            {
                // The budget alone, read as a save reads it
                Budget paying = SavedObject.ReadRoot(new JsonObject { ["budget"] = budget.DeepClone() }.ToJsonString(), saved =>
                {
                    Budget loaded = new Budget();
                    loaded.Load(saved);
                    return loaded;
                });

                paying.DoBudgetNow();
                paying.Save(savedGame);
            }
        }

        private static JsonObject Group(JsonObject savedGame, string key)
        {
            return savedGame[key] as JsonObject ?? throw new SaveFormatException(key, "must be an object");
        }

        private static JsonArray Array(JsonObject group, string key)
        {
            return group[key] as JsonArray ?? throw new SaveFormatException(key, "must be a list");
        }
    }
}
