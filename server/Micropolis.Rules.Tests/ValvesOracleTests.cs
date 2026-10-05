/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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
    /// The demand valves against the original's setValves, over cities the fixtures never reach. The original is
    /// transcribed from simulate.cpp in C#'s own <see langword="float"/>, so this also proves that the port's doubles,
    /// rounded through <see cref="JsMath.Fround"/>, work out what single precision does.
    /// </summary>
    [TestClass]
    public sealed class ValvesOracleTests
    {
        private static readonly long[] TaxTable =
            [200, 150, 120, 100, 80, 50, 30, 0, -10, -40, -100, -150, -200, -250, -300, -350, -400, -450, -500, -550, -600];

        private static readonly float[] ExtMarketParamTable = [1.2f, 1.1f, 0.98f];

        [TestMethod]
        public void SetValves_RandomCities_MatchesTheOriginal()
        {
            Lcg random = new Lcg(1);
            List<Figures> cases = Enumerable.Range(0, 20000).Select(_ => RandomFigures(random)).ToList();

            Assert.AreEqual("", Differences(cases));
        }

        // Small towns, where a fraction of a person moves a ratio most, for every tax rate and level
        [TestMethod]
        public void SetValves_EverySmallTown_MatchesTheOriginal()
        {
            List<Figures> cases = new List<Figures>();

            for (long resPop = 0; resPop <= 64; resPop += 4)
            {
                for (long comPop = 0; comPop <= 6; comPop++)
                {
                    for (long indPop = 0; indPop <= 6; indPop++)
                    {
                        for (long cityTax = 0; cityTax <= 20; cityTax += 4)
                        {
                            for (int gameLevel = 0; gameLevel <= 2; gameLevel++)
                            {
                                cases.Add(new Figures(gameLevel, cityTax, resPop, comPop, indPop, resPop >> 3, comPop, indPop, 0, 0, 0, false, false, false));
                            }
                        }
                    }
                }
            }

            Assert.AreEqual("", Differences(cases));
        }

        // A census of a random city, each figure in a short's range, as the original keeps them, some at zero
        private static Figures RandomFigures(Lcg random)
        {
            long Population(int limit) => random.Next(10) == 0 ? 0 : random.Next(limit);

            return new Figures(
                random.Next(3), random.Next(21), Population(30000), Population(3000), Population(3000), Population(4000),
                Population(3000), Population(3000), random.Next(4001) - 2000, random.Next(3001) - 1500, random.Next(3001) - 1500,
                random.Next(5) == 0, random.Next(5) == 0, random.Next(5) == 0);
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

        // simulate.cpp's setValves, each float operation rounded to single precision as C does. One thing follows the
        // port rather than simulate.cpp: its resRatio = min(indRatio, indRatioMax), a slip the 1989 C doesn't make,
        // which the port leaves out, clamping each ratio on its own.
        private static Outcome Original(Figures figures)
        {
            float normalizedResPop = (float)figures.ResPop / 8f;
            long totalPop = (long)(float)((float)(normalizedResPop + figures.ComPop) + figures.IndPop);

            float employment = figures.ResPop > 0 ? (float)((float)(figures.ComHist + figures.IndHist) / normalizedResPop) : 1f;
            float migration = (float)(normalizedResPop * (float)(employment - 1));
            float births = (float)(normalizedResPop * 0.02f);
            float projectedResPop = (float)((float)(normalizedResPop + migration) + births);

            float temp = figures.ComHist + figures.IndHist;
            float laborBase = temp > 0 ? (float)(figures.ResHist / temp) : 1f;
            laborBase = Math.Clamp(laborBase, 0f, 1.3f);

            float internalMarket = (float)((float)((float)(normalizedResPop + figures.ComPop) + figures.IndPop) / 3.7f);
            float projectedComPop = (float)(internalMarket * laborBase);
            float projectedIndPop = (float)((float)(figures.IndPop * laborBase) * ExtMarketParamTable[figures.GameLevel]);
            projectedIndPop = Math.Max(projectedIndPop, 5f);

            float resRatio = normalizedResPop > 0 ? (float)(projectedResPop / normalizedResPop) : 1.3f;
            float comRatio = figures.ComPop > 0 ? (float)(projectedComPop / figures.ComPop) : projectedComPop;
            float indRatio = figures.IndPop > 0 ? (float)(projectedIndPop / figures.IndPop) : projectedIndPop;

            resRatio = Math.Min(resRatio, 2f);
            comRatio = Math.Min(comRatio, 2f);
            indRatio = Math.Min(indRatio, 2f);

            long z = Math.Min(figures.CityTax + figures.GameLevel, 20);
            resRatio = (float)((float)((float)(resRatio - 1) * 600f) + TaxTable[z]);
            comRatio = (float)((float)((float)(comRatio - 1) * 600f) + TaxTable[z]);
            indRatio = (float)((float)((float)(indRatio - 1) * 600f) + TaxTable[z]);

            long resValve = Math.Clamp(figures.ResValve + (long)resRatio, -2000, 2000);
            long comValve = Math.Clamp(figures.ComValve + (long)comRatio, -1500, 1500);
            long indValve = Math.Clamp(figures.IndValve + (long)indRatio, -1500, 1500);

            return new Outcome(
                totalPop,
                figures.ResCap && resValve > 0 ? 0 : resValve,
                figures.ComCap && comValve > 0 ? 0 : comValve,
                figures.IndCap && indValve > 0 ? 0 : indValve);
        }

        private static Outcome Port(Figures figures)
        {
            Valves valves = new Valves
            {
                ResValve = figures.ResValve, ComValve = figures.ComValve, IndValve = figures.IndValve,
                ResCap = figures.ResCap, ComCap = figures.ComCap, IndCap = figures.IndCap,
            };
            Census census = new Census
            {
                ResPop = figures.ResPop, ComPop = figures.ComPop, IndPop = figures.IndPop,
                ResHist10 = History(figures.ResHist), ComHist10 = History(figures.ComHist), IndHist10 = History(figures.IndHist),
            };

            valves.SetValves((Level)figures.GameLevel, census, new Budget { CityTax = figures.CityTax });

            return new Outcome(census.TotalPop, valves.ResValve, valves.ComValve, valves.IndValve);
        }

        // A history whose entry at 1, the previous census's, is the given population
        private static long[] History(long previous)
        {
            long[] history = new long[Census.HistoryLength];
            history[1] = previous;
            return history;
        }

        // What setValves reads: the populations, and the previous census's, the histories' entries at 1
        private readonly record struct Figures(
            int GameLevel, long CityTax, long ResPop, long ComPop, long IndPop, long ResHist, long ComHist, long IndHist,
            long ResValve, long ComValve, long IndValve, bool ResCap, bool ComCap, bool IndCap);

        private readonly record struct Outcome(long TotalPop, long ResValve, long ComValve, long IndValve);
    }
}
