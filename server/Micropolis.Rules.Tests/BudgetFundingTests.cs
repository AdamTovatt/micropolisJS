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
    /// <see cref="Budget.SetFunding"/>, which a setBudget command calls, against a budget whose effects were set before
    /// the maintenance changed, so recomputing them would show.
    /// </summary>
    [TestClass]
    public sealed class BudgetFundingTests
    {
        [TestMethod]
        public void SetFunding_NoService_LeavesTheEffectsAsTheyWere()
        {
            Budget budget = StaleBudget();

            budget.SetFunding(null, null, null);

            Assert.AreEqual((32L, 1000L, 1000L), (budget.RoadEffect, budget.FireEffect, budget.PoliceEffect));
        }

        // Half the road's upkeep funded is half its effect; the others are recomputed from the spends they have
        [TestMethod]
        public void SetFunding_RoadOnly_FundsTheRoadAndSetsEveryEffect()
        {
            Budget budget = StaleBudget();

            budget.SetFunding(50, null, null);

            Assert.AreEqual((50L, 0.5), (budget.RoadSpend, budget.RoadPercent));
            Assert.AreEqual((16L, 500L, 250L), (budget.RoadEffect, budget.FireEffect, budget.PoliceEffect));
        }

        // Every effect at its most, though the spends booked now fund only part of each service
        private static Budget StaleBudget()
        {
            return new Budget
            {
                RoadMaintenanceBudget = 100,
                FireMaintenanceBudget = 100,
                PoliceMaintenanceBudget = 100,
                RoadSpend = 100,
                FireSpend = 50,
                PoliceSpend = 25,
                RoadEffect = Budget.MaxRoadEffect,
                FireEffect = Budget.MaxFireStationEffect,
                PoliceEffect = Budget.MaxPoliceStationEffect,
            };
        }
    }
}
