/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 * Modified in Adam Tovatt's continuation of micropolisJS. Copyright (C) 2026 Adam Tovatt
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
    public sealed class PositionTests
    {
        [TestMethod]
        public void Move_EachDirection_MovesOneTileThatWay()
        {
            Position origin = new Position(5, 5);

            Assert.AreEqual(new Position(5, 4), Position.Move(origin, Direction.North));
            Assert.AreEqual(new Position(6, 4), Position.Move(origin, Direction.NorthEast));
            Assert.AreEqual(new Position(6, 5), Position.Move(origin, Direction.East));
            Assert.AreEqual(new Position(6, 6), Position.Move(origin, Direction.SouthEast));
            Assert.AreEqual(new Position(5, 6), Position.Move(origin, Direction.South));
            Assert.AreEqual(new Position(4, 6), Position.Move(origin, Direction.SouthWest));
            Assert.AreEqual(new Position(4, 5), Position.Move(origin, Direction.West));
            Assert.AreEqual(new Position(4, 4), Position.Move(origin, Direction.NorthWest));
        }
    }
}
