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
    /// The tax collection against the original's collectTax, over cities the fixtures never reach. The original is
    /// transcribed from simulate.cpp in C#'s own <see langword="float"/> and <see langword="short"/>, so this also
    /// proves that the port's doubles, rounded through <see cref="JsMath.Fround"/>, work out what single precision
    /// does.
    /// </summary>
    [TestClass]
    public sealed class CollectTaxOracleTests
    {
        private static readonly float[] RLevels = [0.7f, 0.9f, 1.2f];
        private static readonly float[] FLevels = [1.4f, 1.2f, 0.8f];

        [TestMethod]
        public void CollectTax_RandomCities_MatchesTheOriginal()
        {
            Lcg random = new Lcg(1);
            List<Figures> cases = Enumerable.Range(0, 20000).Select(_ => City() with
            {
                GameLevel = random.Next(3), CityTax = random.Next(21), TotalPop = random.Next(10) == 0 ? 0 : random.Next(10000),
                LandValueAverage = random.Next(251), RoadTotal = random.Next(3000), RailTotal = random.Next(1000),
                PoliceStationPop = random.Next(20), FireStationPop = random.Next(20),
            }).ToList();

            Assert.AreEqual("", Differences(cases));
        }

        [TestMethod]
        public void CollectTax_EveryRoadAndRailTotalTo3000_MatchesTheOriginalsRoadMaintenance()
        {
            List<Figures> cases = new List<Figures>();

            for (int gameLevel = 0; gameLevel <= 2; gameLevel++)
            {
                for (long roadTotal = 0; roadTotal <= 3000; roadTotal++)
                {
                    cases.Add(City() with { GameLevel = gameLevel, RoadTotal = roadTotal });
                    cases.Add(City() with { GameLevel = gameLevel, RoadTotal = roadTotal, RailTotal = roadTotal >> 2 });
                }
            }

            Assert.AreEqual("", Differences(cases));
        }

        [TestMethod]
        public void CollectTax_EveryTaxBaseTo3000_MatchesTheOriginalsTax()
        {
            List<Figures> cases = new List<Figures>();

            for (int gameLevel = 0; gameLevel <= 2; gameLevel++)
            {
                for (long cityTax = 0; cityTax <= 20; cityTax++)
                {
                    for (long totalPop = 1; totalPop <= 3000; totalPop++)
                    {
                        cases.Add(City() with { GameLevel = gameLevel, CityTax = cityTax, TotalPop = totalPop, LandValueAverage = 120 });
                    }
                }
            }

            Assert.AreEqual("", Differences(cases));
        }

        private static Figures City()
        {
            return new Figures(0, 7, 0, 0, 0, 0, 0, 0);
        }

        // The first few cases the two differ for, one a line
        private static string Differences(IEnumerable<Figures> cases)
        {
            return string.Join("\n", cases
                .Select(figures => (Figures: figures, Original: Original(figures), Port: Port(figures)))
                .Where(result => result.Original != result.Port)
                .Take(5)
                .Select(result => $"{result.Figures}: the original gives {result.Original}, the port {result.Port}"));
        }

        // simulate.cpp's collectTax, its floats rounded to single precision and its cash flow kept in a short, as C does
        private static Outcome Original(Figures figures)
        {
            long policeFund = figures.PoliceStationPop * 100;
            long fireFund = figures.FireStationPop * 100;
            long roadFund = (long)(float)((float)(figures.RoadTotal + (figures.RailTotal * 2)) * RLevels[figures.GameLevel]);
            long taxFund = (long)(float)((float)(figures.TotalPop * figures.LandValueAverage / 120 * figures.CityTax) * FLevels[figures.GameLevel]);
            long cashFlow = figures.TotalPop > 0 ? unchecked((short)(taxFund - (policeFund + fireFund + roadFund))) : 0;

            return new Outcome(policeFund, fireFund, roadFund, taxFund, cashFlow);
        }

        private static Outcome Port(Figures figures)
        {
            Budget budget = new Budget { CityTax = figures.CityTax, TotalFunds = 1_000_000_000 };
            Census census = new Census
            {
                TotalPop = figures.TotalPop, LandValueAverage = figures.LandValueAverage, RoadTotal = figures.RoadTotal,
                RailTotal = figures.RailTotal, PoliceStationPop = figures.PoliceStationPop, FireStationPop = figures.FireStationPop,
            };

            budget.CollectTax((Level)figures.GameLevel, census);

            return new Outcome(budget.PoliceMaintenanceBudget, budget.FireMaintenanceBudget, budget.RoadMaintenanceBudget,
                               budget.TaxFund, budget.CashFlow);
        }

        // What collectTax reads
        private readonly record struct Figures(
            int GameLevel, long CityTax, long TotalPop, long LandValueAverage, long RoadTotal, long RailTotal,
            long PoliceStationPop, long FireStationPop);

        private readonly record struct Outcome(
            long PoliceMaintenanceBudget, long FireMaintenanceBudget, long RoadMaintenanceBudget, long TaxFund, long CashFlow);
    }
}
