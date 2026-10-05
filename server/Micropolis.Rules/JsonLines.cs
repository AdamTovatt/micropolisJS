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

using System.Text;
using System.Text.Json.Nodes;

namespace Micropolis.Rules
{
    /// <summary>
    /// A JSON object laid out a member to a line, and a list member one of its values to a line, as the command logs
    /// and the conformance files are, so a diff shows which value moved: each value as ECMAScript's
    /// <c>JSON.stringify</c> writes it (<see cref="CanonicalJson.Stringify"/>), and a line feed after every line.
    /// </summary>
    public static class JsonLines
    {
        /// <summary>
        /// The member's line, followed by a comma unless it is the <paramref name="last"/> member.
        /// </summary>
        public static string Member(string key, JsonNode? value, bool last)
        {
            return $"  {CanonicalJson.Stringify(key)}: {CanonicalJson.Stringify(value)}{(last ? "" : ",")}";
        }

        /// <summary>
        /// The lines of a member whose value is a list, one value to a line, followed by a comma unless it is the
        /// <paramref name="last"/> member.
        /// </summary>
        public static IReadOnlyList<string> ListMember(string key, IReadOnlyList<JsonNode?> values, bool last)
        {
            return ListMemberOfText(key, values.Select(value => CanonicalJson.Stringify(value)).ToList(), last);
        }

        /// <summary>
        /// As <see cref="ListMember"/>, of values already written as <c>JSON.stringify</c> writes them.
        /// </summary>
        public static IReadOnlyList<string> ListMemberOfText(string key, IReadOnlyList<string> values, bool last)
        {
            string end = last ? "" : ",";

            if (values.Count == 0)
            {
                return [$"  {CanonicalJson.Stringify(key)}: []{end}"];
            }

            List<string> lines = [$"  {CanonicalJson.Stringify(key)}: ["];

            for (int i = 0; i < values.Count; i++)
            {
                lines.Add($"    {values[i]}{(i < values.Count - 1 ? "," : "")}");
            }

            lines.Add($"  ]{end}");
            return lines;
        }

        /// <summary>
        /// The text of the lines, each ended by a line feed.
        /// </summary>
        public static string FileOf(IEnumerable<string> lines)
        {
            StringBuilder text = new StringBuilder();

            foreach (string line in lines)
            {
                text.Append(line).Append('\n');
            }

            return text.ToString();
        }
    }
}
