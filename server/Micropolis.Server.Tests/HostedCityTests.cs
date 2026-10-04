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
using Micropolis.Rules;
using Micropolis.SourceTree;

namespace Micropolis.Server.Tests
{
    [TestClass]
    public sealed class HostedCityTests
    {
        // Two years and some at fast speed, a year taking 48 cycles of 16 steps, with the budget left to the players. A
        // review falls due only in a city with people, so the city is a fixture's.
        [TestMethod]
        public void BudgetReviewsDue_YearEndsWithAutoBudgetOff_CountsEachReviewSent()
        {
            Simulation town = Simulation.FromSave(File.ReadAllText(RepositoryFiles.GetPath("conformance/saves/town.run.json")));
            HostedCity hosted = new HostedCity("Town", town, CommandRecorder.SavedStart(town));
            hosted.Queue.Send(new ReceivedCommand("ada", new JsonObject { ["type"] = "setAutoBudget", ["on"] = false }));
            hosted.Queue.Send(new ReceivedCommand("ada", new JsonObject { ["type"] = "setSpeed", ["speed"] = (int)Speed.Fast }));
            hosted.Queue.ApplyCommands();
            int reviewsSent = 0;

            for (int step = 0; step < 2 * 48 * 16 + 100; step++)
            {
                hosted.Queue.Step();
                reviewsSent += hosted.NewMessages().OfType<BudgetReviewDueMessage>().Count();
            }

            Assert.IsGreaterThanOrEqualTo(2, reviewsSent);
            Assert.AreEqual(reviewsSent, hosted.BudgetReviewsDue);
        }
    }
}
