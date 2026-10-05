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

namespace Micropolis.Rules.Tests
{
    [TestClass]
    public sealed class JsMathTests
    {
        // Each as JavaScript's Math.floor(a / b) answers it
        [TestMethod]
        [DataRow(7L, 2L, 3L)]
        [DataRow(-7L, 2L, -4L)]
        [DataRow(7L, -2L, -4L)]
        [DataRow(-7L, -2L, 3L)]
        [DataRow(-8L, 2L, -4L)]
        [DataRow(0L, 5L, 0L)]
        [DataRow(-1L, 48L, -1L)]
        [DataRow(-48L, 48L, -1L)]
        [DataRow(-49L, 48L, -2L)]
        public void FloorDiv_Longs_RoundTowardMinusInfinity(long a, long b, long expected)
        {
            Assert.AreEqual(expected, JsMath.FloorDiv(a, b));
        }

        [TestMethod]
        [DataRow(-1, 8, -1)]
        [DataRow(-9, 8, -2)]
        [DataRow(15, 8, 1)]
        public void FloorDiv_Ints_RoundTowardMinusInfinity(int a, int b, int expected)
        {
            Assert.AreEqual(expected, JsMath.FloorDiv(a, b));
        }
    }
}
