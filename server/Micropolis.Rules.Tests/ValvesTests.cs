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
    /// The demand caps, which the unit snapshots don't reach: no fixture's city wants a stadium, a seaport or an
    /// airport.
    /// </summary>
    [TestClass]
    public sealed class ValvesTests
    {
        // An empty city at no tax on the easy level moves the valves from 1000 by 379, -400 and 800, the last clamped
        // to 1500, as the TypeScript's setValves does: a capped valve that would be above zero is held at zero
        [TestMethod]
        [DataRow(false, false, false, 1379L, 600L, 1500L)]
        [DataRow(true, false, false, 0L, 600L, 1500L)]
        [DataRow(false, true, false, 1379L, 0L, 1500L)]
        [DataRow(false, false, true, 1379L, 600L, 0L)]
        public void SetValves_CappedDemand_HoldsItsValveAtZero(bool resCap, bool comCap, bool indCap, long resValve, long comValve, long indValve)
        {
            Valves valves = new Valves { ResValve = 1000, ComValve = 1000, IndValve = 1000, ResCap = resCap, ComCap = comCap, IndCap = indCap };

            valves.SetValves(Level.Easy, new Census(), new Budget());

            Assert.AreEqual((resValve, comValve, indValve), (valves.ResValve, valves.ComValve, valves.IndValve));
        }
    }
}
