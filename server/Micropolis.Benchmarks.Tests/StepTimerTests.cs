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

using Micropolis.Rules;
using Microsoft.Extensions.Time.Testing;

namespace Micropolis.Benchmarks.Tests
{
    [TestClass]
    public sealed class StepTimerTests
    {
        [TestMethod]
        [DataRow(new[] { 3.0 }, 3.0, DisplayName = "one value")]
        [DataRow(new[] { 5.0, 1.0, 3.0 }, 3.0, DisplayName = "an odd count, unsorted")]
        [DataRow(new[] { 4.0, 1.0, 2.0, 10.0 }, 3.0, DisplayName = "an even count, unsorted")]
        public void Median_Values_IsTheMiddle(double[] values, double median)
        {
            Assert.AreEqual(median, StepTimer.Median(values));
        }

        [TestMethod]
        public void Median_NoValues_Fails()
        {
            Assert.ThrowsExactly<ArgumentException>(() => StepTimer.Median([]));
        }

        [TestMethod]
        public void Measure_Repeats_EachStartAfreshAndTakeTheWarmupThenTheSteps()
        {
            FakeTimeProvider time = new FakeTimeProvider();

            (StepTiming _, IReadOnlyList<Counter> cities) = StepTimer.Measure(
                () => new Counter(), city => city.Steps++, new BenchmarkSettings(Warmup: 5, Steps: 10, Repeats: 3), time);

            Assert.AreEqual(3, cities.Distinct().Count());
            Assert.IsTrue(cities.All(city => city.Steps == 15));
        }

        [TestMethod]
        public void Measure_Steps_TimesOnlyThoseAfterTheWarmup()
        {
            FakeTimeProvider time = new FakeTimeProvider();

            (StepTiming timing, IReadOnlyList<Counter> _) = StepTimer.Measure(
                () => new Counter(), _ => time.Advance(TimeSpan.FromMilliseconds(2)), new BenchmarkSettings(5, 10, 1), time);

            AssertTiming(500, 2, timing);
        }

        [TestMethod]
        public void Measure_Repeats_GiveTheMedianRepeatsTiming()
        {
            FakeTimeProvider time = new FakeTimeProvider();
            int repeat = 0;

            // The repeats' steps take 4, 1 and 2 milliseconds each
            int[] milliseconds = [4, 1, 2];
            (StepTiming timing, IReadOnlyList<Counter> _) = StepTimer.Measure(
                () => new Counter { Repeat = repeat++ },
                city => time.Advance(TimeSpan.FromMilliseconds(milliseconds[city.Repeat])),
                new BenchmarkSettings(0, 10, 3), time);

            AssertTiming(500, 2, timing);
        }

        [TestMethod]
        public void Measure_Case_GivesTheStateItsCityEndsAt()
        {
            NewCityCase newCity = new NewCityCase(0, Level.Easy, Speed.Fast);
            Simulation expected = newCity.Start();
            for (int step = 0; step < 48; step++)
            {
                expected.Step();
            }

            CaseMeasurement measurement = StepTimer.Measure(newCity, new BenchmarkSettings(16, 32, 2));

            Assert.AreEqual(StateHash.HashSavedState(expected.Save()), measurement.StateHash);
        }

        private static void AssertTiming(double stepsPerSecond, double millisecondsPerStep, StepTiming timing)
        {
            Assert.AreEqual(stepsPerSecond, timing.StepsPerSecond, 1e-9);
            Assert.AreEqual(millisecondsPerStep, timing.MillisecondsPerStep, 1e-9);
        }

        // A city that only counts its steps
        private sealed class Counter
        {
            public int Steps { get; set; }

            public int Repeat { get; init; }
        }
    }
}
