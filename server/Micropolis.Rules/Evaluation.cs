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

using System.Diagnostics.CodeAnalysis;
using System.Text.Json.Nodes;
using static Micropolis.Rules.JsMath;

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
        /// The votes a poll stops at (<c>voteProblems</c> in the original's evaluate.cpp), so the most one problem
        /// draws.
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
        /// A new city's evaluation, as the original's <c>evalInit</c> starts it.
        /// </summary>
        public Evaluation()
        {
            EvalInit();
        }

        /// <summary>
        /// The last poll's votes, in the poll's sorted order.
        /// </summary>
        public IReadOnlyList<ProblemVote> ProblemVotes { get; internal set; }

        /// <summary>
        /// The worst problems' indices, worst first, <see cref="NumProblems"/> for none.
        /// </summary>
        public IReadOnlyList<int> ProblemOrder { get; internal set; }

        public IReadOnlyList<ScoreStep> CityScoreBreakdown { get; internal set; }

        /// <summary>
        /// Raises <see cref="Messages.CLASSIFICATION_UPDATED"/> and <see cref="Messages.SCORE_UPDATED"/>.
        /// </summary>
        internal EventEmitter Events { get; } = new EventEmitter();

        // The underfunded police and fire cuts divide the funding share by 10.0001 rather than 10, kept to match
        // evaluate.cpp. A product that 10 would make whole comes out just below it, and truncating drops a point: half
        // funding takes a score of 1000 to 949, not 950.
        private const double ServiceCutDivisor = 10.0001;

        // The 15% cut for each zone type whose demand is capped or has collapsed. evaluate.cpp writes .85 at each of
        // the six.
        private const double DemandCut = 0.85;

        // The problems' indices in the poll
        private const int Crime = 0;
        private const int Pollution = 1;
        private const int Housing = 2;
        private const int Taxes = 3;
        private const int Traffic = 4;
        private const int Unemployment = 5;
        private const int Fire = 6;

        /// <summary>
        /// The population a census counts, as <c>getPopulation</c>: it changes nothing, so the simulation's monthly
        /// growth check asks for it too.
        /// </summary>
        public static long GetPopulation(Census census)
        {
            return (census.ResPop + (census.ComPop + census.IndPop) * 8) * 20;
        }

        /// <summary>
        /// The class of a city of the given population, as <c>getCityClass</c>: it changes nothing.
        /// </summary>
        public static CityClass GetCityClass(long cityPopulation)
        {
            CityClass cityClass = CityClass.Village;

            if (cityPopulation > 2000)
            {
                cityClass = CityClass.Town;
            }

            if (cityPopulation > 10000)
            {
                cityClass = CityClass.City;
            }

            if (cityPopulation > 50000)
            {
                cityClass = CityClass.Capital;
            }

            if (cityPopulation > 100000)
            {
                cityClass = CityClass.Metropolis;
            }

            if (cityPopulation > 500000)
            {
                cityClass = CityClass.Megalopolis;
            }

            return cityClass;
        }

        /// <summary>
        /// The yearly evaluation, as <c>cityEvaluation</c>: the assessed value, the population and class, the voters'
        /// problems, the score, and the mayor's approval, drawn from the simulation's stream. A city with nobody in it
        /// starts over, at an even vote.
        /// </summary>
        public void CityEvaluation(SimData simData)
        {
            Census census = simData.Census;

            if (census.TotalPop > 0)
            {
                long[] problemData = new long[NumProblems];

                GetAssessedValue(census);
                DoPopNum(census);
                DoProblems(problemData, census, simData.Budget, simData.BlockMaps, simData.Random);
                GetScore(problemData, simData);
                DoVotes(simData.Random);
            }
            else
            {
                EvalInit();
                CityYes = 50;
            }
        }

        [MemberNotNull(nameof(CityScoreBreakdown), nameof(ProblemVotes), nameof(ProblemOrder))]
        private void EvalInit()
        {
            CityYes = 0;
            CityPop = 0;
            CityPopDelta = 0;
            CityAssessedValue = 0;
            CityClass = CityClass.Village;
            CityClassLast = CityClass.Village;
            CityScore = 500;
            CityScoreDelta = 0;
            CityScoreBreakdown = [];
            ProblemVotes = Enumerable.Range(0, NumProblems).Select(index => new ProblemVote(index, 0)).ToList();
            ProblemOrder = Enumerable.Repeat(NumProblems, NumComplaints).ToList();
        }

        private void GetAssessedValue(Census census)
        {
            long value = census.RoadTotal * 5;
            value += census.RailTotal * 10;
            value += census.PoliceStationPop * 1000;
            value += census.FireStationPop * 1000;
            value += census.HospitalPop * 400;
            value += census.StadiumPop * 3000;
            value += census.SeaportPop * 5000;
            value += census.AirportPop * 10000;
            value += census.CoalPowerPop * 3000;
            value += census.NuclearPowerPop * 6000;

            CityAssessedValue = value * 1000;
        }

        // The year's population, its change since the last evaluation, and the city's class, as doPopNum
        private void DoPopNum(Census census)
        {
            long oldPopulation = CityPop;
            CityPop = GetPopulation(census);
            CityPopDelta = CityPop - oldPopulation;
            CityClass = GetCityClass(CityPop);

            if (CityClass != CityClassLast)
            {
                CityClassLast = CityClass;
                Events.Emit(Messages.CLASSIFICATION_UPDATED, SavedName.Of(CityClass));
            }
        }

        // The problems the voters weigh, the poll on them, and the worst ranked, worst first
        private void DoProblems(long[] problemData, Census census, Budget budget, BlockMaps blockMaps, RandomStream random)
        {
            problemData[Crime] = census.CrimeAverage;
            problemData[Pollution] = census.PollutionAverage;
            problemData[Housing] = census.LandValueAverage * 7 / 10;
            problemData[Taxes] = budget.CityTax * 10;
            problemData[Traffic] = GetTrafficAverage(blockMaps, census);
            problemData[Unemployment] = GetUnemployment(census);
            problemData[Fire] = GetFireSeverity(census);

            List<ProblemVote> votes = VoteProblems(problemData, random);

            // Ranked by votes, a stable sort, so a tie goes to the problem polled first
            ProblemVotes = votes.OrderByDescending(vote => vote.VoteCount).ToList();
            ProblemOrder = ProblemVotes.Take(NumComplaints).Select(vote => vote.VoteCount == 0 ? NumProblems : vote.Index).ToList();
        }

        // Up to 100 votes on the problems, a voter upset by a problem past their tolerance, giving up after 600 voters
        private static List<ProblemVote> VoteProblems(long[] problemData, RandomStream random)
        {
            int[] voteCounts = new int[NumProblems];
            int problem = 0;
            int voteCount = 0;
            int loopCount = 0;

            while (voteCount < MaxVotes && loopCount < 600)
            {
                int voterProblemTolerance = random.GetRandom(300);

                if (problemData[problem] > voterProblemTolerance)
                {
                    voteCounts[problem]++;
                    voteCount++;
                }

                // A deliberate divergence: evaluate.cpp's loop cycles through PROBNUM + 1 slots, past the end of its
                // problem table, which is undefined behaviour no port can reproduce. This cycles through the seven
                // problems.
                problem = (problem + 1) % NumProblems;
                loopCount++;
            }

            return voteCounts.Select((count, index) => new ProblemVote(index, count)).ToList();
        }

        // The average traffic on developed land, which it also sets as the census's traffic average
        private static long GetTrafficAverage(BlockMaps blockMaps, Census census)
        {
            BlockMap trafficDensityMap = blockMaps.TrafficDensityMap;
            BlockMap landValueMap = blockMaps.LandValueMap;

            long trafficTotal = 0;
            long count = 1;

            // Each land value block, and the traffic at its corner, as getTrafficAverage in evaluate.cpp steps through
            // the map
            for (int x = 0; x < landValueMap.Width * landValueMap.BlockSize; x += landValueMap.BlockSize)
            {
                for (int y = 0; y < landValueMap.Height * landValueMap.BlockSize; y += landValueMap.BlockSize)
                {
                    if (landValueMap.WorldGet(x, y) > 0)
                    {
                        trafficTotal += trafficDensityMap.WorldGet(x, y);
                        count++;
                    }
                }
            }

            long trafficAverage = (long)Math.Truncate(trafficTotal / count * 2.4);
            census.TrafficAverage = trafficAverage;

            return trafficAverage;
        }

        private static long GetUnemployment(Census census)
        {
            // evaluate.cpp keeps the jobs in a short, which wraps past 32767: more than 4095 commercial and industrial
            // people count as a negative number of jobs
            long jobs = unchecked((short)((census.ComPop + census.IndPop) * 8));

            if (jobs == 0)
            {
                return 0;
            }

            // Ratio of residents to jobs, in float as evaluate.cpp works it out
            double ratio = Fround(Fround(census.ResPop) / Fround(jobs));

            // A deliberate divergence: evaluate.cpp converts this float to a short, and past about 130 residents per
            // job it is out of a short's range, where C leaves the conversion undefined. The port keeps the value and
            // caps it at 255.
            long unemployment = (long)Math.Truncate(Fround(Fround(ratio - 1) * 255));
            return Math.Min(unemployment, 255);
        }

        private static long GetFireSeverity(Census census)
        {
            return Math.Min(census.FirePop * 5, 255);
        }

        // The score, as getScore, with the points each step moved it: the problems entry is measured from last year's
        // score, and the problems and averaging entries are always listed; an adjustment is listed only when it moved
        // the score. So the entries sum to the score's change.
        private void GetScore(long[] problemData, SimData simData)
        {
            Census census = simData.Census;
            Budget budget = simData.Budget;
            Valves valves = simData.Valves;

            long cityScoreLast = CityScore;
            List<ScoreStep> breakdown = new List<ScoreStep>();
            long scoreBefore = cityScoreLast;

            void AddEntry(ScoreReason reason, long scoreAfter)
            {
                breakdown.Add(new ScoreStep(reason, scoreAfter - scoreBefore));
                scoreBefore = scoreAfter;
            }

            void RecordAdjustment(ScoreReason reason, long scoreAfter)
            {
                if (scoreAfter != scoreBefore)
                {
                    AddEntry(reason, scoreAfter);
                }
            }

            // A third of the problems' sum, capped at 256, gives a base of up to 1024, clamped to 1000. C#'s integer
            // division truncates toward zero, as each (int) cast and integer division in evaluate.cpp does.
            long score = problemData.Sum() / 3;
            score = Math.Min(score, 256);
            score = Math.Clamp((256 - score) * 4, 0, 1000);
            AddEntry(ScoreReason.Problems, score);

            // The adjustments follow evaluate.cpp's in order, so the repeated blocks are kept

            // 15% off for each zone type whose demand is capped for want of a building
            if (valves.ResCap)
            {
                score = (long)Math.Truncate(score * DemandCut);
                RecordAdjustment(ScoreReason.ResCap, score);
            }

            if (valves.ComCap)
            {
                score = (long)Math.Truncate(score * DemandCut);
                RecordAdjustment(ScoreReason.ComCap, score);
            }

            if (valves.IndCap)
            {
                score = (long)Math.Truncate(score * DemandCut);
                RecordAdjustment(ScoreReason.IndCap, score);
            }

            // Underfunded roads and rail
            if (budget.RoadEffect < Budget.MaxRoadEffect)
            {
                score -= Budget.MaxRoadEffect - budget.RoadEffect;
                RecordAdjustment(ScoreReason.RoadFunding, score);
            }

            // Up to 10% off for underfunded police and fire services
            if (budget.PoliceEffect < Budget.MaxPoliceStationEffect)
            {
                score = (long)Math.Truncate(score * (0.9 + (budget.PoliceEffect / (ServiceCutDivisor * Budget.MaxPoliceStationEffect))));
                RecordAdjustment(ScoreReason.PoliceFunding, score);
            }

            if (budget.FireEffect < Budget.MaxFireStationEffect)
            {
                score = (long)Math.Truncate(score * (0.9 + (budget.FireEffect / (ServiceCutDivisor * Budget.MaxFireStationEffect))));
                RecordAdjustment(ScoreReason.FireFunding, score);
            }

            // 15% off for each zone type whose demand has collapsed from oversupply
            if (valves.ResValve < -1000)
            {
                score = (long)Math.Truncate(score * DemandCut);
                RecordAdjustment(ScoreReason.ResOversupply, score);
            }

            if (valves.ComValve < -1000)
            {
                score = (long)Math.Truncate(score * DemandCut);
                RecordAdjustment(ScoreReason.ComOversupply, score);
            }

            if (valves.IndValve < -1000)
            {
                score = (long)Math.Truncate(score * DemandCut);
                RecordAdjustment(ScoreReason.IndOversupply, score);
            }

            // evaluate.cpp's SM, a float. The score is left as it is if the city is empty, if nobody moved, if the
            // first settlers have just arrived, or if the city has doubled.
            double migrationScale = 1.0;

            if (CityPop == 0 || CityPopDelta == 0 || CityPopDelta == CityPop)
            {
                migrationScale = 1.0;
            }
            else if (CityPopDelta > 0)
            {
                // Growing: scaled by the share the population grew
                migrationScale = Fround(Fround(Fround(CityPopDelta) / Fround(CityPop)) + 1.0);
            }
            else if (CityPopDelta < 0)
            {
                // Shrinking: 0.95 less the share of last year's population that left
                migrationScale = Fround(Fround(0.95) +
                    Fround(Fround(CityPopDelta) / Fround(CityPop - CityPopDelta)));
            }

            score = (long)Math.Truncate(Fround(Fround(score) * migrationScale));
            RecordAdjustment(ScoreReason.Migration, score);

            // Fires and a burdensome tax rate, recorded apart
            score -= GetFireSeverity(census);
            RecordAdjustment(ScoreReason.Fires, score);

            score -= budget.CityTax;
            RecordAdjustment(ScoreReason.Taxes, score);

            // Scaled by the share of zones that are powered, in float: evaluate.cpp's TM, the zone total, is a float
            double zoneTotal = Fround(census.UnpoweredZoneCount + census.PoweredZoneCount);

            if (zoneTotal > 0)
            {
                score = (long)Math.Truncate(Fround(Fround(score) * Fround(Fround(census.PoweredZoneCount) / zoneTotal)));
            }

            RecordAdjustment(ScoreReason.UnpoweredZones, score);

            // Into 0–1000, and averaged with last year's score
            score = Math.Clamp(score, 0, 1000);
            RecordAdjustment(ScoreReason.Range, score);

            CityScore = (int)((CityScore + score) / 2);
            AddEntry(ScoreReason.Averaging, CityScore);
            CityScoreBreakdown = breakdown;

            CityScoreDelta = CityScore - cityScoreLast;

            if (CityScoreDelta != 0)
            {
                Events.Emit(Messages.SCORE_UPDATED, CityScore);
            }
        }

        // A hundred voters asked about the mayor's performance
        private void DoVotes(RandomStream random)
        {
            CityYes = 0;

            for (int i = 0; i < 100; i++)
            {
                int voterExpectation = random.GetRandom(1000);

                if (CityScore > voterExpectation)
                {
                    CityYes++;
                }
            }
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
