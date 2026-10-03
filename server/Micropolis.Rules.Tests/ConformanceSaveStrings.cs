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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// <c>conformance/saveStrings.json</c>: the strings a save may hold, in the TypeScript's order.
    /// </summary>
    public sealed record ConformanceSaveStrings(
        IReadOnlyList<string> CityClasses, IReadOnlyList<string> ScoreReasons, IReadOnlyList<string> CityClassMessages)
    {
        public static ConformanceSaveStrings Load()
        {
            return Parse(ConformanceFile.Read("saveStrings.json"));
        }

        public static ConformanceSaveStrings Parse(string json)
        {
            ConformanceSaveStrings strings = ConformanceFile.Parse<ConformanceSaveStrings>(json);
            ConformanceFile.NonEmpty("cityClasses", strings.CityClasses);
            ConformanceFile.NonEmpty("scoreReasons", strings.ScoreReasons);
            ConformanceFile.NonEmpty("cityClassMessages", strings.CityClassMessages);
            return strings;
        }
    }
}
