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

using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// Loading and saving the saved states the TypeScript reference writes, and refusing what
    /// <c>docs/state-hash.md</c> doesn't allow.
    /// </summary>
    [TestClass]
    public sealed class SimulationSaveTests
    {
        private static readonly IReadOnlyList<ConformanceSave> Saves = ConformanceSaves.Load();

        // A save with sprites, a non-null announcement and a power source waiting: the town after its run
        private static readonly string RunText = Saves.Single(save => save.Fixture == "town" && save.Point == "run").ReadText();

        // Read only: a test that changes the save parses its own copy of RunText
        private static readonly JsonNode Run = JsonNode.Parse(RunText)!;

        // Every object in the save, the first entry standing for each list of objects
        private static readonly IReadOnlyList<string> ObjectPathList = ObjectPaths(Run, "").ToList();

        public static IEnumerable<object[]> AllSaves => Saves.Select(save => new object[] { save });

        // Every key of every object in the save
        public static IEnumerable<object[]> KeyPaths => ObjectPathList.SelectMany(path => Keys(Run, path).Select(key => new object[] { Join(path, key) }));

        public static IEnumerable<object[]> ObjectPathsOfSave => ObjectPathList.Select(path => new object[] { path });

        public static IEnumerable<object[]> FieldPaths => Fields.Keys.Select(path => new object[] { path });

        public static IEnumerable<object[]> ValuesJustOutsideTheirRange =>
            Ranges.SelectMany(range => new[] { new object[] { range.Path, range.Below }, new object[] { range.Path, range.Above } });

        public static IEnumerable<object[]> ValuesAtTheLimitsOfTheirRange =>
            Ranges.SelectMany(range => new[] { new object[] { range.Path, range.Min }, new object[] { range.Path, range.Max } });

        /// <summary>
        /// Each range <c>docs/state-hash.md</c> states, with its limits and the values just outside them.
        /// </summary>
        private static readonly IReadOnlyList<(string Path, string Below, string Min, string Max, string Above)> Ranges =
        [
            ("simulation.gameLevel", "-1", "0", "2", "3"),
            ("simulation.speed", "-1", "0", "3", "4"),
            ("simulation.seed", "-1", "0", "4294967295", "4294967296"),
            ("simulation.randomState[0]", "-1", "0", "4294967295", "4294967296"),
            ("simulation.speedCycle", "-1", "0", "1023", "1024"),
            ("simulation.phaseCycle", "-1", "0", "15", "16"),
            ("simulation.simCycle", "-1", "0", "1023", "1024"),
            ("map.tiles[0]", "-1", "0", "65535", "65536"),
            ("evaluation.cityScore", "-1", "0", "1000", "1001"),
            ("evaluation.cityYes", "-1", "0", "100", "101"),
            ("evaluation.problemOrder[0]", "-1", "0", "7", "8"),
            ("budget.roadPercent", "-5e-324", "0", "1", "1.0000000000000002"),
            ("budget.firePercent", "-5e-324", "0", "1", "1.0000000000000002"),
            ("budget.policePercent", "-5e-324", "0", "1", "1.0000000000000002"),
            ("map.cityCentreX", "-1", "0", "119", "120"),
            ("map.cityCentreY", "-1", "0", "99", "100"),
            ("map.pollutionMaxX", "-1", "0", "119", "120"),
            ("map.pollutionMaxY", "-1", "0", "99", "100"),
            ("evaluation.problemVotes[0].index", "-1", "0", "6", "7"),
            ("evaluation.problemVotes[0].voteCount", "-1", "0", "100", "101"),
            ("sprites.list[0].type", "0", "1", "7", "8"),
            ("scannedState.blockMaps.cityCentreDistScoreMap[0]", "-65", "-64", "64", "65"),
            ("scannedState.blockMaps.crimeRateMap[0]", "-1", "0", "250", "251"),
            ("scannedState.blockMaps.fireStationMap[0]", "-1", "0", "9000", "9001"),
            ("scannedState.blockMaps.fireStationEffectMap[0]", "-1", "0", "9000", "9001"),
            ("scannedState.blockMaps.landValueMap[0]", "-1", "0", "250", "251"),
            ("scannedState.blockMaps.policeStationMap[0]", "-1", "0", "9000", "9001"),
            ("scannedState.blockMaps.policeStationEffectMap[0]", "-1", "0", "9000", "9001"),
            ("scannedState.blockMaps.pollutionDensityMap[0]", "-1", "0", "255", "256"),
            ("scannedState.blockMaps.populationDensityMap[0]", "-1", "0", "510", "511"),
            ("scannedState.blockMaps.rateOfGrowthMap[0]", "-201", "-200", "200", "201"),
            ("scannedState.blockMaps.terrainDensityMap[0]", "-1", "0", "240", "241"),
            ("scannedState.blockMaps.trafficDensityMap[0]", "-1", "0", "240", "241"),
            ("scannedState.census.needHospital", "-2", "-1", "1", "2"),
            ("scannedState.power.powerGrid[0]", "-1", "0", "1", "2"),
            ("scannedState.power.powerStack[0].x", "-1", "0", "119", "120"),
            ("scannedState.power.powerStack[0].y", "-1", "0", "99", "100"),
        ];

        /// <summary>
        /// Each value the run save holds, with the property it loads into and a value to set it to, which no other key
        /// of its object holds. A list of numbers stands as its first entry. A value of <see langword="null"/> keeps the
        /// saved value.
        /// </summary>
        private static readonly IReadOnlyDictionary<string, (string? Value, Func<Simulation, JsonNode?> Property)> Fields =
            new Dictionary<string, (string? Value, Func<Simulation, JsonNode?> Property)>
            {
                ["simulation.gameLevel"] = ("1", city => (int)city.GameLevel),
                ["simulation.speed"] = ("3", city => (int)city.Speed),
                ["simulation.seed"] = ("77", city => city.Seed),
                ["simulation.randomState[0]"] = ("12345", city => city.Random.GetState()[0]),
                ["simulation.cityTime"] = ("20000", city => city.CityTime),
                ["simulation.speedCycle"] = ("1000", city => city.SpeedCycle),
                ["simulation.phaseCycle"] = ("9", city => city.PhaseCycle),
                ["simulation.simCycle"] = ("146", city => city.SimCycle),
                ["simulation.cityPopLast"] = ("30000", city => city.CityPopLast),
                ["simulation.messageLast"] = ("\"Now a city\"", city => city.MessageLast),
                ["simulation.lastPowerMessage"] = ("140", city => city.LastPowerMessage),
                ["simulation.initialEvaluationPending"] = ("true", city => city.InitialEvaluationPending),
                ["map.width"] = (null, city => city.Map.Width),
                ["map.height"] = (null, city => city.Map.Height),
                ["map.tiles[0]"] = ("2", city => city.Map.GetTileValue(0, 0) | city.Map.GetTileFlags(0, 0)),
                ["map.cityCentreX"] = ("40", city => city.Map.CityCentreX),
                ["map.cityCentreY"] = ("41", city => city.Map.CityCentreY),
                ["map.pollutionMaxX"] = ("42", city => city.Map.PollutionMaxX),
                ["map.pollutionMaxY"] = ("43", city => city.Map.PollutionMaxY),
                ["evaluation.cityClass"] = ("\"CITY\"", city => SavedName.Of(city.Evaluation.CityClass)),
                ["evaluation.cityScore"] = ("500", city => city.Evaluation.CityScore),
                ["evaluation.cityYes"] = ("55", city => city.Evaluation.CityYes),
                ["evaluation.cityPop"] = ("4000", city => city.Evaluation.CityPop),
                ["evaluation.cityPopDelta"] = ("12", city => city.Evaluation.CityPopDelta),
                ["evaluation.cityAssessedValue"] = ("999", city => city.Evaluation.CityAssessedValue),
                ["evaluation.cityClassLast"] = ("\"CAPITAL\"", city => SavedName.Of(city.Evaluation.CityClassLast)),
                ["evaluation.cityScoreDelta"] = ("-5", city => city.Evaluation.CityScoreDelta),
                ["evaluation.problemVotes[0].index"] = ("3", city => city.Evaluation.ProblemVotes[0].Index),
                ["evaluation.problemVotes[0].voteCount"] = ("30", city => city.Evaluation.ProblemVotes[0].VoteCount),
                ["evaluation.problemOrder[0]"] = ("6", city => city.Evaluation.ProblemOrder[0]),
                ["evaluation.cityScoreBreakdown[0].reason"] = ("\"TAXES\"", city => SavedName.Of(city.Evaluation.CityScoreBreakdown[0].Reason)),
                ["evaluation.cityScoreBreakdown[0].points"] = ("-9", city => city.Evaluation.CityScoreBreakdown[0].Points),
                ["valves.resValve"] = ("111", city => city.Valves.ResValve),
                ["valves.comValve"] = ("222", city => city.Valves.ComValve),
                ["valves.indValve"] = ("333", city => city.Valves.IndValve),
                ["valves.resCap"] = ("true", city => city.Valves.ResCap),
                ["valves.comCap"] = ("true", city => city.Valves.ComCap),
                ["valves.indCap"] = ("true", city => city.Valves.IndCap),
                ["budget.totalFunds"] = ("5000", city => city.Budget.TotalFunds),
                ["budget.cityTax"] = ("9", city => city.Budget.CityTax),
                ["budget.autoBudget"] = ("false", city => city.Budget.AutoBudget),
                ["budget.roadPercent"] = ("0.5", city => city.Budget.RoadPercent),
                ["budget.firePercent"] = ("0.25", city => city.Budget.FirePercent),
                ["budget.policePercent"] = ("0.75", city => city.Budget.PolicePercent),
                ["budget.roadSpend"] = ("11", city => city.Budget.RoadSpend),
                ["budget.fireSpend"] = ("12", city => city.Budget.FireSpend),
                ["budget.policeSpend"] = ("13", city => city.Budget.PoliceSpend),
                ["budget.roadMaintenanceBudget"] = ("21", city => city.Budget.RoadMaintenanceBudget),
                ["budget.fireMaintenanceBudget"] = ("22", city => city.Budget.FireMaintenanceBudget),
                ["budget.policeMaintenanceBudget"] = ("23", city => city.Budget.PoliceMaintenanceBudget),
                ["budget.roadEffect"] = ("41", city => city.Budget.RoadEffect),
                ["budget.fireEffect"] = ("42", city => city.Budget.FireEffect),
                ["budget.policeEffect"] = ("43", city => city.Budget.PoliceEffect),
                ["budget.cashFlow"] = ("51", city => city.Budget.CashFlow),
                ["budget.taxFund"] = ("61", city => city.Budget.TaxFund),
                ["census.resPop"] = ("101", city => city.Census.ResPop),
                ["census.comPop"] = ("102", city => city.Census.ComPop),
                ["census.indPop"] = ("113", city => city.Census.IndPop),
                ["census.totalPop"] = ("104", city => city.Census.TotalPop),
                ["census.crimeRamp"] = ("105", city => city.Census.CrimeRamp),
                ["census.pollutionRamp"] = ("106", city => city.Census.PollutionRamp),
                ["census.landValueAverage"] = ("107", city => city.Census.LandValueAverage),
                ["census.pollutionAverage"] = ("108", city => city.Census.PollutionAverage),
                ["census.crimeAverage"] = ("109", city => city.Census.CrimeAverage),
                ["census.resHist10[0]"] = ("201", city => city.Census.ResHist10[0]),
                ["census.comHist10[0]"] = ("202", city => city.Census.ComHist10[0]),
                ["census.indHist10[0]"] = ("203", city => city.Census.IndHist10[0]),
                ["census.crimeHist10[0]"] = ("204", city => city.Census.CrimeHist10[0]),
                ["census.moneyHist10[0]"] = ("205", city => city.Census.MoneyHist10[0]),
                ["census.pollutionHist10[0]"] = ("206", city => city.Census.PollutionHist10[0]),
                ["census.resHist120[0]"] = ("207", city => city.Census.ResHist120[0]),
                ["census.comHist120[0]"] = ("208", city => city.Census.ComHist120[0]),
                ["census.indHist120[0]"] = ("209", city => city.Census.IndHist120[0]),
                ["census.crimeHist120[0]"] = ("210", city => city.Census.CrimeHist120[0]),
                ["census.moneyHist120[0]"] = ("211", city => city.Census.MoneyHist120[0]),
                ["census.pollutionHist120[0]"] = ("212", city => city.Census.PollutionHist120[0]),
                ["sprites.spriteCycle"] = ("99", city => city.SpriteManager.SpriteCycle),
                ["sprites.list[0].type"] = ("3", city => (int)city.SpriteManager.SpriteList[0].Type),
                ["sprites.list[0].frame"] = ("301", city => city.SpriteManager.SpriteList[0].Frame),
                ["sprites.list[0].x"] = ("302", city => city.SpriteManager.SpriteList[0].X),
                ["sprites.list[0].y"] = ("303", city => city.SpriteManager.SpriteList[0].Y),
                ["sprites.list[0].origX"] = ("304", city => city.SpriteManager.SpriteList[0].OrigX),
                ["sprites.list[0].origY"] = ("305", city => city.SpriteManager.SpriteList[0].OrigY),
                ["sprites.list[0].destX"] = ("306", city => city.SpriteManager.SpriteList[0].DestX),
                ["sprites.list[0].destY"] = ("307", city => city.SpriteManager.SpriteList[0].DestY),
                ["sprites.list[0].count"] = ("308", city => city.SpriteManager.SpriteList[0].Count),
                ["sprites.list[0].soundCount"] = ("309", city => city.SpriteManager.SpriteList[0].SoundCount),
                ["sprites.list[0].dir"] = ("310", city => city.SpriteManager.SpriteList[0].Dir),
                ["sprites.list[0].newDir"] = ("311", city => city.SpriteManager.SpriteList[0].NewDir),
                ["sprites.list[0].step"] = ("312", city => city.SpriteManager.SpriteList[0].Step),
                ["sprites.list[0].flag"] = ("313", city => city.SpriteManager.SpriteList[0].Flag),
                ["disasters.floodCount"] = ("7", city => city.DisasterManager.FloodCount),
                ["disasters.disastersEnabled"] = ("true", city => city.DisasterManager.DisastersEnabled),
                ["scannedState.blockMaps.cityCentreDistScoreMap[0]"] = ("51", city => city.BlockMaps.CityCentreDistScoreMap.Get(0, 0)),
                ["scannedState.blockMaps.crimeRateMap[0]"] = ("52", city => city.BlockMaps.CrimeRateMap.Get(0, 0)),
                ["scannedState.blockMaps.fireStationMap[0]"] = ("53", city => city.BlockMaps.FireStationMap.Get(0, 0)),
                ["scannedState.blockMaps.fireStationEffectMap[0]"] = ("54", city => city.BlockMaps.FireStationEffectMap.Get(0, 0)),
                ["scannedState.blockMaps.landValueMap[0]"] = ("55", city => city.BlockMaps.LandValueMap.Get(0, 0)),
                ["scannedState.blockMaps.policeStationMap[0]"] = ("56", city => city.BlockMaps.PoliceStationMap.Get(0, 0)),
                ["scannedState.blockMaps.policeStationEffectMap[0]"] = ("57", city => city.BlockMaps.PoliceStationEffectMap.Get(0, 0)),
                ["scannedState.blockMaps.pollutionDensityMap[0]"] = ("58", city => city.BlockMaps.PollutionDensityMap.Get(0, 0)),
                ["scannedState.blockMaps.populationDensityMap[0]"] = ("59", city => city.BlockMaps.PopulationDensityMap.Get(0, 0)),
                ["scannedState.blockMaps.rateOfGrowthMap[0]"] = ("60", city => city.BlockMaps.RateOfGrowthMap.Get(0, 0)),
                ["scannedState.blockMaps.terrainDensityMap[0]"] = ("61", city => city.BlockMaps.TerrainDensityMap.Get(0, 0)),
                ["scannedState.blockMaps.trafficDensityMap[0]"] = ("62", city => city.BlockMaps.TrafficDensityMap.Get(0, 0)),
                ["scannedState.census.poweredZoneCount"] = ("401", city => city.Census.PoweredZoneCount),
                ["scannedState.census.unpoweredZoneCount"] = ("402", city => city.Census.UnpoweredZoneCount),
                ["scannedState.census.firePop"] = ("403", city => city.Census.FirePop),
                ["scannedState.census.roadTotal"] = ("404", city => city.Census.RoadTotal),
                ["scannedState.census.railTotal"] = ("405", city => city.Census.RailTotal),
                ["scannedState.census.resZonePop"] = ("406", city => city.Census.ResZonePop),
                ["scannedState.census.comZonePop"] = ("407", city => city.Census.ComZonePop),
                ["scannedState.census.indZonePop"] = ("408", city => city.Census.IndZonePop),
                ["scannedState.census.hospitalPop"] = ("409", city => city.Census.HospitalPop),
                ["scannedState.census.churchPop"] = ("410", city => city.Census.ChurchPop),
                ["scannedState.census.policeStationPop"] = ("411", city => city.Census.PoliceStationPop),
                ["scannedState.census.fireStationPop"] = ("412", city => city.Census.FireStationPop),
                ["scannedState.census.stadiumPop"] = ("413", city => city.Census.StadiumPop),
                ["scannedState.census.coalPowerPop"] = ("414", city => city.Census.CoalPowerPop),
                ["scannedState.census.nuclearPowerPop"] = ("415", city => city.Census.NuclearPowerPop),
                ["scannedState.census.seaportPop"] = ("416", city => city.Census.SeaportPop),
                ["scannedState.census.airportPop"] = ("417", city => city.Census.AirportPop),
                ["scannedState.census.needHospital"] = ("-1", city => city.Census.NeedHospital),
                ["scannedState.census.trafficAverage"] = ("31.5", city => city.Census.TrafficAverage),
                ["scannedState.power.powerGrid[0]"] = ("1", city => city.PowerManager.PowerGridMap.Get(0, 0)),
                ["scannedState.power.powerStack[0].x"] = ("61", city => city.PowerManager.PowerStack[0].X),
                ["scannedState.power.powerStack[0].y"] = ("62", city => city.PowerManager.PowerStack[0].Y),
                ["scannedState.power.powerCapacity"] = ("501", city => city.PowerManager.PowerCapacity),
                ["scannedState.power.powerLoad"] = ("502", city => city.PowerManager.PowerLoad),
            };

        [TestMethod]
        [DynamicData(nameof(AllSaves))]
        public void Save_LoadedConformanceSave_WritesTheSameCanonicalText(ConformanceSave save)
        {
            string text = save.ReadText();

            Assert.AreEqual(text, CanonicalJson.Write(Resave(text)));
        }

        // The file's SHA-256 is the TypeScript's state hash, which the generator checks against the golden hash
        [TestMethod]
        [DynamicData(nameof(AllSaves))]
        public void Save_LoadedConformanceSave_HashesAsTypeScript(ConformanceSave save)
        {
            string text = save.ReadText();

            Assert.AreEqual(Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text))), StateHash.HashSavedState(Resave(text)));
        }

        // The round trip can't tell a key read into the wrong property and written back from it, so each key is set to a
        // value its object's other keys don't hold, read back from its property, and saved back to its key
        [TestMethod]
        [DynamicData(nameof(FieldPaths))]
        public void FromSave_DistinctValueAtKey_LoadsIntoItsPropertyAndSavesFromIt(string path)
        {
            (string? value, Func<Simulation, JsonNode?> property) = Fields[path];
            string expected = value ?? CanonicalJson.Write(NodeAt(Run, path));
            string parent = path[..path.LastIndexOf('.')];

            Assert.AreNotEqual(value, CanonicalJson.Write(NodeAt(Run, path)), "The value is the one the save holds.");

            foreach (string sibling in Fields.Keys.Where(other => other != path && other[..other.LastIndexOf('.')] == parent))
            {
                Assert.AreNotEqual(expected, CanonicalJson.Write(NodeAt(Run, sibling)), $"{sibling} holds the value too.");
            }

            JsonNode save = value == null ? Run.DeepClone() : SetAt(path, value);
            Simulation city = Simulation.FromSave(save.ToJsonString());

            Assert.AreEqual(expected, CanonicalJson.Write(property(city)));
            Assert.AreEqual(CanonicalJson.Write(save), CanonicalJson.Write(city.Save()));
        }

        [TestMethod]
        public void Fields_RunSave_ListEveryValueItHolds()
        {
            List<string> values = ObjectPathList
                .SelectMany(path => ObjectAt(Run, path).Where(member => member.Value is not JsonObject)
                    .Where(member => member.Value is not JsonArray list || list.Count == 0 || list[0] is not JsonObject)
                    .Select(member => Join(path, member.Key) + (member.Value is JsonArray ? "[0]" : "")))
                .ToList();

            CollectionAssert.AreEquivalent(values, Fields.Keys.ToList());
        }

        // The saves hold trains, planes and helicopters but no monster, the only sprite with a key of its own: the
        // monster tests below make one
        [TestMethod]
        public void FromSave_ConformanceSaves_CoverWhatTheLoaderReads()
        {
            JsonObject run = JsonNode.Parse(RunText)!.AsObject();

            Assert.IsNotEmpty(run["sprites"]!["list"]!.AsArray(), "No sprite in the run save.");
            Assert.IsNotNull(run["simulation"]!["messageLast"], "No announcement in the run save.");
            Assert.IsNotEmpty(run["scannedState"]!["power"]!["powerStack"]!.AsArray(), "No power source in the run save.");
            Assert.IsNotEmpty(run["evaluation"]!["cityScoreBreakdown"]!.AsArray(), "No score breakdown in the run save.");
        }

        [TestMethod]
        [DynamicData(nameof(KeyPaths))]
        public void FromSave_KeyMissing_ThrowsNamingTheKey(string path)
        {
            JsonNode save = JsonNode.Parse(RunText)!;
            (JsonObject parent, string key) = Locate(save, path);
            parent.Remove(key);

            AssertRejected(save, path);
        }

        [TestMethod]
        [DynamicData(nameof(ObjectPathsOfSave))]
        public void FromSave_UnknownKey_ThrowsNamingTheKey(string path)
        {
            JsonNode save = JsonNode.Parse(RunText)!;
            ObjectAt(save, path)["unknownKey"] = 1;

            AssertRejected(save, Join(path, "unknownKey"));
        }

        [TestMethod]
        [DynamicData(nameof(ValuesJustOutsideTheirRange))]
        [DataRow("simulation.messageLast", "\"Now a village\"")]
        [DataRow("map.width", "0")]
        [DataRow("map.height", "0")]
        [DataRow("evaluation.cityClass", "\"HAMLET\"")]
        [DataRow("evaluation.cityClassLast", "\"village\"")]
        [DataRow("evaluation.problemOrder[0]", "null")]
        [DataRow("evaluation.cityScoreBreakdown[0].reason", "\"LUCK\"")]
        public void FromSave_ValueOutOfItsRange_ThrowsNamingTheKey(string path, string value)
        {
            AssertRejected(SetAt(path, value), path);
        }

        [TestMethod]
        [DynamicData(nameof(ValuesAtTheLimitsOfTheirRange))]
        [DataRow("simulation.lastPowerMessage", "140")]
        [DataRow("budget.roadPercent", "0.53")]
        public void FromSave_AllowedValueTheSavesDontHold_LoadsAndSavesIt(string path, string value)
        {
            JsonObject saveData = Simulation.FromSave(SetAt(path, value).ToJsonString()).Save();

            Assert.AreEqual(value, CanonicalJson.Write(NodeAt(saveData, path)));
        }

        [TestMethod]
        [DataRow("the budget's tax rate", "\"budget\":{", "\"budget\":{\"cityTax\":9,", "budget.cityTax")]
        [DataRow("a sprite's type", "\"list\":[{", "\"list\":[{\"type\":1,", "sprites.list[0].type")]
        public void FromSave_KeyWrittenTwice_ThrowsNamingTheKey(string description, string before, string after, string path)
        {
            Assert.Contains(before, RunText, description);

            AssertRejected(RunText.Replace(before, after), path);
        }

        [TestMethod]
        [DataRow("{")]
        [DataRow("")]
        [DataRow("[]")]
        public void FromSave_NotAnObject_ThrowsNamingTheSave(string text)
        {
            AssertRejected(text, "state");
        }

        [TestMethod]
        public void FromSave_StringThatIsALoneSurrogate_ThrowsNamingTheKey()
        {
            // Edited as text: System.Text.Json writes no lone surrogate
            const string cityClass = "\"cityClass\":\"TOWN\"";
            Assert.Contains(cityClass, RunText);

            AssertRejected(RunText.Replace(cityClass, "\"cityClass\":\"\\ud800\""), "evaluation.cityClass");
        }

        [TestMethod]
        public void FromSave_MapTooLargeToHold_ThrowsNamingTheHeight()
        {
            JsonNode save = SetAt("map.width", "46341");
            ObjectAt(save, "map")["height"] = 46341;

            AssertRejected(save, "map.height");
        }

        [TestMethod]
        public void FromSave_MapLargerThanItsTiles_ThrowsNamingTheTiles()
        {
            JsonNode save = SetAt("map.width", "46000");
            ObjectAt(save, "map")["height"] = 46000;

            AssertRejected(save, "map.tiles");
        }

        [TestMethod]
        [DataRow("simulation.cityTime", "1.5")]
        [DataRow("simulation.cityTime", "\"145\"")]
        [DataRow("simulation.cityTime", "null")]
        [DataRow("simulation.cityTime", "9007199254740992")]
        [DataRow("simulation.initialEvaluationPending", "0")]
        [DataRow("simulation.lastPowerMessage", "true")]
        [DataRow("simulation.messageLast", "5")]
        [DataRow("evaluation.cityClass", "5")]
        [DataRow("simulation.randomState", "{}")]
        [DataRow("map", "[]")]
        [DataRow("budget.totalFunds", "1e400")]
        [DataRow("valves.resCap", "null")]
        [DataRow("scannedState", "null")]
        [DataRow("scannedState.census.trafficAverage", "\"31\"")]
        [DataRow("sprites.list[0]", "7")]
        public void FromSave_ValueOfTheWrongType_ThrowsNamingTheKey(string path, string value)
        {
            AssertRejected(SetAt(path, value), path);
        }

        [TestMethod]
        [DataRow("simulation.randomState")]
        [DataRow("map.tiles")]
        [DataRow("census.resHist10")]
        [DataRow("evaluation.problemVotes")]
        [DataRow("evaluation.problemOrder")]
        [DataRow("scannedState.blockMaps.terrainDensityMap")]
        [DataRow("scannedState.power.powerGrid")]
        public void FromSave_ListOneEntryShort_ThrowsNamingTheKey(string path)
        {
            JsonNode save = JsonNode.Parse(RunText)!;
            JsonArray list = NodeAt(save, path)!.AsArray();
            list.RemoveAt(list.Count - 1);

            AssertRejected(save, path);
        }

        [TestMethod]
        public void FromSave_RandomStateAllZero_ThrowsNamingTheKey()
        {
            AssertRejected(SetAt("simulation.randomState", "[0,0,0,0]"), "simulation.randomState");
        }

        [TestMethod]
        public void FromSave_MonsterWithoutSeenLand_ThrowsNamingTheKey()
        {
            AssertRejected(SetAt("sprites.list[0].type", "5"), "sprites.list[0]._seenLand");
        }

        [TestMethod]
        public void FromSave_OtherSpriteWithSeenLand_ThrowsNamingTheKey()
        {
            AssertRejected(SetAt("sprites.list[0]._seenLand", "true"), "sprites.list[0]._seenLand");
        }

        [TestMethod]
        [DataRow(true)]
        [DataRow(false)]
        public void Save_Monster_WritesWhetherItHasSeenLand(bool seenLand)
        {
            JsonNode save = SetAt("sprites.list[0].type", "5");
            ObjectAt(save, "sprites.list[0]")["_seenLand"] = seenLand;

            Assert.AreEqual(CanonicalJson.Write(save), CanonicalJson.Write(Resave(save.ToJsonString())));
        }

        private static JsonObject Resave(string text)
        {
            return Simulation.FromSave(text).Save();
        }

        private static void AssertRejected(JsonNode save, string path)
        {
            AssertRejected(save.ToJsonString(), path);
        }

        private static void AssertRejected(string saveText, string path)
        {
            SaveFormatException exception = Assert.Throws<SaveFormatException>(() => Simulation.FromSave(saveText));

            Assert.AreEqual(path, exception.Path, exception.Message);
            StringAssert.Contains(exception.Message, path);
        }

        // The run save with the value at a path replaced by the given JSON
        private static JsonNode SetAt(string path, string json)
        {
            JsonNode save = JsonNode.Parse(RunText)!;
            JsonNode? value = JsonNode.Parse(json);
            int bracket = path.LastIndexOf('[');

            if (bracket > path.LastIndexOf('.'))
            {
                JsonArray list = NodeAt(save, path[..bracket])!.AsArray();
                list[int.Parse(path[(bracket + 1)..^1])] = value;
            }
            else
            {
                (JsonObject parent, string key) = Locate(save, path);
                parent[key] = value;
            }

            return save;
        }

        private static (JsonObject Parent, string Key) Locate(JsonNode save, string path)
        {
            int dot = path.LastIndexOf('.');
            return dot < 0 ? (save.AsObject(), path) : (ObjectAt(save, path[..dot]), path[(dot + 1)..]);
        }

        private static JsonObject ObjectAt(JsonNode save, string path)
        {
            return NodeAt(save, path)!.AsObject();
        }

        private static JsonNode? NodeAt(JsonNode save, string path)
        {
            JsonNode? node = save;

            foreach (string part in path.Split('.', StringSplitOptions.RemoveEmptyEntries))
            {
                int bracket = part.IndexOf('[');
                node = bracket < 0 ? node![part] : node![part[..bracket]]![int.Parse(part[(bracket + 1)..^1])];
            }

            return node;
        }

        private static IEnumerable<string> ObjectPaths(JsonNode node, string path)
        {
            if (node is JsonObject value)
            {
                yield return path;

                foreach ((string key, JsonNode? child) in value)
                {
                    if (child != null)
                    {
                        foreach (string childPath in ObjectPaths(child, Join(path, key)))
                        {
                            yield return childPath;
                        }
                    }
                }
            }
            else if (node is JsonArray list && list.Count > 0 && list[0] is JsonObject)
            {
                foreach (string childPath in ObjectPaths(list[0]!, $"{path}[0]"))
                {
                    yield return childPath;
                }
            }
        }

        private static IEnumerable<string> Keys(JsonNode save, string path)
        {
            return ObjectAt(save, path).Select(member => member.Key).ToList();
        }

        private static string Join(string path, string key)
        {
            return path == "" ? key : $"{path}.{key}";
        }
    }
}
