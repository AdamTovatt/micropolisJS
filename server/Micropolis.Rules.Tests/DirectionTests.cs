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
    [TestClass]
    public sealed class DirectionTests
    {
        [TestMethod]
        public void RotateClockwise_North_IsNorthEast()
        {
            Assert.AreSame(Direction.NorthEast, Direction.North.RotateClockwise());
        }

        [TestMethod]
        public void RotateCounterClockwise_North_IsNorthWest()
        {
            Assert.AreSame(Direction.NorthWest, Direction.North.RotateCounterClockwise());
        }

        [TestMethod]
        public void OppositeDirection_West_IsEast()
        {
            Assert.AreSame(Direction.East, Direction.West.OppositeDirection());
        }
    }
}
