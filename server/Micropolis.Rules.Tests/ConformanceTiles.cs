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
    /// <c>conformance/tiles.json</c>: every name <c>src/tileValues.ts</c> and <c>src/tileFlags.ts</c> export, with its
    /// value.
    /// </summary>
    public sealed record ConformanceTiles(IReadOnlyDictionary<string, int> Values, IReadOnlyDictionary<string, int> Flags)
    {
        public static ConformanceTiles Load()
        {
            return Parse(ConformanceFile.Read("tiles.json"));
        }

        public static ConformanceTiles Parse(string json)
        {
            ConformanceTiles tiles = ConformanceFile.Parse<ConformanceTiles>(json);
            ConformanceFile.NonEmpty("values", tiles.Values);
            ConformanceFile.NonEmpty("flags", tiles.Flags);
            return tiles;
        }
    }
}
