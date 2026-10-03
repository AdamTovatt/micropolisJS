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

namespace Micropolis.Rules
{
    /// <summary>
    /// The city evaluation: its class, score, the voters' verdict and problems, and why the score last moved.
    /// </summary>
    public sealed class Evaluation
    {
        /// <summary>
        /// The problems the voters are polled on.
        /// </summary>
        public const int NumProblems = 7;

        /// <summary>
        /// The worst problems the evaluation ranks. A slot no problem fills holds <see cref="NumProblems"/>.
        /// </summary>
        public const int NumComplaints = 4;

        public static readonly IReadOnlyList<string> CityClasses = ["VILLAGE", "TOWN", "CITY", "CAPITAL", "METROPOLIS", "MEGALOPOLIS"];

        /// <summary>
        /// The steps of the score calculation, in calculation order.
        /// </summary>
        public static readonly IReadOnlyList<string> ScoreReasons =
        [
            "PROBLEMS", "RES_CAP", "COM_CAP", "IND_CAP", "ROAD_FUNDING", "POLICE_FUNDING", "FIRE_FUNDING", "RES_OVERSUPPLY",
            "COM_OVERSUPPLY", "IND_OVERSUPPLY", "MIGRATION", "FIRES", "TAXES", "UNPOWERED_ZONES", "RANGE", "AVERAGING",
        ];

        public string CityClass { get; set; } = CityClasses[0];

        public int CityScore { get; set; }

        public int CityYes { get; set; }

        public long CityPop { get; set; }

        public long CityPopDelta { get; set; }

        public long CityAssessedValue { get; set; }

        public string CityClassLast { get; set; } = CityClasses[0];

        public long CityScoreDelta { get; set; }

        /// <summary>
        /// The last poll's votes, in the poll's sorted order.
        /// </summary>
        public List<ProblemVote> ProblemVotes { get; set; } = [];

        /// <summary>
        /// The worst problems' indices, worst first, <see cref="NumProblems"/> for none.
        /// </summary>
        public int[] ProblemOrder { get; set; } = new int[NumComplaints];

        public List<ScoreStep> CityScoreBreakdown { get; set; } = [];

        public void Save(JsonObject saveData)
        {
            saveData["evaluation"] = new JsonObject
            {
                ["cityClass"] = CityClass,
                ["cityScore"] = CityScore,
                ["cityYes"] = CityYes,
                ["cityPop"] = CityPop,
                ["cityPopDelta"] = CityPopDelta,
                ["cityAssessedValue"] = CityAssessedValue,
                ["cityClassLast"] = CityClassLast,
                ["cityScoreDelta"] = CityScoreDelta,
                ["problemVotes"] = new JsonArray(ProblemVotes.Select(vote => (JsonNode?)new JsonObject
                {
                    ["index"] = vote.Index,
                    ["voteCount"] = vote.VoteCount,
                }).ToArray()),
                ["problemOrder"] = SavedList.Of(ProblemOrder),
                ["cityScoreBreakdown"] = new JsonArray(CityScoreBreakdown.Select(step => (JsonNode?)new JsonObject
                {
                    ["reason"] = step.Reason,
                    ["points"] = step.Points,
                }).ToArray()),
            };
        }

        public void Load(SavedObject saveData)
        {
            saveData.ReadObject("evaluation", evaluation =>
            {
                CityClass = evaluation.ReadString("cityClass", CityClasses);
                CityScore = evaluation.ReadInt("cityScore", 0, 1000);
                CityYes = evaluation.ReadInt("cityYes", 0, 100);
                CityPop = evaluation.ReadSafeInteger("cityPop");
                CityPopDelta = evaluation.ReadSafeInteger("cityPopDelta");
                CityAssessedValue = evaluation.ReadSafeInteger("cityAssessedValue");
                CityClassLast = evaluation.ReadString("cityClassLast", CityClasses);
                CityScoreDelta = evaluation.ReadSafeInteger("cityScoreDelta");

                ProblemVotes = evaluation.ReadObjectList("problemVotes", NumProblems,
                    vote => new ProblemVote(vote.ReadSafeInteger("index"), vote.ReadSafeInteger("voteCount")));

                ProblemOrder = evaluation.ReadIntList("problemOrder", NumComplaints, 0, NumProblems);

                CityScoreBreakdown = evaluation.ReadObjectList("cityScoreBreakdown",
                    step => new ScoreStep(step.ReadString("reason", ScoreReasons), step.ReadSafeInteger("points")));
            });
        }
    }

    /// <summary>
    /// The votes one problem drew in a poll.
    /// </summary>
    public readonly record struct ProblemVote(long Index, long VoteCount);

    /// <summary>
    /// The points one step of the score calculation moved the score.
    /// </summary>
    public readonly record struct ScoreStep(string Reason, long Points);
}
