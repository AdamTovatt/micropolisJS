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

namespace Micropolis.Rules
{
    /// <summary>
    /// The records the simulation produces for the windows to show: each a copy, sharing nothing with the city.
    /// </summary>
    public static class Records
    {
        /// <summary>
        /// The evaluation, with the problems the public ranked: a place no problem fills is left out.
        /// </summary>
        public static EvaluationRecord Evaluation(Evaluation evaluation, Level level)
        {
            List<int> problems = evaluation.ProblemOrder.Take(Rules.Evaluation.NumComplaints)
                .Where(problem => problem != Rules.Evaluation.NumProblems)
                .ToList();

            return new EvaluationRecord(
                evaluation.CityYes,
                problems,
                evaluation.CityPop,
                evaluation.CityPopDelta,
                evaluation.CityAssessedValue,
                SavedName.Of(evaluation.CityClass),
                (int)level,
                evaluation.CityScore,
                evaluation.CityScoreDelta,
                evaluation.CityScoreBreakdown.Select(step => new ScoreEntry(SavedName.Of(step.Reason), step.Points)).ToList());
        }

        public static BudgetRecord Budget(Budget budget)
        {
            return new BudgetRecord(budget.CityTax, budget.TaxFund, budget.TotalFunds, budget.Maintenance, budget.Percents);
        }

        public static SettingsRecord Settings(Simulation city)
        {
            return new SettingsRecord(city.Budget.AutoBudget, city.DisasterManager.DisastersEnabled, (int)city.Speed);
        }
    }
}
