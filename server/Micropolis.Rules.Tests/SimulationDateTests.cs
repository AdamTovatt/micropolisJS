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

using static Micropolis.Rules.Tests.FixtureCities;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The city's date, as the simulation works it out from city time: four units a month, 48 a year, from 1900.
    /// </summary>
    [TestClass]
    public sealed class SimulationDateTests
    {
        [TestMethod]
        [DataRow(0L, 0L, 1900L, DisplayName = "the start")]
        [DataRow(3L, 0L, 1900L, DisplayName = "the last unit of the first month")]
        [DataRow(4L, 1L, 1900L, DisplayName = "the second month")]
        [DataRow(47L, 11L, 1900L, DisplayName = "the last unit of the year")]
        [DataRow(48L, 0L, 1901L, DisplayName = "the next year")]
        [DataRow(4805L, 1L, 2000L, DisplayName = "a century on")]
        public void Date_CityTime_IsTheMonthAndYearItFallsIn(long cityTime, long month, long year)
        {
            Simulation city = City("town", "built", save => save["simulation"]!["cityTime"] = cityTime);

            Assert.AreEqual((month, year), city.Date);
        }
    }
}
