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

namespace Micropolis.Rules
{
    /// <summary>
    /// The census: populations, averages and their histories, saved under <c>census</c>, and what the map scan
    /// counts, saved under <c>scannedState.census</c>.
    /// </summary>
    public sealed class Census
    {
        /// <summary>
        /// The entries in each history, newest first.
        /// </summary>
        public const int HistoryLength = 120;

        public long ResPop { get; set; }

        public long ComPop { get; set; }

        public long IndPop { get; set; }

        public long TotalPop { get; set; }

        public long CrimeRamp { get; set; }

        public long PollutionRamp { get; set; }

        public long LandValueAverage { get; set; }

        public long PollutionAverage { get; set; }

        public long CrimeAverage { get; set; }

        // One per 10-cycle census
        public long[] ResHist10 { get; set; } = new long[HistoryLength];

        public long[] ComHist10 { get; set; } = new long[HistoryLength];

        public long[] IndHist10 { get; set; } = new long[HistoryLength];

        public long[] CrimeHist10 { get; set; } = new long[HistoryLength];

        public long[] MoneyHist10 { get; set; } = new long[HistoryLength];

        public long[] PollutionHist10 { get; set; } = new long[HistoryLength];

        // One per 120-cycle census
        public long[] ResHist120 { get; set; } = new long[HistoryLength];

        public long[] ComHist120 { get; set; } = new long[HistoryLength];

        public long[] IndHist120 { get; set; } = new long[HistoryLength];

        public long[] CrimeHist120 { get; set; } = new long[HistoryLength];

        public long[] MoneyHist120 { get; set; } = new long[HistoryLength];

        public long[] PollutionHist120 { get; set; } = new long[HistoryLength];

        // The map scan's counts
        public long PoweredZoneCount { get; set; }

        public long UnpoweredZoneCount { get; set; }

        public long FirePop { get; set; }

        public long RoadTotal { get; set; }

        public long RailTotal { get; set; }

        public long ResZonePop { get; set; }

        public long ComZonePop { get; set; }

        public long IndZonePop { get; set; }

        public long HospitalPop { get; set; }

        public long ChurchPop { get; set; }

        public long PoliceStationPop { get; set; }

        public long FireStationPop { get; set; }

        public long StadiumPop { get; set; }

        public long CoalPowerPop { get; set; }

        public long NuclearPowerPop { get; set; }

        public long SeaportPop { get; set; }

        public long AirportPop { get; set; }

        /// <summary>
        /// -1, 0 or 1: whether the city has a hospital too many, the right number, or needs one.
        /// </summary>
        public int NeedHospital { get; set; }

        /// <summary>
        /// The traffic average, which is not always an integer.
        /// </summary>
        public double TrafficAverage { get; set; }

        public void Save(JsonObject saveData)
        {
            saveData["census"] = new JsonObject
            {
                ["resPop"] = ResPop,
                ["comPop"] = ComPop,
                ["indPop"] = IndPop,
                ["totalPop"] = TotalPop,
                ["crimeRamp"] = CrimeRamp,
                ["pollutionRamp"] = PollutionRamp,
                ["landValueAverage"] = LandValueAverage,
                ["pollutionAverage"] = PollutionAverage,
                ["crimeAverage"] = CrimeAverage,
                ["resHist10"] = SavedList.Of(ResHist10),
                ["comHist10"] = SavedList.Of(ComHist10),
                ["indHist10"] = SavedList.Of(IndHist10),
                ["crimeHist10"] = SavedList.Of(CrimeHist10),
                ["moneyHist10"] = SavedList.Of(MoneyHist10),
                ["pollutionHist10"] = SavedList.Of(PollutionHist10),
                ["resHist120"] = SavedList.Of(ResHist120),
                ["comHist120"] = SavedList.Of(ComHist120),
                ["indHist120"] = SavedList.Of(IndHist120),
                ["crimeHist120"] = SavedList.Of(CrimeHist120),
                ["moneyHist120"] = SavedList.Of(MoneyHist120),
                ["pollutionHist120"] = SavedList.Of(PollutionHist120),
            };
        }

