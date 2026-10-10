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

using System.Globalization;
using System.Text.Json.Nodes;
using Micropolis.Conformance;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The migration of saved games against the sample saves under <c>conformance/saveVersions/</c>, one or more of
    /// each version from 5 on, frozen as the game wrote them, and the state each migrates and loads to, which
    /// <c>conformance/migrated/</c> holds.
    /// </summary>
    [TestClass]
    public sealed class SavedGameTests
    {
        public static IEnumerable<object[]> Samples => Directory.GetFiles(ConformanceDirectories.Committed.SaveVersions, "*.json")
            .Order(StringComparer.Ordinal)
            .Select(path => new object[] { Path.GetFileName(path) });

        [TestMethod]
        [DynamicData(nameof(Samples))]
        public void Load_SampleSave_IsTheCommittedMigratedState(string fileName)
        {
            string expected = ConformanceFile.Read($"migrated/{fileName}");
            Simulation city = SavedGame.Load(ConformanceFile.Read($"saveVersions/{fileName}"), out string name);

            Assert.AreEqual("Sample", name);
            JsonObject state = city.Save();

            if (CanonicalJson.Write(state) != expected)
            {
                Assert.Fail(StateComparison.StateDifference(JsonNode.Parse(expected)!, state, city) ?? "The states differ.");
            }
        }

        // The sample of the current version is the text the game wrote, so a city loaded from it writes it
        // back, but for the order of the keys within a component, which the rules write in an order of their own
        [TestMethod]
        public void Write_CityOfTheCurrentSample_WritesTheSampleAsTheGameDid()
        {
            string text = ConformanceFile.Read($"saveVersions/version{SavedGame.CurrentVersion}.json");
            Simulation city = SavedGame.Load(text, out string name);

            string written = SavedGame.Write(name, city);

            Assert.AreEqual(CanonicalJson.Write(JsonText.Parse(text)), CanonicalJson.Write(JsonText.Parse(written)));
            CollectionAssert.AreEqual(JsonText.Parse(text)!.AsObject().Select(member => member.Key).ToList(),
                JsonText.Parse(written)!.AsObject().Select(member => member.Key).ToList(), "The save's own keys, in order");
        }

        [TestMethod]
        public void Migrate_CurrentSave_IsUnchanged()
        {
            string text = ConformanceFile.Read($"saveVersions/version{SavedGame.CurrentVersion}.json");

            Assert.AreEqual(CanonicalJson.Write(JsonText.Parse(text)), CanonicalJson.Write(SavedGame.Migrate(text)));
        }

        [TestMethod]
        [DataRow("an older version", "4", "The save's version is 4, older than version 5")]
        [DataRow("the first version", "1", "The save's version is 1, older than version 5")]
        [DataRow("a newer version", "18", "The save's version is 18, newer than version 17")]
        [DataRow("a negative version", "-3", "The save's version is -3, older than version 5")]
        [DataRow("a version JavaScript writes with an exponent", "1e21", "The save's version is 1e+21, newer than version 17")]
        [DataRow("a version that is not whole", "5.5", "The save's version must be a whole number, not 5.5")]
        [DataRow("a version that is text", "\"5\"", "The save's version must be a whole number, not a string.")]
        [DataRow("a version that is a list", "[5]", "The save's version must be a whole number, not a list.")]
        [DataRow("a version that is null", "null", "The save's version must be a whole number, not null.")]
        public void Load_SaveOfAnotherVersion_IsRefusedNamingIt(string description, string version, string message)
        {
            string text = Edited("version5.json", savedGame => savedGame["version"] = JsonText.Parse(version));
            CultureInfo culture = CultureInfo.CurrentCulture;

            try
            {
                // A culture that writes numbers unlike JavaScript: a minus sign of its own, and a decimal comma
                CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("sv-SE");

                SaveFormatException exception = Assert.Throws<SaveFormatException>(() => SavedGame.Load(text, out _), description);

                StringAssert.StartsWith(exception.Message, message, description);
            }
            finally
            {
                CultureInfo.CurrentCulture = culture;
            }
        }

        // JSON.parse reads a number too large for a double as infinite, which no save can hold, wherever it is
        [TestMethod]
        [DataRow(null, "version", "The save's state.version is a number too large for a double.")]
        [DataRow("budget", "totalFunds", "The save's state.budget.totalFunds is a number too large for a double.")]
        public void Load_SaveHoldingANumberTooLargeForADouble_IsRefusedNamingWhere(string? group, string key, string message)
        {
            const string Marker = "a number too large for a double";
            string text = Edited("version7.json", savedGame => (group is null ? savedGame : savedGame[group]!.AsObject())[key] = Marker)
                .Replace($"\"{Marker}\"", "1e400");

            SaveFormatException exception = Assert.Throws<SaveFormatException>(() => SavedGame.Load(text, out _));

            Assert.AreEqual(message, exception.Message);
        }

        // As a JavaScript `if`: the year end is paid for a value JavaScript takes as true, as for true itself, and not
        // for one it takes as false, as for a save that never waited. Each outcome is compared with true's or with the
        // key's absence.
        [TestMethod]
        [DataRow("1", true)]
        [DataRow("\"yes\"", true)]
        [DataRow("[]", true)]
        [DataRow("{}", true)]
        [DataRow("0", false)]
        [DataRow("\"\"", false)]
        [DataRow("null", false)]
        [DataRow("false", false)]
        public void Load_Version7AwaitingValueThatIsNotBoolean_IsReadAsJavaScriptReadsIt(string awaiting, bool paid)
        {
            string Outcome(Action<JsonObject> editBudget)
            {
                string text = Edited("version7.json", savedGame => editBudget(savedGame["budget"]!.AsObject()));

                return CanonicalJson.Write(SavedGame.Load(text, out _).Save());
            }

            string expected = paid
                ? Outcome(budget => budget["awaitingValues"] = true)
                : Outcome(budget => budget.Remove("awaitingValues"));

            Assert.AreEqual(expected, Outcome(budget => budget["awaitingValues"] = JsonText.Parse(awaiting)));
        }

        [TestMethod]
        public void Load_SaveWithoutAVersion_IsRefused()
        {
            string text = Edited("version5.json", savedGame => savedGame.Remove("version"));

            SaveFormatException exception = Assert.Throws<SaveFormatException>(() => SavedGame.Load(text, out _));

            StringAssert.StartsWith(exception.Message, "The save's version must be a whole number, not missing");
        }

        // A sample with one key replaced, or removed when the replacement is null: at the top of the saved game, or in
        // one of its groups
        [TestMethod]
        [DataRow("version9.json", null, "name", "5", "The save's name must be a string.")]
        [DataRow("version9.json", null, "name", null, "The save's name must be a string.")]
        [DataRow("version6.json", null, "evaluation", null, "The save's evaluation must be an object.")]
        [DataRow("version7.json", null, "budget", "[]", "The save's budget must be an object.")]
        [DataRow("version8.json", "evaluation", "problemOrder", null, "The save's problemOrder must be a list.")]
        public void Load_SaveMissingWhatItsMigrationReads_IsRefusedNamingIt(string sample, string? group, string key, string? replacement, string message)
        {
            string text = Edited(sample, savedGame =>
            {
                JsonObject container = group is null ? savedGame : savedGame[group]!.AsObject();

                if (replacement is null)
                {
                    container.Remove(key);
                }
                else
                {
                    container[key] = JsonText.Parse(replacement);
                }
            });

            SaveFormatException exception = Assert.Throws<SaveFormatException>(() => SavedGame.Load(text, out _));

            Assert.AreEqual(message, exception.Message);
        }

        // A monster from before the river spared a monster until it reached land is taken as ashore, so it keeps the
        // original's rule; no other sprite reaches land
        [TestMethod]
        public void Load_MonsterFromBeforeTheRiverSparedIt_HasReachedLand()
        {
            string text = Edited("version10.json", savedGame =>
            {
                JsonArray list = savedGame["sprites"]!["list"]!.AsArray();
                JsonObject monster = list[0]!.DeepClone().AsObject();
                monster["type"] = (int)SpriteType.Monster;
                list.Insert(0, monster);
            });

            Simulation city = SavedGame.Load(text, out _);

            CollectionAssert.AreEqual(new[] { (SpriteType.Monster, true), (SpriteType.Helicopter, false), (SpriteType.Airplane, false) },
                city.SpriteManager.SpriteList.Select(sprite => (sprite.Type, sprite.ReachedLand)).ToList());
        }

        // A ship from before ships sailed to a port sails in to no port, and no other sprite has a mission. Left between
        // two tiles, it sails on to the tile ahead, or off the map.
        [TestMethod]
        public void Load_ShipFromBeforeShipsSailedToAPort_SailsInToNoPort()
        {
            string text = Edited("version11.json", savedGame =>
            {
                JsonArray list = savedGame["sprites"]!["list"]!.AsArray();
                JsonObject ship = list[1]!.DeepClone().AsObject();
                ship["type"] = (int)SpriteType.Ship;
                ship["x"] = ShipSprite.PixelX(30) + 5;
                ship["y"] = ShipSprite.PixelY(30) + 3;
                list.Add(ship);
            });

            Simulation city = SavedGame.Load(text, out _);

            CollectionAssert.AreEqual(
                new (SpriteType, ShipPhase?, Position?, long?)[]
                {
                    (SpriteType.Monster, null, null, null), (SpriteType.Airplane, null, null, null),
                    (SpriteType.Ship, ShipPhase.SailingIn, null, 0),
                },
                city.SpriteManager.SpriteList.Select(sprite => (sprite.Type, sprite.Mission?.Phase, sprite.Mission?.Port, sprite.Mission?.DockCount)).ToList());
            Sprite ship = city.SpriteManager.GetSprite(SpriteType.Ship)!;
            for (int step = 0; step < 16 && ship.Frame != 0 && !ShipSprite.IsOnTile(ship); step++)
            {
                city.SpriteManager.MoveObjects(city.ConstructSimData());
            }

            Assert.IsTrue(ship.Frame == 0 || ShipSprite.IsOnTile(ship), $"The ship is at ({ship.X}, {ship.Y}).");
        }

        // A plane from before aircraft flew on purpose departs and a helicopter returns; no other sprite has a flight
        [TestMethod]
        public void Load_AircraftFromBeforeFlights_DepartOrReturn()
        {
            Simulation city = SavedGame.Load(Version12WithAHelicopter(), out _);

            CollectionAssert.AreEqual(
                new (SpriteType, PlanePhase?, Position?, CopterPhase?, Position?)[]
                {
                    (SpriteType.Airplane, PlanePhase.Departing, null, null, null), (SpriteType.Ship, null, null, null, null),
                    (SpriteType.Helicopter, null, null, CopterPhase.Returning, null),
                },
                city.SpriteManager.SpriteList.Select(sprite => (sprite.Type, sprite.PlaneFlight?.Phase, sprite.PlaneFlight?.Airport,
                                                                sprite.CopterFlight?.Phase, sprite.CopterFlight?.Block)).ToList());
        }

        // The upgraded plane holds the heading it wandered on until it leaves the map, and the upgraded helicopter flies
        // back to its saved home and lands there
        [TestMethod]
        public void Move_AircraftFromBeforeFlights_LeaveOrLandHome()
        {
            Simulation city = SavedGame.Load(Version12WithAHelicopter(), out _);
            Sprite plane = city.SpriteManager.GetSprite(SpriteType.Airplane)!;
            Sprite copter = city.SpriteManager.GetSprite(SpriteType.Helicopter)!;
            long heading = plane.Frame;
            HashSet<long> planeFrames = [];

            for (int step = 0; step < 1000 && (plane.Frame != 0 || copter.Frame != 0); step++)
            {
                city.SpriteManager.MoveObjects(city.ConstructSimData());
                planeFrames.Add(plane.Frame);
            }

            CollectionAssert.AreEquivalent(new[] { heading, 0L }, planeFrames.ToArray());
            Assert.AreEqual((0L, 0L), (plane.Frame, copter.Frame));
            Assert.IsLessThan(30, Math.Abs(copter.X - 300) + Math.Abs(copter.Y - 900));
        }

        // The version 13 sample holds a train and a plane: the wandering train goes, and the plane flies on
        [TestMethod]
        public void Load_Version13WithATrain_DropsTheTrainAlone()
        {
            JsonArray saved = JsonText.Parse(ConformanceFile.Read("saveVersions/version13.json"))!["sprites"]!["list"]!.AsArray();
            Assert.AreEqual("1, 3", string.Join(", ", saved.Select(sprite => sprite!["type"]!.GetValue<double>())), "Setup: the sample's sprites.");

            Simulation city = SavedGame.Load(ConformanceFile.Read("saveVersions/version13.json"), out _);

            CollectionAssert.AreEqual(new[] { SpriteType.Airplane }, city.SpriteManager.SpriteList.Select(sprite => sprite.Type).ToArray());
        }

        // The step from version 13 starts the rail load empty, a value for each tile of the map
        [TestMethod]
        public void Load_Version13_StartsTheRailLoadEmpty()
        {
            Simulation city = SavedGame.Load(ConformanceFile.Read("saveVersions/version13.json"), out _);

            foreach (bool fromNorthOrWest in new[] { true, false })
            {
                int[] load = city.BlockMaps.RailLoad(fromNorthOrWest).CopyValues();
                Assert.HasCount(city.Map.Width * city.Map.Height, load);
                Assert.AreEqual(0, load.Count(value => value != 0));
            }
        }

        // The step from version 14 splits each tile's rail load evenly between its two ways, an odd rider the north or
        // west's, and starts the step clock at 0
        [TestMethod]
        public void Load_Version14_SplitsTheRailLoadEvenlyBetweenTheWays()
        {
            string text = Edited("version14.json", savedGame =>
            {
                JsonArray railLoad = savedGame["scannedState"]!["blockMaps"]!["railLoadMap"]!.AsArray();
                railLoad[0] = 37;
                railLoad[1] = 240;
            });
            int[] before = JsonText.Parse(text)!["scannedState"]!["blockMaps"]!["railLoadMap"]!.AsArray()
                .Select(riders => (int)riders!.GetValue<double>()).ToArray();

            Simulation city = SavedGame.Load(text, out _);

            int[] fromNorthOrWest = city.BlockMaps.RailLoadFromNorthOrWestMap.CopyValues();
            int[] fromSouthOrEast = city.BlockMaps.RailLoadFromSouthOrEastMap.CopyValues();
            Assert.AreEqual((19, 18, 120, 120), (fromNorthOrWest[0], fromSouthOrEast[0], fromNorthOrWest[1], fromSouthOrEast[1]));
            Assert.IsGreaterThan(10, before.Count(riders => riders > 0), "Too little rail load to check.");
            CollectionAssert.AreEqual(before, fromNorthOrWest.Zip(fromSouthOrEast, (first, other) => first + other).ToArray());
            Assert.IsTrue(fromNorthOrWest.Zip(fromSouthOrEast).All(pair => pair.First - pair.Second is 0 or 1));
            Assert.AreEqual(0, city.StepClock);
        }

        // The step from version 14 copies a tile's rail load outside its range whole to both ways, and leaves a rail
        // load that is no list where it was, for the load to refuse, naming what it refuses
        [TestMethod]
        [DataRow("241", "scannedState.blockMaps.railLoadFromNorthOrWestMap[3]")]
        [DataRow("-1", "scannedState.blockMaps.railLoadFromNorthOrWestMap[3]")]
        [DataRow("1.5", "scannedState.blockMaps.railLoadFromNorthOrWestMap[3]")]
        public void Load_Version14RailLoadOutOfRange_IsRefusedNamingTheEntry(string riders, string path)
        {
            string text = Edited("version14.json",
                                 savedGame => savedGame["scannedState"]!["blockMaps"]!["railLoadMap"]![3] = JsonText.Parse(riders));

            SaveFormatException exception = Assert.Throws<SaveFormatException>(() => SavedGame.Load(text, out _));

            Assert.AreEqual(path, exception.Path, exception.Message);
            JsonNode blockMaps = SavedGame.Migrate(text)["scannedState"]!["blockMaps"]!;
            Assert.AreEqual((riders, riders), (blockMaps["railLoadFromNorthOrWestMap"]![3]!.ToJsonString(),
                                               blockMaps["railLoadFromSouthOrEastMap"]![3]!.ToJsonString()));
        }

        [TestMethod]
        public void Load_Version14RailLoadNoList_IsRefusedNamingAWayOfIt()
        {
            string text = Edited("version14.json", savedGame => savedGame["scannedState"]!["blockMaps"]!["railLoadMap"] = 7);

            SaveFormatException exception = Assert.Throws<SaveFormatException>(() => SavedGame.Load(text, out _));

            Assert.AreEqual("scannedState.blockMaps.railLoadFromNorthOrWestMap", exception.Path, exception.Message);
        }

        // The step from version 13 leaves a map whose size its tiles don't fill with no rail load, for the load to refuse
        // naming the map, and makes nothing the size the map claims
        [TestMethod]
        public void Load_Version13MapLargerThanItsTiles_IsRefusedNamingTheMap()
        {
            string text = Edited("version13.json", savedGame => savedGame["map"]!["width"] = 1_000_000);

            SaveFormatException exception = Assert.Throws<SaveFormatException>(() => SavedGame.Load(text, out _));

            Assert.AreEqual("map.tiles", exception.Path, exception.Message);
            Assert.IsFalse(SavedGame.Migrate(text)["scannedState"]!["blockMaps"]!.AsObject().ContainsKey("railLoadMap"));
        }

        // The step from version 12 drops the distance getDir last found, which no sprite reads before measuring it
        [TestMethod]
        public void Load_Version12_DropsTheSharedDistance()
        {
            Simulation city = SavedGame.Load(ConformanceFile.Read("saveVersions/version12.json"), out _);

            Assert.IsFalse(city.Save()["sprites"]!.AsObject().ContainsKey("absDist"));
        }

        // The step from version 12 leaves an entry that is no sprite, or a sprite whose type is no whole number, for the
        // load to refuse, naming it
        [TestMethod]
        [DataRow("7", "sprites.list[0]")]
        [DataRow("{\"type\":\"plane\"}", "sprites.list[0].type")]
        public void Load_Version12SpriteListHoldingNoSprite_IsRefusedNamingIt(string entry, string path)
        {
            string text = Edited("version12.json", savedGame => savedGame["sprites"]!["list"]![0] = JsonNode.Parse(entry));

            SaveFormatException exception = Assert.Throws<SaveFormatException>(() => SavedGame.Load(text, out _));

            Assert.AreEqual(path, exception.Path, exception.Message);
        }

        // The step from version 10 leaves an entry that is no sprite for the load to refuse, naming it
        [TestMethod]
        public void Load_Version10SpriteListHoldingANumber_IsRefusedNamingTheEntry()
        {
            string text = Edited("version10.json", savedGame => savedGame["sprites"]!["list"]![0] = 7);

            SaveFormatException exception = Assert.Throws<SaveFormatException>(() => SavedGame.Load(text, out _));

            Assert.AreEqual("sprites.list[0]", exception.Path, exception.Message);
        }

        [TestMethod]
        [DataRow("{", "The save's state is not JSON")]
        [DataRow("", "The save's state is not JSON")]
        [DataRow("[]", "The save's state must be an object.")]
        [DataRow("null", "The save's state must be an object.")]
        public void Load_TextThatIsNoSavedGame_IsRefused(string text, string message)
        {
            SaveFormatException exception = Assert.Throws<SaveFormatException>(() => SavedGame.Load(text, out _));

            StringAssert.StartsWith(exception.Message, message);
        }

        // A bare state, as a command log holds one, is upgraded by the steps a saved game is, and left as it was
        [TestMethod]
        [DynamicData(nameof(Samples))]
        public void UpgradeState_SampleWithoutTheGameKeys_IsTheStateItsSavedGameMigratesTo(string fileName)
        {
            string text = ConformanceFile.Read($"saveVersions/{fileName}");
            JsonObject migrated = SavedGame.StripGameKeys(SavedGame.Migrate(text));
            JsonObject sample = JsonText.Parse(text)!.AsObject();
            int version = (int)sample["version"]!.GetValue<double>();
            JsonObject state = SavedGame.StripGameKeys(sample);
            string before = CanonicalJson.Write(state);

            JsonObject upgraded = SavedGame.UpgradeState(state, version);

            Assert.AreEqual(CanonicalJson.Write(migrated), CanonicalJson.Write(upgraded));
            Assert.AreEqual(before, CanonicalJson.Write(state), "The state upgraded is a copy.");
        }

        [TestMethod]
        [DataRow(4, "The save's version is 4, older than version 5")]
        [DataRow(1000, "The save's version is 1000, newer than version")]
        public void UpgradeState_VersionNotMigrated_IsRefusedNamingIt(int version, string message)
        {
            SaveFormatException exception = Assert.Throws<SaveFormatException>(() => SavedGame.UpgradeState(new JsonObject(), version));

            StringAssert.StartsWith(exception.Message, message);
        }

        // A sample's text with the saved game edited as parsed, so the edit doesn't depend on how the sample is laid out
        // The version 12 sample, which holds a plane in flight and a ship, with a helicopter added far from the plane,
        // whose home is (300, 900)
        private static string Version12WithAHelicopter()
        {
            return Edited("version12.json", savedGame =>
            {
                JsonArray list = savedGame["sprites"]!["list"]!.AsArray();
                JsonObject copter = list[0]!.DeepClone().AsObject();
                copter["type"] = (int)SpriteType.Helicopter;
                copter["x"] = 1500;
                copter["y"] = 1300;
                copter["origX"] = 300;
                copter["origY"] = 900;
                list.Add(copter);
            });
        }

        private static string Edited(string sample, Action<JsonObject> edit)
        {
            JsonObject savedGame = JsonText.Parse(ConformanceFile.Read($"saveVersions/{sample}"))!.AsObject();
            edit(savedGame);
            return CanonicalJson.Write(savedGame);
        }
    }
}
