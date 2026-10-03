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

using System.Reflection;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The figures the advisor reads, as <c>test/cityStatus.ts</c> sets them: a calm city, in which no advisor condition
    /// holds, with the figures given changed. A figure is named as the TypeScript names it, and given as
    /// <c>name=value</c>, separated by commas.
    /// </summary>
    internal sealed record CityFigures(Census Census, Budget Budget, PowerManager Power)
    {
        // 20 zones, well balanced, powered, roaded, funded and calm. Every figure a condition reads is listed, so a
        // city loaded from a save is made calm too.
        private const string CalmCity =
            "airportPop=0,cityTax=7,coalPowerPop=1,comPop=50,comZonePop=5,crimeAverage=0,fireEffect=1000,fireStationPop=0," +
            "indPop=50,indZonePop=5,nuclearPowerPop=0,policeEffect=1000,policeStationPop=0,pollutionAverage=0," +
            "powerCapacity=700,powerLoad=100,poweredZoneCount=20,railTotal=0,resPop=100,resZonePop=10,roadEffect=32," +
            "roadTotal=40,seaportPop=0,stadiumPop=0,totalPop=50,trafficAverage=0,unpoweredZoneCount=0";

        public static CityFigures Calm(string figures)
        {
            return CalmIn(new Census(), new Budget(), new PowerManager(new GameMap(1, 1)), figures);
        }

        /// <summary>
        /// Makes a city's own census, budget and power figures calm, with the figures given changed.
        /// </summary>
        public static CityFigures CalmIn(Simulation city, string figures)
        {
            return CalmIn(city.Census, city.Budget, city.PowerManager, figures);
        }

        private static CityFigures CalmIn(Census census, Budget budget, PowerManager power, string figures)
        {
            CityFigures city = new CityFigures(census, budget, power);

            foreach (string figure in $"{CalmCity},{figures}".Split(',', StringSplitOptions.RemoveEmptyEntries))
            {
                string[] parts = figure.Split('=');
                city.Set(parts[0], long.Parse(parts[1]));
            }

            return city;
        }

        // Sets the figure, named as the TypeScript names it, on whichever of the three holds it
        private void Set(string name, long value)
        {
            string property = char.ToUpperInvariant(name[0]) + name[1..];

            foreach (object owner in new object[] { Census, Budget, Power })
            {
                if (owner.GetType().GetProperty(property, BindingFlags.Public | BindingFlags.Instance) is PropertyInfo info)
                {
                    info.SetValue(owner, Convert.ChangeType(value, info.PropertyType));
                    return;
                }
            }

            throw new ArgumentException($"No figure named {name}.", nameof(name));
        }
    }
}
