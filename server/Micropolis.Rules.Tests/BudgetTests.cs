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
    /// The year end's branches the unit snapshots don't reach, as <c>test/budget.ts</c> tests the TypeScript's: the
    /// fixtures' cities always have someone living in them, and too little tax to leave a short's range.
    /// </summary>
    [TestClass]
    public sealed class BudgetTests
    {
        // 3000 * 250 / 120 * 20 is 125000, which the easy level's 1.4 makes 175000 of tax, with no upkeep to take off
        // it. In a short that is 175000 - 3 * 65536.
        [TestMethod]
        public void CollectTax_CashFlowPastAShort_WrapsIt()
        {
            Budget budget = new Budget { CityTax = 20, TotalFunds = 1000 };

            budget.CollectTax(Level.Easy, new Census { TotalPop = 3000, LandValueAverage = 250 });

            Assert.AreEqual((175000L, -21608L), (budget.TaxFund, budget.CashFlow));
        }

        [TestMethod]
        public void CollectTax_NobodyLivingThere_KeepsTheServicesAtFullEffect()
        {
            Budget budget = new Budget { RoadEffect = 10, PoliceEffect = 100, FireEffect = 200, TotalFunds = 1000 };

            budget.CollectTax(Level.Easy, new Census { RoadTotal = 50, FireStationPop = 1 });

            Assert.AreEqual(
                (Budget.MaxRoadEffect, Budget.MaxPoliceStationEffect, Budget.MaxFireStationEffect, 0L, 1000L),
                (budget.RoadEffect, budget.PoliceEffect, budget.FireEffect, budget.CashFlow, budget.TotalFunds));
        }
    }
}
