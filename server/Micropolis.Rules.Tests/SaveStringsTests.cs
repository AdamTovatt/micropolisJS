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
    /// The strings the C# save model reads and writes against the TypeScript's, through
    /// <c>conformance/saveStrings.json</c>: the same strings in the same order.
    /// </summary>
    [TestClass]
    public sealed class SaveStringsTests
    {
        private static readonly ConformanceSaveStrings Strings = ConformanceSaveStrings.Load();

        [TestMethod]
        public void CityClass_ComparedWithTypeScript_NamesTheSameClassesInOrder()
        {
            CollectionAssert.AreEqual(Strings.CityClasses.ToList(), SavedName.All<CityClass>().ToList());
        }

        [TestMethod]
        public void ScoreReason_ComparedWithTypeScript_NamesTheSameReasonsInOrder()
        {
            CollectionAssert.AreEqual(Strings.ScoreReasons.ToList(), SavedName.All<ScoreReason>().ToList());
        }

        [TestMethod]
        public void CityClassMessages_ComparedWithTypeScript_AreTheSameMessagesInOrder()
        {
            CollectionAssert.AreEqual(Strings.CityClassMessages.ToList(), Simulation.CityClassMessages.ToList());
        }
    }
}
