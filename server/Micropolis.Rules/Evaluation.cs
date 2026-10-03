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
    /// The city's class, as <c>CITY_CLASSES</c> in <c>src/protocol.ts</c> lists them, smallest first.
    /// </summary>
    public enum CityClass
    {
        Village,
        Town,
        City,
        Capital,
        Metropolis,
        Megalopolis,
    }

    /// <summary>
    /// A step of the score calculation, as <c>SCORE_REASONS</c> in <c>src/protocol.ts</c> lists them, in calculation
    /// order.
    /// </summary>
    public enum ScoreReason
    {
        Problems,
        ResCap,
        ComCap,
        IndCap,
        RoadFunding,
        PoliceFunding,
        FireFunding,
        ResOversupply,
        ComOversupply,
        IndOversupply,
        Migration,
        Fires,
        Taxes,
        UnpoweredZones,
        Range,
        Averaging,
    }

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

        /// <summary>
        /// The votes a poll stops at (<c>voteProblems</c> in <c>src/evaluation.js</c>), so the most one problem draws.
        /// </summary>
        public const int MaxVotes = 100;

        public CityClass CityClass { get; internal set; }

        public int CityScore { get; internal set; }

        public int CityYes { get; internal set; }

        public long CityPop { get; internal set; }

        public long CityPopDelta { get; internal set; }

        public long CityAssessedValue { get; internal set; }

        public CityClass CityClassLast { get; internal set; }

        public long CityScoreDelta { get; internal set; }

        /// <summary>
        /// The last poll's votes, in the poll's sorted order.
        /// </summary>
        public IReadOnlyList<ProblemVote> ProblemVotes { get; internal set; } = [];

        /// <summary>
        /// The worst problems' indices, worst first, <see cref="NumProblems"/> for none.
        /// </summary>
        public IReadOnlyList<int> ProblemOrder { get; internal set; } = new int[NumComplaints];

        public IReadOnlyList<ScoreStep> CityScoreBreakdown { get; internal set; } = [];

        /// <summary>
        /// Raises <see cref="Messages.CLASSIFICATION_UPDATED"/>, <see cref="Messages.POPULATION_UPDATED"/> and
        /// <see cref="Messages.SCORE_UPDATED"/>, as <c>src/evaluation.js</c> does.
        /// </summary>
        internal EventEmitter Events { get; } = new EventEmitter();

        public void CityEvaluation(SimData simData)
        {
            throw new NotPortedException("evaluation.cityEvaluation");
        }

        internal void Save(JsonObject saveData)
        {
            saveData["evaluation"] = new JsonObject
            {
                ["cityClass"] = SavedName.Of(CityClass),
                ["cityScore"] = CityScore,
                ["cityYes"] = CityYes,
                ["cityPop"] = CityPop,
                ["cityPopDelta"] = CityPopDelta,
                ["cityAssessedValue"] = CityAssessedValue,
                ["cityClassLast"] = SavedName.Of(CityClassLast),
                ["cityScoreDelta"] = CityScoreDelta,
                ["problemVotes"] = new JsonArray(ProblemVotes.Select(vote => (JsonNode?)new JsonObject
                {
                    ["index"] = vote.Index,
                    ["voteCount"] = vote.VoteCount,
                }).ToArray()),
                ["problemOrder"] = SavedList.Of(ProblemOrder),
                ["cityScoreBreakdown"] = new JsonArray(CityScoreBreakdown.Select(step => (JsonNode?)new JsonObject
                {
                    ["reason"] = SavedName.Of(step.Reason),
                    ["points"] = step.Points,
                }).ToArray()),
            };
        }

        internal void Load(SavedObject saveData)
        {
            saveData.ReadObject("evaluation", evaluation =>
            {
                CityClass = evaluation.ReadName<CityClass>("cityClass");
                CityScore = evaluation.ReadInt("cityScore", 0, 1000);
                CityYes = evaluation.ReadInt("cityYes", 0, 100);
                CityPop = evaluation.ReadSafeInteger("cityPop");
                CityPopDelta = evaluation.ReadSafeInteger("cityPopDelta");
                CityAssessedValue = evaluation.ReadSafeInteger("cityAssessedValue");
                CityClassLast = evaluation.ReadName<CityClass>("cityClassLast");
                CityScoreDelta = evaluation.ReadSafeInteger("cityScoreDelta");

                ProblemVotes = evaluation.ReadObjectList("problemVotes", NumProblems,
                    vote => new ProblemVote(vote.ReadInt("index", 0, NumProblems - 1), vote.ReadInt("voteCount", 0, MaxVotes)));

                ProblemOrder = evaluation.ReadIntList("problemOrder", NumComplaints, 0, NumProblems);

                CityScoreBreakdown = evaluation.ReadObjectList("cityScoreBreakdown",
                    step => new ScoreStep(step.ReadName<ScoreReason>("reason"), step.ReadSafeInteger("points")));
            });
        }
    }

    /// <summary>
    /// The votes one problem drew in a poll.
    /// </summary>
    public readonly record struct ProblemVote(int Index, int VoteCount);

    /// <summary>
    /// The points one step of the score calculation moved the score.
    /// </summary>
    public readonly record struct ScoreStep(ScoreReason Reason, long Points);
}
