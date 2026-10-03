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
    /// Every unit snapshot run in C#, and the harness that runs them: a snapshot passes when the C# unit leaves the
    /// state and emits the events the TypeScript did, and is inconclusive while the call reaches a unit not yet ported.
    /// </summary>
    [TestClass]
    public sealed class UnitSnapshotTests
    {
        private static readonly IReadOnlyList<UnitSnapshot> Snapshots = UnitSnapshots.Load();

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

        // Phase 0 on a cycle that sets no valves, after the city's first evaluation: the counters and the census
        // clearing, which are ported, so these match rather than stopping at a stub
        [TestMethod]
        public void Simulate_PhaseZeroWithoutValves_CountersAndCensusClearingMatchTypeScript()
        {
            List<(UnitSnapshot Snapshot, JsonObject Record)> records = PhaseZeroRecords().ToList();

            Assert.IsNotEmpty(records);
            foreach ((UnitSnapshot snapshot, JsonObject record) in records)
            {
                Assert.AreEqual(new UnitRun(null, null), UnitSnapshotRunner.Run(record), snapshot.ToString());
            }
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

        // The scanner's core alone, with no handler registered: power to the conductive tiles, the zone counts and the
        // repairs, which are ported
        [TestMethod]
        public void MapScan_WithNoHandlers_MatchesTypeScript()
        {
            List<UnitSnapshot> coreOnly = Snapshots.Where(snapshot => snapshot.Unit == "mapScanner.mapScan" && snapshot.Handlers.Count == 0).ToList();

            Assert.IsNotEmpty(coreOnly);
            foreach (UnitSnapshot snapshot in coreOnly)
            {
                Assert.AreEqual(new UnitRun(null, null), UnitSnapshotRunner.Run(UnitSnapshots.ReadRecord(snapshot)), snapshot.ToString());
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
        // an inconclusive result
        [TestMethod]
        public void AssertMatches_StubReachedThatTheTypeScriptDidNotReach_Fails()
        {
            JsonObject? stopped = Snapshots.Select(UnitSnapshots.ReadRecord)
                .FirstOrDefault(record => UnitSnapshotRunner.Run(record).NotPorted is string unit && unit != (string)record["unit"]!);

            if (stopped is null)
            {
                Assert.Inconclusive("No snapshot reaches a stub any more.");
            }

            stopped["reached"] = new JsonArray();

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
                "args" => snapshot with { Args = snapshot.Args.Select(arg => arg + 1).ToList() },
                _ => snapshot with { Handlers = [] },
            };

            UnitSnapshots.ReadRecord(snapshot);
            Assert.Throws<InvalidDataException>(() => UnitSnapshots.ReadRecord(wrong), description);
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
