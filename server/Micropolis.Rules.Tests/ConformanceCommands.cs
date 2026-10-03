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
using static Micropolis.Rules.Tests.ConformanceJson;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The commands the TypeScript reference applied in <c>conformance/commands.json</c>: each case's commands applied
    /// in order to one city, with the result the simulation gave each and the state hash it left.
    /// </summary>
    public static class ConformanceCommands
    {
        public static IReadOnlyList<CommandCase> Load()
        {
            return Parse(ConformanceFile.Read("commands.json"));
        }

        /// <summary>
        /// The cases, read as <c>JSON.parse</c> reads them, since the commands are any JSON, keys a System.Text.Json
        /// reader refuses included.
        /// </summary>
        public static IReadOnlyList<CommandCase> Parse(string json)
        {
            JsonObject file = Members(JsonText.Parse(json), "the file", ["cases"]);
            List<CommandCase> cases = List(file["cases"], "cases").Select(ReadCase).ToList();
            ConformanceFile.NonEmpty("cases", cases);
            return cases;
        }

        private static CommandCase ReadCase(JsonNode? node)
        {
            JsonObject commandCase = Members(node, "a case", ["description", "results", "hash"], ["fixture", "state"]);
            string description = String(commandCase["description"], "description");
            List<JsonObject> results = List(commandCase["results"], "results")
                .Select(result => Members(result, "a result", ["player", "command", "outcome", "reason"]))
                .ToList();
            ConformanceFile.NonEmpty("results", results);

            string? fixture = commandCase.ContainsKey("fixture") ? String(commandCase["fixture"], "fixture") : null;
            JsonObject? state = commandCase.ContainsKey("state") ? commandCase["state"] as JsonObject ?? throw Broken("state is not an object") : null;

            if ((fixture is null) == (state is null))
            {
                throw Broken($"The case \"{description}\" names a fixture or holds a state: exactly one.");
            }

            return new CommandCase(description, results, String(commandCase["hash"], "hash"), fixture, state);
        }
    }

    /// <summary>
    /// One case of <c>commands.json</c>: the city it starts from, a fixture's built save or the state it holds, and each
    /// command's result, the payload of the result event, which carries the command as it arrived.
    /// </summary>
    public sealed record CommandCase(string Description, IReadOnlyList<JsonObject> Results, string Hash, string? Fixture = null, JsonObject? State = null)
    {
        /// <summary>
        /// The text of the saved state the commands apply to.
        /// </summary>
        public string ReadStartText()
        {
            return Fixture is null ? CanonicalJson.Write(State) : ConformanceFile.Read($"saves/{Fixture}.built.json");
        }

        public override string ToString()
        {
            return Description;
        }
    }
}
