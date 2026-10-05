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

using Micropolis.Rules;

namespace Micropolis.Benchmarks
{
    /// <summary>
    /// How fast a case's city steps, from the repeat that took the median time.
    /// </summary>
    internal sealed record StepTiming(double StepsPerSecond, double MillisecondsPerStep);

    /// <summary>
    /// A case's timing, and the state hash its city ends at, after the warmup and the steps timed.
    /// </summary>
    internal sealed record CaseMeasurement(StepTiming Timing, string StateHash);

    /// <summary>
    /// Times a city's steps: each repeat starts the city afresh, warms it up, then times the steps, so every repeat
    /// times the same steps of the same city.
    /// </summary>
    internal static class StepTimer
    {
        /// <summary>
        /// The case's timing, and the state its city ends at, which every repeat must reach.
        /// </summary>
        public static CaseMeasurement Measure(BenchmarkCase benchmarkCase, BenchmarkSettings settings)
        {
            (StepTiming timing, IReadOnlyList<Simulation> cities) = Measure(benchmarkCase.Start, city => city.Step(), settings,
                                                                             TimeProvider.System);
            List<string> hashes = cities.Select(city => StateHash.HashSavedState(city.Save())).Distinct().ToList();

            if (hashes.Count != 1)
            {
                throw new InvalidOperationException(
                    $"{benchmarkCase.Name} at {benchmarkCase.SpeedName} ended its repeats in {hashes.Count} different states.");
            }

            return new CaseMeasurement(timing, hashes[0]);
        }

        /// <summary>
        /// Times the steps of the cities <paramref name="start"/> starts, one a repeat, on <paramref name="time"/>'s
        /// clock, and gives each city as its repeat leaves it.
        /// </summary>
        internal static (StepTiming Timing, IReadOnlyList<TCity> Cities) Measure<TCity>(
            Func<TCity> start, Action<TCity> step, BenchmarkSettings settings, TimeProvider time)
        {
            List<double> seconds = new List<double>();
            List<TCity> cities = new List<TCity>();

            for (int repeat = 0; repeat < settings.Repeats; repeat++)
            {
                TCity city = start();
                Step(city, step, settings.Warmup);

                // So no garbage left from loading the city is collected while the steps are timed
                GC.Collect();
                GC.WaitForPendingFinalizers();

                long started = time.GetTimestamp();
                Step(city, step, settings.Steps);
                seconds.Add(time.GetElapsedTime(started).TotalSeconds);
                cities.Add(city);
            }

            double median = Median(seconds);
            return (new StepTiming(settings.Steps / median, median * 1000 / settings.Steps), cities);
        }

        /// <summary>
        /// The middle value, or the mean of the middle two of an even count.
        /// </summary>
        public static double Median(IReadOnlyList<double> values)
        {
            if (values.Count == 0)
            {
                throw new ArgumentException("No values have a median.", nameof(values));
            }

            List<double> sorted = values.Order().ToList();
            int middle = sorted.Count / 2;

            return sorted.Count % 2 == 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
        }

        private static void Step<TCity>(TCity city, Action<TCity> step, int steps)
        {
            for (int i = 0; i < steps; i++)
            {
                step(city);
            }
        }
    }
}
