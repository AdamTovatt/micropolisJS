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
    /// A JSON number as the double it is in JavaScript, whether parsed from text or written by the state model.
    /// </summary>
    internal static class JsonNumber
    {
        // A number parsed from text, or one the state model wrote as an int, a uint, a long or a double. An int, which
        // most of a save's numbers are, is tried first: a parsed integer read as one is the double its text parses to.
        public static bool TryGetDouble(JsonValue value, out double number)
        {
            if (value.TryGetValue(out int intValue))
            {
                number = intValue;
                return true;
            }

            if (value.TryGetValue(out JsonElement element) && element.ValueKind == JsonValueKind.Number)
            {
                number = element.GetDouble();
                return true;
            }

            if (value.TryGetValue(out uint uintValue))
            {
                number = uintValue;
                return true;
            }

            if (value.TryGetValue(out long longValue))
            {
                number = longValue;
                return true;
            }

            if (value.TryGetValue(out double doubleValue))
            {
                number = doubleValue;
                return true;
            }

            number = 0;
            return false;
        }
    }
}
