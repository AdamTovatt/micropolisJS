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

using System.Text.Json.Nodes;

namespace Micropolis.Rules
{
    public sealed partial class Simulation
    {
        /// <summary>
        /// The answer to a query, such as an overlay's layer or a tile's report, or its rejection. A query only reads
        /// the city: it changes nothing, draws nothing from the stream, and is never logged, so it may be asked at any
        /// time.
        /// </summary>
        public QueryAnswer AnswerQuery(JsonNode? query)
        {
            return Queries.Answer(query, this);
        }

        /// <summary>
        /// The evaluation record the evaluation window shows: the last evaluation, at the city's level.
        /// </summary>
        public EvaluationRecord EvaluationRecord()
        {
            return Records.Evaluation(Evaluation, GameLevel);
        }

        /// <summary>
        /// The budget record the budget window opens on.
        /// </summary>
        public BudgetRecord BudgetRecord()
        {
            return Records.Budget(Budget);
        }

        /// <summary>
        /// The settings record the settings window and the pause button show.
        /// </summary>
        public SettingsRecord SettingsRecord()
        {
            return Records.Settings(this);
        }
    }
}
