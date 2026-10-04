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

namespace Micropolis.Server.Tests
{
    /// <summary>
    /// The city time model, as test/cityTimeModel.ts tests the browser's.
    /// </summary>
    [TestClass]
    public sealed class CityTimeModelTests
    {
        [TestMethod]
        [DataRow(Speed.Slow, 80, DisplayName = "slow")]
        [DataRow(Speed.Medium, 48, DisplayName = "medium")]
        [DataRow(Speed.Fast, 16, DisplayName = "fast")]
        public void ImpliedCityTime_AUnitsSteps_AdvancesCityTimeByOne(Speed speed, int steps)
        {
            CityClock start = new CityClock(speed, SpeedCycle: 0, Phase: 1, CityTime: 0);

            Assert.AreEqual(1, CityTimeModel.ImpliedCityTime(start, steps));
            Assert.AreEqual(0, CityTimeModel.ImpliedCityTime(start, steps - 1));
        }

        // At medium, 1023 and then 0 both let a phase through: two phases on consecutive steps
        [TestMethod]
        public void ImpliedCityTime_AcrossTheSpeedCyclesWrap_LetsAPhaseThroughOnBothSides()
        {
            Assert.AreEqual(6, CityTimeModel.ImpliedCityTime(new CityClock(Speed.Medium, 1022, 15, 5), 2));
        }

        [TestMethod]
        public void ImpliedCityTime_Paused_Fails()
        {
            InvalidOperationException exception = Assert.ThrowsExactly<InvalidOperationException>(
                () => CityTimeModel.ImpliedCityTime(new CityClock(Speed.Paused, 0, 0, 0), 1));

            Assert.AreEqual("City time doesn't advance at speed 0", exception.Message);
        }

        [TestMethod]
        [DataRow(Speed.Slow, 0, DisplayName = "slow, from a new city")]
        [DataRow(Speed.Medium, 37, DisplayName = "medium, mid-cycle")]
        [DataRow(Speed.Fast, 522, DisplayName = "fast, across the speed cycle's wrap")]
        public void TakeSteps_TheSimulation_AgreesWithTheModel(Speed speed, int stepsFirst)
        {
            Simulation city = Simulation.NewCity(1, Level.Easy, speed);

            for (int i = 0; i < stepsFirst; i++)
            {
                city.Step();
            }

            CityClock start = CityTimeModel.ClockOf(city);

            CityTimeModel.TakeSteps(city, 1000, city.Step);

            Assert.AreEqual(CityTimeModel.ImpliedCityTime(start, 1000), city.CityTime);
        }

        [TestMethod]
        public void TakeSteps_CityThatStalls_FailsSayingHowFarItGot()
        {
            Simulation city = Simulation.NewCity(1, Level.Easy, Speed.Medium);

            StepsFailedException exception = Assert.ThrowsExactly<StepsFailedException>(() => CityTimeModel.TakeSteps(city, 48, () => { }));

            Assert.AreEqual("The city stalled: 48 steps should advance city time from 0 to 1, but it reached 0", exception.Message);
        }

        [TestMethod]
        [DataRow(0.5, DisplayName = "a fraction")]
        [DataRow(-1.0, DisplayName = "a negative number")]
        public void CheckStepCount_NotAWholeNumber_Fails(double steps)
        {
            Assert.ThrowsExactly<StepsFailedException>(() => CityTimeModel.CheckStepCount(steps));
        }
    }
}
