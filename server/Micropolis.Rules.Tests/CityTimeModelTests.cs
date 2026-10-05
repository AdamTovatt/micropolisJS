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
    [TestClass]
    public sealed class CityTimeModelTests
    {
        // 2500 steps from a new city's counters, all 0, pass the speed counter's wrap from 1023 to 0 twice. A phase passes
        // the gate on every 5th, 3rd or 1st value of the counter, and city time advances on phase 0: slow speed lets 500
        // phases through, medium 834, one more than 2500 / 3 since the wrap's 0 opens the gate, and fast 2500. So the
        // city time is 32, 53 and 157, and the phase 4, 2 and 4: without the wrap, medium's phase would be 1.
        [TestMethod]
        [DataRow(Speed.Slow, 32L, 4)]
        [DataRow(Speed.Medium, 53L, 2)]
        [DataRow(Speed.Fast, 157L, 4)]
        public void ImpliedCityTime_EachSpeedPastTheWrap_IsWhereTheCityGets(Speed speed, long cityTime, int phase)
        {
            Simulation city = Simulation.NewCity(1, Level.Easy, speed);
            CityTimeCounters before = CityTimeModel.CountersOf(city);

            for (int i = 0; i < 2500; i++)
            {
                city.Step();
            }

            Assert.AreEqual(new CityTimeCounters(speed, 0, 0, 0), before);
            Assert.AreEqual(cityTime, CityTimeModel.ImpliedCityTime(before, 2500));
            Assert.AreEqual(cityTime, city.CityTime);
            Assert.AreEqual(phase, city.PhaseCycle);
        }

        [TestMethod]
        public void TakeSteps_CityThatDoesNotStep_FailsAsStalled()
        {
            Simulation city = Simulation.NewCity(1, Level.Easy, Speed.Fast);

            StepsFailedException exception = Assert.ThrowsExactly<StepsFailedException>(() => CityTimeModel.TakeSteps(city, 16, () => { }));

            StringAssert.StartsWith(exception.Message, "The city stalled: 16 steps should advance city time from 0 to 1, but it reached 0");
        }

        [TestMethod]
        public void TakeSteps_NegativeSteps_Fails()
        {
            Simulation city = Simulation.NewCity(1, Level.Easy, Speed.Fast);

            Assert.ThrowsExactly<StepsFailedException>(() => CityTimeModel.TakeSteps(city, -1, city.Step));
        }

        [TestMethod]
        public void ImpliedCityTime_Paused_Fails()
        {
            Assert.ThrowsExactly<StepsFailedException>(
                () => CityTimeModel.ImpliedCityTime(new CityTimeCounters(Speed.Paused, 0, 0, 0), 1));
        }
    }
}
