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
    /// The demand caps, tested directly rather than left to whichever caps the unit snapshots' cities happen to reach.
    /// </summary>
    [TestClass]
    public sealed class ValvesTests
    {
        // An empty city at no tax on the easy level moves the valves by 379, -400 and 800, as the TypeScript's setValves
        // does: from 1000 to 1379, 600 and 1500, the last clamped, and from -1000 to -621, -1400 and -200. A capped valve
        // that would be above zero is held at zero, and one below zero is left where it is.
        [TestMethod]
        [DataRow(1000L, false, false, false, 1379L, 600L, 1500L)]
        [DataRow(1000L, true, false, false, 0L, 600L, 1500L)]
        [DataRow(1000L, false, true, false, 1379L, 0L, 1500L)]
        [DataRow(1000L, false, false, true, 1379L, 600L, 0L)]
        [DataRow(-1000L, true, true, true, -621L, -1400L, -200L)]
        public void SetValves_CappedDemand_HoldsItsValveAtOrBelowZero(long start, bool resCap, bool comCap, bool indCap, long resValve, long comValve, long indValve)
        {
            Valves valves = new Valves { ResValve = start, ComValve = start, IndValve = start, ResCap = resCap, ComCap = comCap, IndCap = indCap };

            valves.SetValves(Level.Easy, new Census(), new Budget());

            Assert.AreEqual((resValve, comValve, indValve), (valves.ResValve, valves.ComValve, valves.IndValve));
        }
    }
}
