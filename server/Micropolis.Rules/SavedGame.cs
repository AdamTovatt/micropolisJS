/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 * Modified in Adam Tovatt's continuation of micropolisJS. Copyright (C) 2026 Adam Tovatt
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
    /// A saved game as the server's store and a save file hold it, and its migration from an older version to the
    /// current one: the simulation's save beside the game's own keys, the city's name and the version stamped on it.
    /// </summary>
    /// <remarks>
    /// It migrates from version 5 on, the first that holds the complete simulation state. An older save is refused,
    /// naming its version.
    /// </remarks>
    public static class SavedGame
    {
        /// <summary>
        /// The oldest version migrated.
        /// </summary>
        public const int OldestVersion = 5;

        // The step that upgrades a save from each version to the next, from OldestVersion on: a save is upgraded by
        // every step from its own version's on
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

                foreach (JsonNode? problem in List(evaluation, "problemOrder").Take(4))
                {
                    problems.Add(problem is null ? 7 : problem.DeepClone());
                }

                evaluation["problemOrder"] = problems;
            },

            // From version 9: sprites were placed and ordered in a frame of the port's own, which no rewriting of the
            // fields turns into the original's, so the sprites in flight are dropped, as the original saves none; the
            // distance getDir last found starts at 0
            savedGame =>
            {
                JsonObject sprites = Group(savedGame, "sprites");
                sprites["list"] = new JsonArray();
                sprites["absDist"] = 0;
            },

            // From version 10: the river spares a monster until it has reached land, and one saved before is taken as
            // ashore, so it keeps the original's rule. An entry that is no sprite is left for the load to refuse.
            savedGame =>
            {
                foreach (JsonObject sprite in List(Group(savedGame, "sprites"), "list").OfType<JsonObject>())
                {
                    sprite["reachedLand"] = Validation.TryGetWholeNumber(sprite["type"], out double type) &&
                                            type == (int)SpriteType.Monster;
                }
            },

            // From version 11: a ship sails to a port on a mission, which every other sprite holds as null; a ship in
            // flight sails in to no port, so it finds the nearest port it reaches, or leaves. An entry that is no sprite
            // is left for the load to refuse.
            savedGame =>
            {
                foreach (JsonObject sprite in List(Group(savedGame, "sprites"), "list").OfType<JsonObject>())
                {
                    bool ship = Validation.TryGetWholeNumber(sprite["type"], out double type) && type == (int)SpriteType.Ship;
                    sprite["mission"] = ship ? new JsonObject { ["phase"] = 0, ["port"] = null, ["dockCount"] = 0 } : null;
                }
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

            return Simulation.FromSave(CanonicalJson.Write(StripGameKeys(savedGame)));
        }

        /// <summary>
        /// Takes the game's own keys, the city's name and the version, out of a saved game, which leaves the bare
        /// saved state, as <see cref="Simulation.Save"/> writes one and a command log holds one, and returns it.
        /// </summary>
        public static JsonObject StripGameKeys(JsonObject savedGame)
        {
            foreach (string key in GameKeys)
            {
                savedGame.Remove(key);
            }

            return savedGame;
        }

        /// <summary>
        /// The text a city is saved as: its name, then what the simulation saves, stamped with the current version,
        /// written as <c>JSON.stringify</c> writes it. The keys and values are those <c>docs/state-hash.md</c> lists;
        /// the order of the keys within a component is no part of the format, and the state hash, sorting them, never
        /// sees it.
        /// </summary>
        public static string Write(string name, Simulation city)
        {
            JsonObject savedGame = new JsonObject { ["name"] = name };

            foreach ((string key, JsonNode? value) in city.Save().ToList())
            {
                savedGame[key] = value?.DeepClone();
            }

            savedGame["version"] = CurrentVersion;
            return CanonicalJson.Stringify(savedGame);
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

            RefuseInfiniteNumbers(savedGame, "state");
            int version = Version(savedGame);

            Upgrade(savedGame, version);
            savedGame["version"] = CurrentVersion;
            return savedGame;
        }

        /// <summary>
        /// A copy of a bare saved state, as <see cref="Simulation.Save"/> writes one, without the game's own keys, such
        /// as a command log holds, brought up from save format <paramref name="version"/> to the current one by the
        /// steps that upgrade a saved game. A version before <see cref="OldestVersion"/> or after the current one fails
        /// with a <see cref="SaveFormatException"/> naming it.
        /// </summary>
        public static JsonObject UpgradeState(JsonObject state, int version)
        {
            JsonObject upgraded = state.DeepClone().AsObject();

            Upgrade(upgraded, CheckedVersion(version));
            return upgraded;
        }

        // Every step from the version's on
        private static void Upgrade(JsonObject savedGame, int version)
        {
            foreach (Action<JsonObject> upgrade in Upgrades.Skip(version - OldestVersion))
            {
                upgrade(savedGame);
            }
        }

        private static int Version(JsonObject savedGame)
        {
            if (!Validation.TryGetWholeNumber(savedGame["version"], out double version))
            {
                throw new SaveFormatException("version", $"must be a whole number, not {Described(savedGame, "version")}");
            }

            return CheckedVersion(version);
        }

        // A whole version, refused before OldestVersion and after the current one
        private static int CheckedVersion(double version)
        {
            string shown = CanonicalJson.FormatNumber(version);

            if (version < OldestVersion)
            {
                throw new SaveFormatException("version", $"is {shown}, older than version {OldestVersion}, the first that holds the complete state");
            }

            if (version > CurrentVersion)
            {
                throw new SaveFormatException("version", $"is {shown}, newer than version {CurrentVersion}, the newest there is");
            }

            return (int)version;
        }

        // What a key of the saved game holds, for a message: a number as JavaScript writes it, and otherwise only what
        // kind of value it is, since the text is untrusted and may be long
        private static string Described(JsonObject savedGame, string key)
        {
            if (!savedGame.ContainsKey(key))
            {
                return "missing";
            }

            return savedGame[key] switch
            {
                null => "null",
                JsonObject => "an object",
                JsonArray => "a list",
                JsonValue value => value.GetValueKind() switch
                {
                    JsonValueKind.Number when JsonNumber.TryGetDouble(value, out double number) => CanonicalJson.FormatNumber(number),
                    JsonValueKind.String => "a string",
                    _ => "true or false",
                },
                _ => throw new InvalidOperationException($"No description of a {savedGame[key]!.GetType().Name}."),
            };
        }

        // A number too large for a double, which JSON.parse reads as infinite, has no place in a save: neither the
        // state's canonical text nor JSON.stringify can write it
        private static void RefuseInfiniteNumbers(JsonNode? node, string path)
        {
            switch (node)
            {
                case JsonObject members:
                    foreach (KeyValuePair<string, JsonNode?> member in members)
                    {
                        RefuseInfiniteNumbers(member.Value, $"{path}.{Excerpt(member.Key)}");
                    }

                    break;

                case JsonArray items:
                    for (int i = 0; i < items.Count; i++)
                    {
                        RefuseInfiniteNumbers(items[i], $"{path}[{i}]");
                    }

                    break;

                case JsonValue value when value.GetValueKind() == JsonValueKind.Number &&
                                          JsonNumber.TryGetDouble(value, out double number) && !double.IsFinite(number):
                    throw new SaveFormatException(path, "is a number too large for a double");
            }
        }

        // A key of the save as a message names it, cut short if it is long
        private static string Excerpt(string key)
        {
            const int Longest = 40;
            return key.Length <= Longest ? key : key[..Longest] + "…";
        }

        private static void UpgradeFromVersion7(JsonObject savedGame)
        {
            savedGame.Remove("autoBulldoze");

            // The one step that runs a game rule, because no rewriting of the fields can stand in for a year end that
            // never happened
            JsonObject budget = Group(savedGame, "budget");
            bool awaiting = Validation.IsTruthy(budget["awaitingValues"]);
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

        private static JsonArray List(JsonObject group, string key)
        {
            return group[key] as JsonArray ?? throw new SaveFormatException(key, "must be a list");
        }
    }
}
