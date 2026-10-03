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

using System.Reflection;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// <see cref="TileValues"/> and <see cref="TileFlags"/> against <c>src/tileValues.ts</c> and
    /// <c>src/tileFlags.ts</c>, through <c>conformance/tiles.json</c>: the same names with the same values.
    /// </summary>
    [TestClass]
    public sealed class TileNamesTests
    {
        private static readonly TileNames Names = ConformanceFile.Load<TileNames>("tiles.json");

        [TestMethod]
        public void TileValues_ComparedWithTypeScript_HoldTheSameNamesAndValues()
        {
            AssertSameConstants(Names.Values, typeof(TileValues));
        }

        [TestMethod]
        public void TileFlags_ComparedWithTypeScript_HoldTheSameNamesAndValues()
        {
            AssertSameConstants(Names.Flags, typeof(TileFlags));
        }

        private static void AssertSameConstants(IReadOnlyDictionary<string, int> expected, Type type)
        {
            Dictionary<string, int> actual = type.GetFields(BindingFlags.Public | BindingFlags.Static)
                .Where(field => field.IsLiteral)
                .ToDictionary(field => field.Name, field => (int)field.GetRawConstantValue()!);

            CollectionAssert.AreEquivalent(expected.Keys.ToList(), actual.Keys.ToList(), $"{type.Name} names differ.");

            foreach ((string name, int value) in expected)
            {
                Assert.AreEqual(value, actual[name], $"{type.Name}.{name} differs.");
            }
        }

        private sealed record TileNames(IReadOnlyDictionary<string, int> Values, IReadOnlyDictionary<string, int> Flags);
    }
}
