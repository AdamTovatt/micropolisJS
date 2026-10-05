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

using System.Text.Json.Nodes;
using Micropolis.Conformance;
using Micropolis.Rules;

namespace Micropolis.Server.Tests
{
    [TestClass]
    public sealed class CityHostTests
    {
        // Two years and some at fast speed, a year taking 48 cycles of 16 steps, with the budget left to the players, in
        // advances of 100 steps. A review falls due only in a city with people, so the city is a fixture's.
        [TestMethod]
        public void Advance_YearEndsWithAutoBudgetOff_SaysAReviewFellDueWhereOneWasSent()
        {
            Simulation town = Simulation.FromSave(FixtureSaves.At("town", FixtureSaves.Run).ReadCommitted());
            List<StateMessage> published = new List<StateMessage>();
            CityHost host = new CityHost(new StartingCity("Town", town, SaveStart.Of(town)), new ManualTicker(), published.AddRange);
            host.Hold();
            host.Send("ada", new JsonObject { ["type"] = "setAutoBudget", ["on"] = false });
            host.Send("ada", new JsonObject { ["type"] = "setSpeed", ["speed"] = (int)Speed.Fast });
            int reviewsSaid = 0;

            for (int advance = 0; advance < 17; advance++)
            {
                published.Clear();
                AdvanceResult result = host.Advance(100);

                Assert.IsNull(result.Error);
                Assert.AreEqual(published.OfType<BudgetReviewDueMessage>().Any(), result.BudgetReviewDue);
                reviewsSaid += result.BudgetReviewDue ? 1 : 0;
            }

            Assert.IsGreaterThanOrEqualTo(2, reviewsSaid);
        }
    }
}