        public void Load(SavedObject saveData)
        {
            saveData.ReadObject("census", census =>
            {
                ResPop = census.ReadSafeInteger("resPop");
                ComPop = census.ReadSafeInteger("comPop");
                IndPop = census.ReadSafeInteger("indPop");
                TotalPop = census.ReadSafeInteger("totalPop");
                CrimeRamp = census.ReadSafeInteger("crimeRamp");
                PollutionRamp = census.ReadSafeInteger("pollutionRamp");
                LandValueAverage = census.ReadSafeInteger("landValueAverage");
                PollutionAverage = census.ReadSafeInteger("pollutionAverage");
                CrimeAverage = census.ReadSafeInteger("crimeAverage");
                ResHist10 = census.ReadSafeIntegerList("resHist10", HistoryLength);
                ComHist10 = census.ReadSafeIntegerList("comHist10", HistoryLength);
                IndHist10 = census.ReadSafeIntegerList("indHist10", HistoryLength);
                CrimeHist10 = census.ReadSafeIntegerList("crimeHist10", HistoryLength);
                MoneyHist10 = census.ReadSafeIntegerList("moneyHist10", HistoryLength);
                PollutionHist10 = census.ReadSafeIntegerList("pollutionHist10", HistoryLength);
                ResHist120 = census.ReadSafeIntegerList("resHist120", HistoryLength);
                ComHist120 = census.ReadSafeIntegerList("comHist120", HistoryLength);
                IndHist120 = census.ReadSafeIntegerList("indHist120", HistoryLength);
                CrimeHist120 = census.ReadSafeIntegerList("crimeHist120", HistoryLength);
                MoneyHist120 = census.ReadSafeIntegerList("moneyHist120", HistoryLength);
                PollutionHist120 = census.ReadSafeIntegerList("pollutionHist120", HistoryLength);
            });
        }

        public void SaveScan(JsonObject scanData)
        {
            scanData["poweredZoneCount"] = PoweredZoneCount;
            scanData["unpoweredZoneCount"] = UnpoweredZoneCount;
            scanData["firePop"] = FirePop;
            scanData["roadTotal"] = RoadTotal;
            scanData["railTotal"] = RailTotal;
            scanData["resZonePop"] = ResZonePop;
            scanData["comZonePop"] = ComZonePop;
            scanData["indZonePop"] = IndZonePop;
            scanData["hospitalPop"] = HospitalPop;
            scanData["churchPop"] = ChurchPop;
            scanData["policeStationPop"] = PoliceStationPop;
            scanData["fireStationPop"] = FireStationPop;
            scanData["stadiumPop"] = StadiumPop;
            scanData["coalPowerPop"] = CoalPowerPop;
            scanData["nuclearPowerPop"] = NuclearPowerPop;
            scanData["seaportPop"] = SeaportPop;
            scanData["airportPop"] = AirportPop;
            scanData["needHospital"] = NeedHospital;
            scanData["trafficAverage"] = TrafficAverage;
        }

        /// <summary>
        /// Reads the scan's counts from <c>scannedState.census</c>, given as <paramref name="scanData"/>.
        /// </summary>
        public void LoadScan(SavedObject scanData)
        {
            PoweredZoneCount = scanData.ReadSafeInteger("poweredZoneCount");
            UnpoweredZoneCount = scanData.ReadSafeInteger("unpoweredZoneCount");
            FirePop = scanData.ReadSafeInteger("firePop");
            RoadTotal = scanData.ReadSafeInteger("roadTotal");
            RailTotal = scanData.ReadSafeInteger("railTotal");
            ResZonePop = scanData.ReadSafeInteger("resZonePop");
            ComZonePop = scanData.ReadSafeInteger("comZonePop");
            IndZonePop = scanData.ReadSafeInteger("indZonePop");
            HospitalPop = scanData.ReadSafeInteger("hospitalPop");
            ChurchPop = scanData.ReadSafeInteger("churchPop");
            PoliceStationPop = scanData.ReadSafeInteger("policeStationPop");
            FireStationPop = scanData.ReadSafeInteger("fireStationPop");
            StadiumPop = scanData.ReadSafeInteger("stadiumPop");
            CoalPowerPop = scanData.ReadSafeInteger("coalPowerPop");
            NuclearPowerPop = scanData.ReadSafeInteger("nuclearPowerPop");
            SeaportPop = scanData.ReadSafeInteger("seaportPop");
            AirportPop = scanData.ReadSafeInteger("airportPop");
            NeedHospital = scanData.ReadInt("needHospital", -1, 1);
            TrafficAverage = scanData.ReadNumber("trafficAverage");
        }
    }
}
