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
    /// The short-term census's branches, as <c>test/census.ts</c> tests the TypeScript's: each hospital outcome, and a
    /// cash flow at the money history's range, tested directly rather than left to whichever of them the unit
    /// snapshots' cities happen to reach.
    /// </summary>
    [TestClass]
    public sealed class CensusTests
    {
        // 512 residents, scaled down by 256, need two hospitals
        [TestMethod]
        [DataRow(1L, 1)]
        [DataRow(2L, 0)]
        [DataRow(3L, -1)]
        public void Take10Census_HospitalsForTheResidents_AsksForOneMoreOrLess(long hospitalPop, int needHospital)
        {
            Census census = new Census { ResPop = 512, HospitalPop = hospitalPop };

            census.Take10Census(new Budget());

            Assert.AreEqual(needHospital, census.NeedHospital);
        }

        // A twentieth of the cash flow, its fraction dropped toward zero, about 128 and kept within 0–255: -30 is -1, not
        // -2, and 2560 and -2580 would be 256 and -1
        [TestMethod]
        [DataRow(-30L, 127L)]
        [DataRow(2559L, 255L)]
        [DataRow(2560L, 255L)]
        [DataRow(-2579L, 0L)]
        [DataRow(-2580L, 0L)]
        public void Take10Census_CashFlow_ScalesItIntoTheMoneyHistory(long cashFlow, long money)
        {
            Census census = new Census();

            census.Take10Census(new Budget { CashFlow = cashFlow });

            Assert.AreEqual(money, census.MoneyHist10[0]);
        }
    }
}
