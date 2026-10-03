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
    /// Reads the members of a conformance file parsed by <see cref="JsonText"/>, as <c>JSON.parse</c> parses it, such
    /// as <c>commands.json</c> and the command logs, whose commands are any JSON: strictly, so a member of the wrong
    /// kind, or one missing or unknown, fails the read.
    /// </summary>
    internal static class ConformanceJson
    {
        /// <summary>
        /// An object that holds every required key, and otherwise only optional ones.
        /// </summary>
        public static JsonObject Members(JsonNode? node, string what, string[] required, string[]? optional = null)
        {
            if (node is not JsonObject value)
            {
                throw Broken($"{what} is not an object");
            }

            string? unknown = value.Select(member => member.Key)
                .FirstOrDefault(key => !required.Contains(key) && !(optional ?? []).Contains(key));
            string? missing = required.FirstOrDefault(key => !value.ContainsKey(key));

            if (unknown is not null || missing is not null)
            {
                throw Broken(unknown is not null ? $"{what} has an unknown member {unknown}" : $"{what} lacks {missing}");
            }

            return value;
        }

        public static IEnumerable<JsonNode?> List(JsonNode? node, string name)
        {
            return node as JsonArray ?? throw Broken($"{name} is not a list");
        }

        public static string String(JsonNode? node, string name)
        {
            return Validation.TryGetString(node, out string? text) ? text! : throw Broken($"{name} is not a string");
        }

        public static long WholeNumber(JsonNode? node, string name, long min, long max)
        {
            return Validation.TryGetWholeNumberIn(node, min, max, out long number) ? number
                : throw Broken($"{name} is not a whole number from {min} to {max}");
        }

        public static InvalidDataException Broken(string problem)
        {
            return new InvalidDataException(problem);
        }
    }
}
