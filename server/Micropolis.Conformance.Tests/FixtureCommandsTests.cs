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

using Micropolis.Rules;

namespace Micropolis.Conformance.Tests
{
    [TestClass]
    public sealed class FixtureCommandsTests
    {
        // The fixtures' lines are straight, so the committed logs never reach a diagonal: these pin dragPath's
        [TestMethod]
        public void DragPath_Diagonal_TakesTheColumnFirstAtACorner()
        {
            IReadOnlyList<TilePosition> path = FixtureCommands.DragPath(new TilePosition(0, 0), new TilePosition(2, 2));

            CollectionAssert.AreEqual(
                new[] { new TilePosition(1, 0), new TilePosition(1, 1), new TilePosition(2, 1), new TilePosition(2, 2) }, path.ToArray());
        }

        [TestMethod]
        public void DragPath_Steep_StepsMostlyAlongTheColumn()
        {
            IReadOnlyList<TilePosition> path = FixtureCommands.DragPath(new TilePosition(5, 5), new TilePosition(4, 1));

            CollectionAssert.AreEqual(
                new[] { new TilePosition(5, 4), new TilePosition(5, 3), new TilePosition(4, 3), new TilePosition(4, 2), new TilePosition(4, 1) },
                path.ToArray());
        }

        [TestMethod]
        public void DragPath_SameTile_IsEmpty()
        {
            Assert.IsEmpty(FixtureCommands.DragPath(new TilePosition(3, 3), new TilePosition(3, 3)));
        }

        [TestMethod]
        public void LineOf_Diagonal_Throws()
        {
            Assert.ThrowsExactly<ArgumentException>(() => FixtureCommands.LineOf(ToolName.Road, 0, 0, 1, 1));
        }

        [TestMethod]
        public void ZoneRow_UnknownLetter_Throws()
        {
            Assert.ThrowsExactly<ArgumentException>(() => FixtureCommands.ZoneRow("RX", 0, 0).ToList());
        }
    }
}
