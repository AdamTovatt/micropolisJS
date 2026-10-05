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

using Microsoft.Extensions.Time.Testing;

namespace Micropolis.Server.Tests
{
    [TestClass]
    public sealed class CursorLimitTests
    {
        [TestMethod]
        public void TryCount_PastTheLimitWithinASecond_Refuses()
        {
            CursorLimit limit = new CursorLimit(new FakeTimeProvider());

            bool[] counted = Enumerable.Range(0, CursorLimit.PerSecond + 1).Select(_ => limit.TryCount()).ToArray();

            CollectionAssert.AreEqual(Enumerable.Repeat(true, CursorLimit.PerSecond).Append(false).ToArray(), counted);
        }

        [TestMethod]
        public void TryCount_ASecondAfterTheFirstCounted_CountsAgain()
        {
            FakeTimeProvider time = new FakeTimeProvider();
            CursorLimit limit = new CursorLimit(time);
            Count(limit, CursorLimit.PerSecond);

            time.Advance(TimeSpan.FromSeconds(1));

            Assert.IsTrue(limit.TryCount());
        }

        // A window that started at the first box would let a second burst through as soon as it ended, half a second
        // after the first burst: twice the limit in one second
        [TestMethod]
        public void TryCount_BurstsEitherSideOfASecondsEdge_StaysWithinTheLimitInAnySecond()
        {
            FakeTimeProvider time = new FakeTimeProvider();
            CursorLimit limit = new CursorLimit(time);
            Assert.IsTrue(limit.TryCount());
            time.Advance(TimeSpan.FromMilliseconds(500));
            Count(limit, CursorLimit.PerSecond - 1);
            time.Advance(TimeSpan.FromMilliseconds(500));

            int counted = Enumerable.Range(0, CursorLimit.PerSecond).Count(_ => limit.TryCount());

            Assert.AreEqual(1, counted);
        }

        [TestMethod]
        public void TryCount_Refused_IsNotCounted()
        {
            FakeTimeProvider time = new FakeTimeProvider();
            CursorLimit limit = new CursorLimit(time);
            Count(limit, CursorLimit.PerSecond);
            time.Advance(TimeSpan.FromMilliseconds(500));
            Assert.IsFalse(limit.TryCount());

            time.Advance(TimeSpan.FromMilliseconds(500));

            Assert.AreEqual(CursorLimit.PerSecond, Enumerable.Range(0, CursorLimit.PerSecond + 1).Count(_ => limit.TryCount()));
        }

        private static void Count(CursorLimit limit, int boxes)
        {
            for (int box = 0; box < boxes; box++)
            {
                Assert.IsTrue(limit.TryCount());
            }
        }
    }
}
