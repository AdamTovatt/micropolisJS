/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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

namespace Micropolis.Server.Tests
{
    [TestClass]
    public sealed class CityIdTests
    {
        [TestMethod]
        public void New_Twice_GivesTwoIdsThatAreIds()
        {
            string first = CityId.New();
            string second = CityId.New();

            Assert.IsTrue(CityId.IsOne(first));
            Assert.IsTrue(CityId.IsOne(second));
            Assert.AreNotEqual(first, second);
        }

        [TestMethod]
        [DataRow("0123456789abcdef0123456789abcde", DisplayName = "31 characters")]
        [DataRow("0123456789abcdef0123456789abcdef0", DisplayName = "33 characters")]
        [DataRow("0123456789ABCDEF0123456789abcdef", DisplayName = "upper-case hex")]
        [DataRow("0123456789abcdef0123456789abcdeg", DisplayName = "a letter that isn't hex")]
        [DataRow("", DisplayName = "empty")]
        public void IsOne_TextThatIsNoId_IsFalse(string text)
        {
            Assert.IsFalse(CityId.IsOne(text));
        }
    }
}
