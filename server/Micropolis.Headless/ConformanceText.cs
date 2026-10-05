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
using System.Text.RegularExpressions;
using Micropolis.Rules;

namespace Micropolis.Headless
{
    /// <summary>
    /// What the conformance files the fixture tool writes share beyond their layout, which is <see cref="JsonLines"/>':
    /// each value written as ECMAScript's <c>JSON.stringify</c> writes it, and the checks that the data a file is
    /// written from still covers what the file is for.
    /// </summary>
    internal static partial class ConformanceText
    {
        public static string Stringify(JsonNode? value)
        {
            return CanonicalJson.Stringify(value);
        }

        public static string Stringify(string value)
        {
            return CanonicalJson.Stringify(JsonValue.Create(value));
        }

        /// <summary>
        /// Fails unless the data a file is written from covers what it must, so a file never silently loses a case.
        /// </summary>
        public static void EnsureCovers(bool condition, string message)
        {
            if (!condition)
            {
                throw new InvalidDataException($"The conformance data would not cover {message}");
            }
        }

        /// <summary>
        /// A rejection's reason with each number it quotes written <c>#</c>, so reasons that differ only in their
        /// numbers are told apart by their words alone.
        /// </summary>
        public static string ReasonWords(string reason)
        {
            return QuotedNumber().Replace(reason, "#");
        }

        /// <summary>
        /// Fails unless the reasons reached, by their words (<see cref="ReasonWords"/>), are exactly those listed: one
        /// listed but never reached is a case the file lost, and one reached but not listed is a reason the rules
        /// gained, which is listed with a case.
        /// </summary>
        public static void EnsureReasonsCovered(IEnumerable<string> reached, IReadOnlyList<string> listed, string what)
        {
            HashSet<string> words = reached.ToHashSet(StringComparer.Ordinal);
            List<string> missing = listed.Where(reason => !words.Contains(reason)).ToList();
            List<string> unlisted = words.Where(reason => !listed.Contains(reason)).ToList();

            EnsureCovers(missing.Count == 0 && unlisted.Count == 0,
                         $"every reason {what}: missing [{string.Join("; ", missing)}], reached but not listed [{string.Join("; ", unlisted)}]");
        }

        // A number as a reason quotes it: a digit or minus sign, then any run of digits, signs, points and e
        [GeneratedRegex("[0-9-][0-9e+.-]*")]
        private static partial Regex QuotedNumber();
    }
}
