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
    /// The checks the simulation reads untrusted JSON with, as <c>src/validation.ts</c>: the commands a player sends,
    /// and saved games.
    /// </summary>
    internal static class Validation
    {
        /// <summary>
        /// A message's fields but its type, each true when required and false when optional.
        /// </summary>
        public static IReadOnlyDictionary<string, bool> Fields(IReadOnlyList<string>? required = null, IReadOnlyList<string>? optional = null)
        {
            Dictionary<string, bool> fields = new Dictionary<string, bool>(StringComparer.Ordinal);

            foreach (string field in required ?? [])
            {
                fields[field] = true;
            }

            foreach (string field in optional ?? [])
            {
                fields[field] = false;
            }

            return fields;
        }

        /// <summary>
        /// Whether the keys, but <paramref name="leaveOut"/> when it isn't null, are every required field and
        /// otherwise only optional ones.
        /// </summary>
        public static bool HasFields(JsonObject value, IReadOnlyDictionary<string, bool> rules, string? leaveOut)
        {
            List<string> keys = value.Select(member => member.Key).Where(key => key != leaveOut).ToList();

            return rules.Where(rule => rule.Value).All(rule => keys.Contains(rule.Key)) && keys.All(rules.ContainsKey);
        }

        /// <summary>
        /// The reason a message with the wrong fields is rejected: its type's required fields, and the optional ones it
        /// may have.
        /// </summary>
        public static string FieldsReason(string what, IReadOnlyDictionary<string, bool> rules)
        {
            List<string> required = FieldsWith(rules, true);
            List<string> optional = FieldsWith(rules, false);

            return $"{what} has exactly the fields {string.Join(", ", new[] { "type" }.Concat(required))}" +
                   (optional.Count == 0 ? "" : $", and may have {string.Join(", ", optional)}");
        }

        /// <summary>
        /// Whether a value holds objects and lists nested more than <paramref name="levels"/> deep, the value itself
        /// the first. It looks no deeper than the limit.
        /// </summary>
        public static bool NestsDeeperThan(JsonNode? value, int levels)
        {
            if (value is not (JsonObject or JsonArray))
            {
                return false;
            }

            IEnumerable<JsonNode?> children = value is JsonObject members ? members.Select(member => member.Value) : value.AsArray();
            return levels == 0 || children.Any(child => NestsDeeperThan(child, levels - 1));
        }

        public static bool TryGetString(JsonNode? value, out string? text)
        {
            if (value is JsonValue jsonValue && jsonValue.GetValueKind() == JsonValueKind.String)
            {
                text = JsonString.Get(jsonValue);
                return true;
            }

            text = null;
            return false;
        }

        public static bool TryGetBoolean(JsonNode? value, out bool boolean)
        {
            JsonValueKind kind = value is JsonValue jsonValue ? jsonValue.GetValueKind() : JsonValueKind.Undefined;
            boolean = kind == JsonValueKind.True;
            return kind is JsonValueKind.True or JsonValueKind.False;
        }

        /// <summary>
        /// A JSON number that is a whole number, as <c>Number.isInteger</c> takes it.
        /// </summary>
        public static bool TryGetWholeNumber(JsonNode? value, out double number)
        {
            number = 0;
            return value is JsonValue jsonValue && jsonValue.GetValueKind() == JsonValueKind.Number &&
                   JsonNumber.TryGetDouble(jsonValue, out number) && double.IsFinite(number) && Math.Floor(number) == number;
        }

        public static bool TryGetWholeNumberIn(JsonNode? value, long min, long max, out long number)
        {
            bool inRange = TryGetWholeNumber(value, out double whole) && whole >= min && whole <= max;
            number = inRange ? (long)whole : 0;
            return inRange;
        }

        /// <summary>
        /// One of an enumeration's names as the protocol writes it.
        /// </summary>
        public static bool TryGetName<TEnum>(JsonNode? value, out TEnum name) where TEnum : struct, Enum
        {
            name = default;
            return TryGetString(value, out string? text) && ProtocolJson.TryParseName(text!, out name);
        }

        private static List<string> FieldsWith(IReadOnlyDictionary<string, bool> rules, bool required)
        {
            List<string> fields = rules.Where(rule => rule.Value == required).Select(rule => rule.Key).ToList();
            fields.Sort(string.CompareOrdinal);
            return fields;
        }
    }
}
