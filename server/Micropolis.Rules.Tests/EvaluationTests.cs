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

using static Micropolis.Rules.Tests.FixtureCities;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The yearly evaluation's branches, as <c>test/evaluation.ts</c> and <c>test/evaluationOracle.ts</c> test the
    /// TypeScript's: capped demand, fires, jobs past a short's range and an empty city, tested directly rather than
    /// left to whichever of them the unit snapshots' cities happen to reach.
    /// </summary>
    [TestClass]
    public sealed class EvaluationTests
    {
        // The score is an int in evaluate.cpp, so each cut drops its fraction: 1000 * 0.85 = 850, 850 * 0.85 = 722.5
        // and 722 * 0.85 = 613.7, then (500 + 613) / 2 = 556.5
        [TestMethod]
        public void CityEvaluation_EveryDemandCapped_CutsTheScore15PercentForEach()
        {
            Simulation city = ProblemFreeCity(200);
            city.Valves.ResCap = true;
            city.Valves.ComCap = true;
            city.Valves.IndCap = true;

            city.Evaluation.CityEvaluation(city.ConstructSimData());

            CollectionAssert.AreEqual(
                new[]
                {
                    new ScoreStep(ScoreReason.Problems, 1000 - 500),
                    new ScoreStep(ScoreReason.ResCap, 850 - 1000),
                    new ScoreStep(ScoreReason.ComCap, 722 - 850),
                    new ScoreStep(ScoreReason.IndCap, 613 - 722),
                    new ScoreStep(ScoreReason.Averaging, 556 - 613),
                },
                city.Evaluation.CityScoreBreakdown.ToArray());
        }

        // 4 fires are a severity of 20, which costs the base nothing, as 20 / 3 drops its fraction, and comes off the
        // score after it
        [TestMethod]
        public void CityEvaluation_Fires_TakeTheirSeverityOff()
        {
            Simulation city = ProblemFreeCity(200);
            city.Census.FirePop = 4;

            city.Evaluation.CityEvaluation(city.ConstructSimData());

            CollectionAssert.AreEqual(
                new[]
                {
                    new ScoreStep(ScoreReason.Problems, 1000 - 500),
                    new ScoreStep(ScoreReason.Fires, -20),
                    new ScoreStep(ScoreReason.Averaging, 740 - 980),
                },
                city.Evaluation.CityScoreBreakdown.ToArray());
        }

        // With crime and pollution at 255, the unemployment shows in the base, (256 - problems / 3) * 4.
        // 4096 commercial people are 32768 jobs, which a short holds as -32768: 8000 residents are a ratio of
        // -0.244, an unemployment of -317, and a base of (256 - 193 / 3) * 4 = 768.
        // 1 commercial person is 8 jobs: 30000 residents are an unemployment of 3749 * 255, capped at 255, and a base of
        // (256 - 765 / 3) * 4 = 4.
        [TestMethod]
        [DataRow(8000L, 4096L, 768L)]
        [DataRow(30000L, 1L, 4L)]
        public void CityEvaluation_JobsPastAShortOrFewJobs_WrapsAndCapsTheUnemployment(long resPop, long comPop, long baseScore)
        {
            Simulation city = ProblemFreeCity(resPop);
            city.Census.ComPop = comPop;
            city.Census.CrimeAverage = 255;
            city.Census.PollutionAverage = 255;

            city.Evaluation.CityEvaluation(city.ConstructSimData());

            Assert.AreEqual(new ScoreStep(ScoreReason.Problems, baseScore - 500), city.Evaluation.CityScoreBreakdown[0]);
        }

        [TestMethod]
        public void CityEvaluation_NobodyLivingThere_StartsOverAtAnEvenVote()
        {
            Simulation city = City("suburb", "run");
            Assert.IsGreaterThan(0L, city.Evaluation.CityPop);
            city.Census.TotalPop = 0;

            city.Evaluation.CityEvaluation(city.ConstructSimData());

            Evaluation evaluation = city.Evaluation;
            Assert.AreEqual(
                (CityClass.Village, 500, 50, 0L, 0L, 0L),
                (evaluation.CityClass, evaluation.CityScore, evaluation.CityYes, evaluation.CityPop, evaluation.CityPopDelta,
                 evaluation.CityAssessedValue));
            Assert.IsEmpty(evaluation.CityScoreBreakdown);
            CollectionAssert.AreEqual(Enumerable.Repeat(Evaluation.NumProblems, Evaluation.NumComplaints).ToArray(),
                                      evaluation.ProblemOrder.ToArray());
            CollectionAssert.AreEqual(Enumerable.Range(0, Evaluation.NumProblems).Select(index => new ProblemVote(index, 0)).ToArray(),
                                      evaluation.ProblemVotes.ToArray());
        }

        /// <summary>
        /// The suburb, evaluated as a new city in a problem-free year, as <c>problemFreeYear</c> in
        /// <c>test/helpers/evaluationCity.ts</c> sets it: no crime, pollution, land value, traffic, fires or tax, full
        /// funding, uncapped valves, every zone powered, and as many residents as jobs. Its base score is 1000.
        /// </summary>
        private static Simulation ProblemFreeCity(long resPop)
        {
            Simulation city = City("suburb", "built", save =>
            {
                save["evaluation"]!["cityScore"] = 500;
                save["evaluation"]!["cityPop"] = 0;
            });

            city.BlockMaps.LandValueMap.Clear();
            city.BlockMaps.TrafficDensityMap.Clear();

            Census census = city.Census;
            census.ResPop = resPop;
            census.ComPop = resPop / 8;
            census.IndPop = 0;
            census.TotalPop = resPop + census.ComPop;
            census.CrimeAverage = 0;
            census.PollutionAverage = 0;
            census.LandValueAverage = 0;
            census.FirePop = 0;
            census.PoweredZoneCount = 10;
            census.UnpoweredZoneCount = 0;

            Budget budget = city.Budget;
            budget.CityTax = 0;
            budget.RoadEffect = Budget.MaxRoadEffect;
            budget.PoliceEffect = Budget.MaxPoliceStationEffect;
            budget.FireEffect = Budget.MaxFireStationEffect;

            Valves valves = city.Valves;
            valves.ResCap = false;
            valves.ComCap = false;
            valves.IndCap = false;
            valves.ResValve = 0;
            valves.ComValve = 0;
            valves.IndValve = 0;

            return city;
        }
    }
}
