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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The advisor conditions at their thresholds and the city status record, as <c>test/cityStatus.ts</c> tests the
    /// TypeScript's: the unit snapshots reach only the conditions the fixtures' cities meet.
    /// </summary>
    [TestClass]
    public sealed class CityStatusTests
    {
        // Each condition's figures at its thresholds: the last value that triggers it, and the first that does not. The
        // TypeScript's rows that change the budget's most effective funding are left out, as the C# holds it in
        // constants.
        [TestMethod]
        [DataRow(Messages.NOT_ENOUGH_POWER, "powerCapacity=700,powerLoad=701", true)]
        [DataRow(Messages.NOT_ENOUGH_POWER, "powerCapacity=700,powerLoad=700", false)]
        [DataRow(Messages.NEED_ELECTRICITY, "coalPowerPop=0,comZonePop=0,indZonePop=0,resZonePop=11", true)]
        [DataRow(Messages.NEED_ELECTRICITY, "coalPowerPop=0,comZonePop=0,indZonePop=0,resZonePop=10", false)]
        [DataRow(Messages.NEED_ELECTRICITY, "coalPowerPop=0,comZonePop=0,indZonePop=0,nuclearPowerPop=1,resZonePop=11", false)]
        [DataRow(Messages.BLACKOUTS_REPORTED, "poweredZoneCount=6,unpoweredZoneCount=4", true)]
        [DataRow(Messages.BLACKOUTS_REPORTED, "poweredZoneCount=7,unpoweredZoneCount=3", true)]
        [DataRow(Messages.BLACKOUTS_REPORTED, "poweredZoneCount=71,unpoweredZoneCount=29", false)]
        [DataRow(Messages.BLACKOUTS_REPORTED, "coalPowerPop=0,poweredZoneCount=6,unpoweredZoneCount=4", false)]
        [DataRow(Messages.BLACKOUTS_REPORTED, "poweredZoneCount=0,unpoweredZoneCount=0", false)]
        [DataRow(Messages.NEED_STADIUM, "resPop=501", true)]
        [DataRow(Messages.NEED_STADIUM, "resPop=500", false)]
        [DataRow(Messages.NEED_STADIUM, "resPop=501,stadiumPop=1", false)]
        [DataRow(Messages.NEED_AIRPORT, "comPop=101", true)]
        [DataRow(Messages.NEED_AIRPORT, "comPop=100", false)]
        [DataRow(Messages.NEED_AIRPORT, "airportPop=1,comPop=101", false)]
        [DataRow(Messages.NEED_SEAPORT, "indPop=71", true)]
        [DataRow(Messages.NEED_SEAPORT, "indPop=70", false)]
        [DataRow(Messages.NEED_SEAPORT, "indPop=71,seaportPop=1", false)]
        [DataRow(Messages.NEED_MORE_RESIDENTIAL, "comZonePop=10,indZonePop=5,resZonePop=5", true)]
        [DataRow(Messages.NEED_MORE_RESIDENTIAL, "comZonePop=9,indZonePop=5,resZonePop=6", false)]
        [DataRow(Messages.NEED_MORE_COMMERCIAL, "comZonePop=3,indZonePop=8,resZonePop=13", true)]
        [DataRow(Messages.NEED_MORE_COMMERCIAL, "comZonePop=4,indZonePop=8,resZonePop=12", false)]
        [DataRow(Messages.NEED_MORE_INDUSTRIAL, "comZonePop=8,indZonePop=3,resZonePop=13", true)]
        [DataRow(Messages.NEED_MORE_INDUSTRIAL, "comZonePop=8,indZonePop=4,resZonePop=12", false)]
        [DataRow(Messages.NEED_MORE_ROADS, "comZonePop=0,indZonePop=0,resZonePop=11,roadTotal=21", true)]
        [DataRow(Messages.NEED_MORE_ROADS, "comZonePop=0,indZonePop=0,resZonePop=11,roadTotal=22", false)]
        [DataRow(Messages.NEED_MORE_ROADS, "comZonePop=0,indZonePop=0,resZonePop=10,roadTotal=0", false)]
        [DataRow(Messages.NEED_MORE_RAILS, "comZonePop=0,indZonePop=0,railTotal=50,resZonePop=51", true)]
        [DataRow(Messages.NEED_MORE_RAILS, "comZonePop=0,indZonePop=0,railTotal=51,resZonePop=51", false)]
        [DataRow(Messages.NEED_MORE_RAILS, "comZonePop=0,indZonePop=0,railTotal=0,resZonePop=50", false)]
        [DataRow(Messages.HIGH_POLLUTION, "pollutionAverage=61", true)]
        [DataRow(Messages.HIGH_POLLUTION, "pollutionAverage=60", false)]
        [DataRow(Messages.HIGH_CRIME, "crimeAverage=101", true)]
        [DataRow(Messages.HIGH_CRIME, "crimeAverage=100", false)]
        [DataRow(Messages.TRAFFIC_JAMS, "trafficAverage=61", true)]
        [DataRow(Messages.TRAFFIC_JAMS, "trafficAverage=60", false)]
        [DataRow(Messages.NEED_FIRE_STATION, "totalPop=61", true)]
        [DataRow(Messages.NEED_FIRE_STATION, "totalPop=60", false)]
        [DataRow(Messages.NEED_FIRE_STATION, "fireStationPop=1,totalPop=61", false)]
        [DataRow(Messages.NEED_POLICE_STATION, "totalPop=61", true)]
        [DataRow(Messages.NEED_POLICE_STATION, "totalPop=60", false)]
        [DataRow(Messages.NEED_POLICE_STATION, "policeStationPop=1,totalPop=61", false)]
        [DataRow(Messages.TAX_TOO_HIGH, "cityTax=13", true)]
        [DataRow(Messages.TAX_TOO_HIGH, "cityTax=12", false)]
        [DataRow(Messages.ROAD_NEEDS_FUNDING, "roadEffect=19,roadTotal=31", true)]
        [DataRow(Messages.ROAD_NEEDS_FUNDING, "roadEffect=20,roadTotal=31", false)]
        [DataRow(Messages.ROAD_NEEDS_FUNDING, "roadEffect=19,roadTotal=30", false)]
        [DataRow(Messages.FIRE_STATION_NEEDS_FUNDING, "fireEffect=699,totalPop=21", true)]
        [DataRow(Messages.FIRE_STATION_NEEDS_FUNDING, "fireEffect=700,totalPop=21", false)]
        [DataRow(Messages.FIRE_STATION_NEEDS_FUNDING, "fireEffect=699,totalPop=20", false)]
        [DataRow(Messages.POLICE_NEEDS_FUNDING, "policeEffect=699,totalPop=21", true)]
        [DataRow(Messages.POLICE_NEEDS_FUNDING, "policeEffect=700,totalPop=21", false)]
        [DataRow(Messages.POLICE_NEEDS_FUNDING, "policeEffect=699,totalPop=20", false)]
        public void ConditionHolds_AtItsThreshold_HoldsOnlyPastIt(string condition, string figures, bool holds)
        {
            CityFigures city = CityFigures.Calm(figures);

            Assert.AreEqual(holds, CityStatus.ConditionHolds(condition, city.Census, city.Budget, city.Power));
        }

        [TestMethod]
        public void ConditionHolds_UnknownCondition_Throws()
        {
            CityFigures city = CityFigures.Calm("");

            Assert.Throws<ArgumentException>(() => CityStatus.ConditionHolds(Messages.FUNDS_CHANGED, city.Census, city.Budget, city.Power));
        }

        [TestMethod]
        public void Build_CalmCity_ListsNoCondition()
        {
            CityFigures city = CityFigures.Calm("");

            Assert.AreEqual(0, Build(city)["conditions"]!.AsArray().Count);
        }

        [TestMethod]
        public void Build_ConditionsHolding_ListsThemInTheAdvisorsOrder()
        {
            CityFigures city = CityFigures.Calm("cityTax=13,crimeAverage=101,indPop=71,resPop=501,powerCapacity=700,powerLoad=701");

            CollectionAssert.AreEqual(
                new[] { Messages.NOT_ENOUGH_POWER, Messages.NEED_STADIUM, Messages.NEED_SEAPORT, Messages.HIGH_CRIME, Messages.TAX_TOO_HIGH },
                Build(city)["conditions"]!.AsArray().Select(condition => (string)condition!).ToArray());
        }

        [TestMethod]
        [DataRow(true, false, false)]
        [DataRow(false, true, false)]
        [DataRow(false, false, true)]
        public void Build_CapsAndPower_CarriesThem(bool resCap, bool comCap, bool indCap)
        {
            CityFigures city = CityFigures.Calm("powerCapacity=3100,powerLoad=2700");
            Valves valves = new Valves { ResCap = resCap, ComCap = comCap, IndCap = indCap };

            JsonObject status = CityStatus.Build(city.Census, city.Budget, city.Power, valves);

            Assert.AreEqual(
                $"{{\"commercialCapped\":{Json(comCap)},\"conditions\":[],\"industrialCapped\":{Json(indCap)},\"powerCapacity\":3100,\"powerLoad\":2700,\"residentialCapped\":{Json(resCap)}}}",
                CanonicalJson.Write(status));
        }

        private static string Json(bool value)
        {
            return value ? "true" : "false";
        }

        private static JsonObject Build(CityFigures city)
        {
            return CityStatus.Build(city.Census, city.Budget, city.Power, new Valves());
        }
    }
}
