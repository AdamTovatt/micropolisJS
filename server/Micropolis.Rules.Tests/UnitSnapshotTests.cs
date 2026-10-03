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
using System.Text.RegularExpressions;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// Every unit snapshot run in C#, and the harness that runs them: a snapshot passes when the C# unit leaves the
    /// state and emits the events the TypeScript did, and is inconclusive while the call reaches a unit not yet ported.
    /// </summary>
    [TestClass]
    public sealed class UnitSnapshotTests
    {
        private static readonly IReadOnlyList<UnitSnapshot> Snapshots = UnitSnapshots.Load();

        // The units, handlers and sprite or disaster functions the C# has a stub for: a record whose call reaches one may
        // be inconclusive, and every other record must pass. A port removes its units from the list.
        private static readonly IReadOnlySet<string> NotYetPorted = new HashSet<string>
        {
            "disasterManager.doDisasters",
            "disasterManager.doMeltdown",
            "disasterManager.makeCrash",
            "disasterManager.makeFire",
            "disasterManager.makeFlood",
            "disasterManager.makeMeltdown",
            "spriteManager.makeExplosion",
            "spriteManager.makeMonster",
            "spriteManager.makeTornado",
            "spriteManager.moveObjects",
            "transport.airportFound",
            "transport.portFound",
            "transport.railFound",
        };

        public static IEnumerable<object[]> AllSnapshots => Snapshots.Select(snapshot => new object[] { snapshot });

        public static string DisplayName(System.Reflection.MethodInfo method, object[] data)
        {
            return data[0].ToString()!;
        }

        [TestMethod]
        [DynamicData(nameof(AllSnapshots), DynamicDataDisplayName = nameof(DisplayName))]
        public void Run_EverySnapshot_MatchesTypeScript(UnitSnapshot snapshot)
        {
            AssertMatches(UnitSnapshots.ReadRecord(snapshot));
        }

        // Every record whose call reaches no unit in NotYetPorted, the unit itself included, must pass: an inconclusive
        // result there would hide a ported unit that stopped at a stub. The map scan's records with no handler prove the
        // scanner's core this way; no repair is registered in them, so the scan's calls to the repair manager are proven
        // by the records of the families that register repairs, and RepairManager.CheckTile itself by helpers.json's
        // repairs.
        [TestMethod]
        public void Run_RecordReachingNoUnitNotYetPorted_MatchesTypeScript()
        {
            List<UnitSnapshot> held = Snapshots
                .Where(snapshot => !NotYetPorted.Contains(snapshot.Unit) && !snapshot.Reached.Any(NotYetPorted.Contains))
                .ToList();

            Assert.IsNotEmpty(held);
            foreach (UnitSnapshot snapshot in held)
            {
                Assert.AreEqual(new UnitRun(null, null), UnitSnapshotRunner.Run(UnitSnapshots.ReadRecord(snapshot)), snapshot.ToString());
            }
        }

        // The list is the stubs, no more and no less: a port removes its unit from it, and a stub that comes back, as a
        // merge that takes a stub's side would bring it, fails here rather than turning its records inconclusive
        [TestMethod]
        public void NotYetPorted_ComparedWithTheStubsInTheSource_NamesEachStub()
        {
            Regex stub = new Regex("new NotPortedException\\(\"([^\"]+)\"\\)");
            List<string> stubs = Directory.GetFiles(RepositoryFiles.GetPath("server/Micropolis.Rules"), "*.cs")
                .SelectMany(file => stub.Matches(File.ReadAllText(file)).Select(match => match.Groups[1].Value))
                .ToList();
            string unlisted = string.Join(", ", stubs.Except(NotYetPorted).Order(StringComparer.Ordinal));
            string ported = string.Join(", ", NotYetPorted.Except(stubs).Order(StringComparer.Ordinal));

            Assert.AreEqual("", unlisted, "A stub for a unit NotYetPorted doesn't list");
            Assert.AreEqual("", ported, "A unit NotYetPorted lists that has no stub, so is ported");
        }

        // The records name the families as the TypeScript registered them, which the generator checks against
        // Simulation.init: every record that registers more than one names them all, in init's order
        [TestMethod]
        public void HandlerFamilies_ComparedWithTheSnapshots_AreInSimulationInitOrder()
        {
            List<UnitSnapshot> registeringAll = Snapshots.Where(snapshot => snapshot.Handlers.Count > 1).ToList();

            Assert.IsNotEmpty(registeringAll);
            foreach (UnitSnapshot snapshot in registeringAll)
            {
                CollectionAssert.AreEqual(snapshot.Handlers.ToList(), Simulation.HandlerFamilies.ToList(), snapshot.ToString());
            }
        }

        [TestMethod]
        [DataRow("the city time", "simulation.cityTime", "simulation.cityTime: expected")]
        [DataRow("a tile", "map.tiles[1234]", "map.tiles, the tile at (34, 10): expected")]
        [DataRow("a block", "scannedState.blockMaps.fireStationMap[17]", "scannedState.blockMaps.fireStationMap, the block at (2, 1) of 8×8 tiles")]
        [DataRow("a power grid entry", "scannedState.power.powerGrid[241]", "scannedState.power.powerGrid, the tile at (1, 2)")]
        public void Run_AfterStateTampered_NamesWhereItDiffers(string description, string path, string message)
        {
            JsonObject record = PhaseZeroRecord();
            Tamper(record["after"]!, path);

            UnitRun run = UnitSnapshotRunner.Run(record);

            Assert.IsNull(run.NotPorted, description);
            StringAssert.Contains(run.Difference, message, description);
        }

        [TestMethod]
        public void Run_KeyMissingFromTheAfterState_NamesTheKey()
        {
            JsonObject record = PhaseZeroRecord();
            record["after"]!["valves"]!.AsObject().Remove("resCap");

            StringAssert.Contains(UnitSnapshotRunner.Run(record).Difference, "valves.resCap: expected no such key, was false");
        }

        [TestMethod]
        public void Run_EventTampered_NamesTheEvent()
        {
            JsonObject record = PhaseZeroRecord();
            record["events"]!.AsArray().Add(new JsonObject { ["name"] = Messages.VALVES_UPDATED });

            StringAssert.Contains(UnitSnapshotRunner.Run(record).Difference, "Event 0 differs: expected {\"name\":\"Valves updated\"}, was no event");
        }

        // A stub the TypeScript's call never reached means the C# called what it should not have: a failure, never
        // an inconclusive result. Every recorded city has random disasters off, so phase 15 run with them on reaches a
        // stub that no record does, as long as random disasters are one; the record then claims to reach nothing.
        [TestMethod]
        public void AssertMatches_StubReachedThatTheTypeScriptDidNotReach_Fails()
        {
            Assert.Contains("disasterManager.doDisasters", NotYetPorted,
                            "Random disasters are ported: this test needs another stub no recorded city reaches.");

            JsonObject stopped = Snapshots.Where(snapshot => snapshot.Unit == "simulation._simulate")
                .Select(UnitSnapshots.ReadRecord)
                .First(record => (int)record["before"]!["simulation"]!["phaseCycle"]! == 15);
            stopped["before"]!["disasters"]!["disastersEnabled"] = true;
            stopped["reached"] = new JsonArray();

            Assert.AreEqual("disasterManager.doDisasters", UnitSnapshotRunner.Run(stopped).NotPorted);
            Assert.Throws<AssertFailedException>(() => AssertMatches(stopped));
        }

        [TestMethod]
        public void Parse_SharedFile_ReadsIt()
        {
            Assert.IsNotEmpty(UnitSnapshots.Parse(ConformanceFile.Read("snapshots/index.json")));
        }

        [TestMethod]
        [DataRow("no snapshots", "{\"snapshots\":[]}", "snapshots is empty")]
        [DataRow("a snapshot without its unit",
                 "{\"snapshots\":[{\"file\":\"f\",\"record\":0,\"fixture\":\"x\",\"speed\":\"medium\",\"step\":1,\"args\":[],\"handlers\":[],\"reached\":[],\"events\":[]}]}",
                 "unit")]
        public void Parse_BrokenIndex_Throws(string description, string json, string message)
        {
            ConformanceAssert.Broken(() => UnitSnapshots.Parse(json), description, message);
        }

        // The map scan's records of one sweep share fixture, unit, step and arguments, so an index entry pointing at its
        // neighbour differs only in the families
        [TestMethod]
        [DataRow("its step", "step")]
        [DataRow("its arguments", "args")]
        [DataRow("its handler families", "handlers")]
        public void ReadRecord_IndexEntryNotTheRecord_Throws(string description, string field)
        {
            UnitSnapshot snapshot = Snapshots.First(candidate => candidate.Unit == "mapScanner.mapScan" && candidate.Handlers.Count == 1);
            UnitSnapshot wrong = field switch
            {
                "step" => snapshot with { Step = snapshot.Step + 1 },
                "args" => snapshot with { Args = snapshot.Args.Select(arg => (JsonNode?)((int)arg! + 1)).ToList() },
                _ => snapshot with { Handlers = [] },
            };

            UnitSnapshots.ReadRecord(snapshot);
            Assert.Throws<InvalidDataException>(() => UnitSnapshots.ReadRecord(wrong), description);
        }

        // A command record's arguments are the commands, compared whole, so an entry naming another record's commands
        // is not its record
        [TestMethod]
        public void ReadRecord_CommandEntryWithAnotherRecordsCommands_Throws()
        {
            List<UnitSnapshot> commands = Snapshots.Where(snapshot => snapshot.Unit == "simulation.applyCommands").ToList();
            UnitSnapshot snapshot = commands[0];
            UnitSnapshot other = commands.First(candidate => !JsonNode.DeepEquals(candidate.Args[0], snapshot.Args[0]));

            UnitSnapshots.ReadRecord(snapshot);
            Assert.Throws<InvalidDataException>(() => UnitSnapshots.ReadRecord(snapshot with { Args = other.Args }));
        }

        /// <summary>
        /// The snapshot's rule: the C# run matches the record, or stops at a stub of a unit the TypeScript's call
        /// reached, which is inconclusive until that unit is ported.
        /// </summary>
        private static void AssertMatches(JsonObject record)
        {
            UnitRun run = UnitSnapshotRunner.Run(record);

            if (run.NotPorted is string unit)
            {
                IReadOnlyList<string> reached = UnitSnapshotRunner.Strings(record["reached"]);

                if (unit == (string)record["unit"]! || reached.Contains(unit))
                {
                    Assert.Inconclusive($"{unit} is not ported yet.");
                }

                string reachedText = reached.Count == 0 ? "no other unit" : string.Join(", ", reached);
                Assert.Fail($"The C# reached {unit}, which the TypeScript's call did not: it reached {reachedText}.");
            }

            if (run.Difference is string difference)
            {
                Assert.Fail(difference);
            }
        }

        // Each fixture's records of phase 0 that reach no other unit
        private static IEnumerable<(UnitSnapshot Snapshot, JsonObject Record)> PhaseZeroRecords()
        {
            return Snapshots.Where(snapshot => snapshot.Unit == "simulation._simulate" && snapshot.Reached.Count == 0)
                .Select(snapshot => (snapshot, UnitSnapshots.ReadRecord(snapshot)))
                .Where(pair => (int)pair.Item2["before"]!["simulation"]!["phaseCycle"]! == 0);
        }

        // A phase 0 record of the suburb that the C# runs to the end
        private static JsonObject PhaseZeroRecord()
        {
            return PhaseZeroRecords().First(pair => pair.Snapshot.Fixture == "suburb").Record;
        }

        // Adds one to the number at the path, a key path with at most one list index at its end
        private static void Tamper(JsonNode state, string path)
        {
            string[] parts = path.Split('[');
            JsonNode parent = state;
            string[] keys = parts[0].Split('.');

            foreach (string key in keys[..^1])
            {
                parent = parent[key]!;
            }

            if (parts.Length == 1)
            {
                parent[keys[^1]] = (long)parent[keys[^1]]! + 1;
                return;
            }

            JsonArray list = parent[keys[^1]]!.AsArray();
            int index = int.Parse(parts[1].TrimEnd(']'));
            list[index] = (long)list[index]! + 1;
        }
    }
}
