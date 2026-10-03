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
using static Micropolis.Rules.JsMath;

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

        /// <summary>
        /// What the residential population is divided by to compare it with the other zone types', as each residential
        /// zone reports its population scaled up.
        /// </summary>
        public const long ResPopDenom = 8;

        public long ResPop { get; internal set; }

        public long ComPop { get; internal set; }

        public long IndPop { get; internal set; }

        public long TotalPop { get; internal set; }

        public long CrimeRamp { get; internal set; }

        public long PollutionRamp { get; internal set; }

        public long LandValueAverage { get; internal set; }

        public long PollutionAverage { get; internal set; }

        public long CrimeAverage { get; internal set; }

        // One per 10-cycle census
        public IReadOnlyList<long>ResHist10 { get; internal set; } = new long[HistoryLength];

        public IReadOnlyList<long>ComHist10 { get; internal set; } = new long[HistoryLength];

        public IReadOnlyList<long>IndHist10 { get; internal set; } = new long[HistoryLength];

        public IReadOnlyList<long>CrimeHist10 { get; internal set; } = new long[HistoryLength];

        public IReadOnlyList<long>MoneyHist10 { get; internal set; } = new long[HistoryLength];

        public IReadOnlyList<long>PollutionHist10 { get; internal set; } = new long[HistoryLength];

        // One per 120-cycle census
        public IReadOnlyList<long>ResHist120 { get; internal set; } = new long[HistoryLength];

        public IReadOnlyList<long>ComHist120 { get; internal set; } = new long[HistoryLength];

        public IReadOnlyList<long>IndHist120 { get; internal set; } = new long[HistoryLength];

        public IReadOnlyList<long>CrimeHist120 { get; internal set; } = new long[HistoryLength];

        public IReadOnlyList<long>MoneyHist120 { get; internal set; } = new long[HistoryLength];

        public IReadOnlyList<long>PollutionHist120 { get; internal set; } = new long[HistoryLength];

        // The map scan's counts
        public long PoweredZoneCount { get; internal set; }

        public long UnpoweredZoneCount { get; internal set; }

        public long FirePop { get; internal set; }

        public long RoadTotal { get; internal set; }

        public long RailTotal { get; internal set; }

        public long ResZonePop { get; internal set; }

        public long ComZonePop { get; internal set; }

        public long IndZonePop { get; internal set; }

        public long HospitalPop { get; internal set; }

        public long ChurchPop { get; internal set; }

        public long PoliceStationPop { get; internal set; }

        public long FireStationPop { get; internal set; }

        public long StadiumPop { get; internal set; }

        public long CoalPowerPop { get; internal set; }

        public long NuclearPowerPop { get; internal set; }

        public long SeaportPop { get; internal set; }

        public long AirportPop { get; internal set; }

        /// <summary>
        /// -1, 0 or 1: whether the city has a hospital too many, the right number, or needs one.
        /// </summary>
        public int NeedHospital { get; internal set; }

        /// <summary>
        /// The traffic average, which is not always an integer.
        /// </summary>
        public double TrafficAverage { get; internal set; }

        /// <summary>
        /// Zeroes what the map scan counts up, and the populations the zone handlers add to, as phase 0 does before
        /// the cycle's scan.
        /// </summary>
        public void ClearCensus()
        {
            PoweredZoneCount = 0;
            UnpoweredZoneCount = 0;
            FirePop = 0;
            RoadTotal = 0;
            RailTotal = 0;
            ResPop = 0;
            ComPop = 0;
            IndPop = 0;
            ResZonePop = 0;
            ComZonePop = 0;
            IndZonePop = 0;
            HospitalPop = 0;
            ChurchPop = 0;
            PoliceStationPop = 0;
            FireStationPop = 0;
            StadiumPop = 0;
            CoalPowerPop = 0;
            NuclearPowerPop = 0;
            SeaportPop = 0;
            AirportPop = 0;
        }

        /// <summary>
        /// The census every four units of city time, as <c>take10Census</c>: each short-term history moves on one, and
        /// takes the populations, the crime and pollution ramps, and the cash flow scaled to 0–255; and whether the
        /// city needs a hospital.
        /// </summary>
        public void Take10Census(Budget budget)
        {
            ResHist10 = Rotated(ResHist10, FloorDiv(ResPop, ResPopDenom));
            ComHist10 = Rotated(ComHist10, ComPop);
            IndHist10 = Rotated(IndHist10, IndPop);

            // Each ramp moves a quarter of the way to its average, by C#'s integer division, which truncates toward
            // zero as the original's does
            CrimeRamp += (CrimeAverage - CrimeRamp) / 4;
            CrimeHist10 = Rotated(CrimeHist10, Math.Min(CrimeRamp, 255));

            PollutionRamp += (PollutionAverage - PollutionRamp) / 4;
            PollutionHist10 = Rotated(PollutionHist10, Math.Min(PollutionRamp, 255));

            // The cash flow scaled to 0–255, its division truncating as the original's does
            MoneyHist10 = Rotated(MoneyHist10, Math.Clamp((budget.CashFlow / 20) + 128, 0, 255));

            // JavaScript's >>, on the population taken to an int32
            long resPopScaled = (int)ResPop >> 8;

            if (HospitalPop < resPopScaled)
            {
                NeedHospital = 1;
            }
            else if (HospitalPop > resPopScaled)
            {
                NeedHospital = -1;
            }
            else
            {
                NeedHospital = 0;
            }
        }

        /// <summary>
        /// The census every forty units of city time, as <c>take120Census</c>: each long-term history moves on one, and
        /// takes the populations and the short-term histories' newest crime, pollution and money.
        /// </summary>
        public void Take120Census()
        {
            ResHist120 = Rotated(ResHist120, FloorDiv(ResPop, ResPopDenom));
            ComHist120 = Rotated(ComHist120, ComPop);
            IndHist120 = Rotated(IndHist120, IndPop);
            CrimeHist120 = Rotated(CrimeHist120, CrimeHist10[0]);
            PollutionHist120 = Rotated(PollutionHist120, PollutionHist10[0]);
            MoneyHist120 = Rotated(MoneyHist120, MoneyHist10[0]);
        }

        // A history moved on one: the newest entry first, and the oldest dropped
        private static long[] Rotated(IReadOnlyList<long> history, long newest)
        {
            long[] rotated = new long[history.Count];
            rotated[0] = newest;

            for (int i = 1; i < rotated.Length; i++)
            {
                rotated[i] = history[i - 1];
            }

            return rotated;
        }

        internal void Save(JsonObject saveData)
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

        internal void Load(SavedObject saveData)
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

        internal void SaveScan(JsonObject scanData)
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
        internal void LoadScan(SavedObject scanData)
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
