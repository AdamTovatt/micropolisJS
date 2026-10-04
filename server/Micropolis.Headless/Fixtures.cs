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
using Micropolis.Rules;
using Micropolis.SourceTree;
using static Micropolis.Headless.FixtureCommands;

namespace Micropolis.Headless
{
    /// <summary>
    /// A command log the fixture tool writes: the city it starts from, the commands it is sent, and the steps of its
    /// checkpoints, whose hashes the tool works out by replaying it. <paramref name="Start"/> is read when the log is
    /// built, from the directory of the logs, since a fixture whose city no command builds reads its save from its
    /// log there.
    /// </summary>
    internal sealed record Fixture(string Name, string Description, Func<string, LogStart> Start, IReadOnlyList<LoggedCommand> Entries,
                                   IReadOnlyList<int> CheckpointSteps)
    {
        public override string ToString()
        {
            return Name;
        }
    }

    /// <summary>
    /// Every fixture, as <c>headless/fixtures/</c> defines them, and the mid-run logs <c>conformance/generate.ts</c>
    /// adds: each is a command log under <c>conformance/logs/</c>, whose checkpoints are its golden hashes. A fixture
    /// built by commands is a city on seed 8's map at the easy level, which has open land and woods from (10, 10) to
    /// (53, 33), sent every command before its first step. A fixture that needs what no command places starts from a
    /// save, which is committed data, kept in its log: the TypeScript fixture script wrote it, and the tool writes it
    /// back as it reads it, so no C# code builds it.
    /// </summary>
    internal static class Fixtures
    {
        /// <summary>
        /// The step of a fixture's run checkpoint: about three city years at medium speed, the speed a new city starts
        /// at.
        /// </summary>
        public const int RunSteps = 6912;

        /// <summary>
        /// Where the logs are, from the repository root.
        /// </summary>
        public const string LogsDirectory = "conformance/logs";

        public const string LogExtension = ".log.json";

        private const uint Seed = 8;

        // The town: two rows of ten zones either side of a road, a coal plant at the west end
        private const int TownLeft = 14;
        private const int TownTop = 12;
        private const int TownRight = TownLeft + 3 * 10;

        // The plant's top left corner in the branch fixtures, and a block of wire filling the land east of it, which
        // the plant's east side touches
        private const int PlantLeft = 10;
        private const int PlantTop = 10;
        private const int WireLeft = PlantLeft + 4;
        private const int WireRight = 43;
        private const int WireBottom = 33;

        // The hospital town's three rows of eleven zones
        private const int HospitalLeft = 14;
        private const int HospitalTop = 10;
        private const int HospitalRight = HospitalLeft + 3 * 11;

        // The roadless town's row of ten zones along a road, and its residential zone at the end of a dead-end spur
        private const int RoadlessLeft = 14;
        private const int RoadlessTop = 17;
        private const string RoadlessRow = "RRCRIRRCIR";
        private const int RoadlessRoadY = RoadlessTop + 3;
        private const int SpurZoneX = 40;
        private const int SpurZoneY = 25;
        private const int SpurY = SpurZoneY + 2;
        private const int SpurEnd = 53;

        // The commands that build the town's plant, zones and roads, which create no sprites
        private static readonly IReadOnlyList<Command> ZonedTown =
        [
            // The plant's east side touches the north row's first zone
            BuildingAt(ToolName.Coal, TownLeft - 3, TownTop + 1),
            .. ZoneRow("RRCRRCRRCR", TownLeft, TownTop),
            LineOf(ToolName.Road, TownLeft, TownTop + 3, TownRight, TownTop + 3),
            .. ZoneRow("IIIRRCRRII", TownLeft, TownTop + 4),
            LineOf(ToolName.Road, TownLeft, TownTop + 7, TownRight, TownTop + 7),
            LineOf(ToolName.Road, TownRight, TownTop + 4, TownRight, TownTop + 6),

            // The south row touches the plant only at a corner, which doesn't conduct
            LineOf(ToolName.Wire, TownLeft - 1, TownTop + 4, TownLeft - 1, TownTop + 4),
        ];

        // The town, which other fixtures build on: a wire from the south row crosses the south road to the airport,
        // and a railway runs south of it
        private static readonly IReadOnlyList<Command> Town =
        [
            .. ZonedTown,
            LineOf(ToolName.Wire, TownLeft, TownTop + 7, TownLeft, TownTop + 9),
            BuildingAt(ToolName.Airport, TownLeft + 1, TownTop + 11),
            LineOf(ToolName.Rail, TownLeft, TownTop + 17, TownRight + 6, TownTop + 17),
        ];

        // A fire and a police station east of the north row: a wire from the row's last zone powers the fire station,
        // and the police station touches it
        private static readonly IReadOnlyList<Command> Stations =
        [
            LineOf(ToolName.Wire, 44, 13, 44, 13),
            BuildingAt(ToolName.Fire, 46, 13),
            BuildingAt(ToolName.Police, 46, 16),
        ];

        // Three more fire and police stations each, east of the first
        private static readonly IReadOnlyList<Command> MoreStations =
        [
            BuildingAt(ToolName.Police, 50, 13),
            BuildingAt(ToolName.Police, 50, 16),
            BuildingAt(ToolName.Fire, 46, 19),
            BuildingAt(ToolName.Fire, 50, 19),
        ];

        private static readonly Fixture Suburb = Built(
            "suburb", "The town without its airport and railway, with a fire and a police station", [.. ZonedTown, .. Stations]);

        private static readonly Fixture SuburbBroke = Built(
            "suburbBroke", "The suburb with a stadium, a nuclear plant and eight stations, no tax, and too little in the bank for their upkeep",
            [
                .. ZonedTown,
                .. Stations,
                .. MoreStations,
                BuildingAt(ToolName.Stadium, 16, 23),
                BuildingAt(ToolName.Nuclear, 22, 23),
                BuildingAt(ToolName.Police, 27, 23),
                BuildingAt(ToolName.Police, 31, 23),
                new SetBudgetCommand(100, 100, 100, 0),
            ]);

        /// <summary>
        /// Every fixture, in name order.
        /// </summary>
        public static readonly IReadOnlyList<Fixture> All = new List<Fixture>
        {
            Built("broke", "The town with three fire and three police stations, no tax, and too little in the bank for their upkeep",
                  [.. Town, .. Stations, .. MoreStations, new SetBudgetCommand(100, 100, 100, 0)]),
            FromCommittedSave("disasters",
                              "The suburb with fires, a flood, radiation, explosions, a stadium, a fire station and bridges written in",
                              [new SetAutoBudgetCommand(false), new SetBudgetCommand(50, 50, 100, 7)]),
            Built("forestFire", "Seed 8's map with two fires set and nothing built",
                  [new TriggerDisasterCommand(DisasterKind.Fire), new TriggerDisasterCommand(DisasterKind.Fire)]),
            Built("harbour", "The town with a seaport, which brings a ship to the channel",
                  [.. Town, LineOf(ToolName.Wire, 44, 13, 44, 13), BuildingAt(ToolName.Port, 46, 14)]),
            FromCommittedSave("harbourWithDisasters", "The harbour at the hard level, with random disasters on",
                              [new SetDisastersCommand(true)]),
            Built("hazyWoods", "A residential zone in the woods with a coal plant against each side, and nothing else",
            [
                BuildingAt(ToolName.Residential, 45, 13),
                BuildingAt(ToolName.Coal, 41, 13),
                BuildingAt(ToolName.Coal, 48, 13),
            ]),
            Built("hospitalTown", "Three rows of zones, the first with no road, whose residents grow to need a hospital and then shrink",
            [
                // The plant's east side touches the second row's first zone, which powers the first row through its
                // zones
                BuildingAt(ToolName.Coal, HospitalLeft - 3, HospitalTop + 4),
                .. ZoneRow("RRRRRRRRRRR", HospitalLeft, HospitalTop),
                .. ZoneRow("RRRRRRRRRRR", HospitalLeft, HospitalTop + 3),
                LineOf(ToolName.Road, HospitalLeft, HospitalTop + 6, HospitalRight, HospitalTop + 6),
                .. ZoneRow("CCCCCIIIIII", HospitalLeft, HospitalTop + 7),
                LineOf(ToolName.Road, HospitalLeft, HospitalTop + 10, HospitalRight, HospitalTop + 10),
                LineOf(ToolName.Road, HospitalRight, HospitalTop + 7, HospitalRight, HospitalTop + 9),

                // The third row touches the plant only at a corner, which doesn't conduct
                LineOf(ToolName.Wire, HospitalLeft - 1, HospitalTop + 7, HospitalLeft - 1, HospitalTop + 7),
                new SetBudgetCommand(100, 100, 100, 7),
                new SetSpeedCommand(Speed.Fast),
            ]),
            Built("overloaded", "A coal plant feeding a block of wire larger than it can power",
                  [BuildingAt(ToolName.Coal, PlantLeft + 1, PlantTop + 1), .. WireBlock()]),
            Built("roadlessTown", "A town whose first commercial and industrial zones have no road, and a house at the end of a dead-end road",
            [
                BuildingAt(ToolName.Coal, 11, 11),
                BuildingAt(ToolName.Commercial, 15, 11),
                BuildingAt(ToolName.Industrial, 18, 11),
                .. ZoneRow(RoadlessRow, RoadlessLeft, RoadlessTop),
                LineOf(ToolName.Road, RoadlessLeft, RoadlessRoadY, RoadlessLeft + 3 * RoadlessRow.Length, RoadlessRoadY),

                // From beside the plant and under the commercial zone to the town's first zone
                LineOf(ToolName.Wire, RoadlessLeft, 13, RoadlessLeft, RoadlessTop - 1),

                BuildingAt(ToolName.Residential, SpurZoneX, SpurZoneY),
                LineOf(ToolName.Road, SpurZoneX + 1, SpurY, SpurEnd, SpurY),

                // Across the town's road to the zone at the end of the spur
                LineOf(ToolName.Wire, SpurZoneX, RoadlessRoadY, SpurZoneX, SpurZoneY - 2),
            ]),
            Built("smokyWoods", "A residential zone in the woods between two coal plants, and nothing else",
            [
                BuildingAt(ToolName.Residential, 45, 13),
                BuildingAt(ToolName.Coal, 45, 9),
                BuildingAt(ToolName.Coal, 48, 13),
            ]),
            Suburb,
            SuburbBroke,
            Built("suburbFast", "The suburb at fast speed", [.. ZonedTown, .. Stations, new SetSpeedCommand(Speed.Fast)]),
            Built("suburbSlow", "The suburb at slow speed", [.. ZonedTown, .. Stations, new SetSpeedCommand(Speed.Slow)]),
            Built("suburbUnderfunded", "The suburb with its services funded below their need and auto-budget off",
                  [.. ZonedTown, .. Stations, new SetAutoBudgetCommand(false), new SetBudgetCommand(60, 40, 75, 7)]),
            Built("town", "A small powered town of twenty zones, with a coal plant, an airport and a railway", Town),
            Built("twinPlants", "Two coal plants side by side, with nothing else built",
                  [BuildingAt(ToolName.Coal, PlantLeft + 1, PlantTop + 1), BuildingAt(ToolName.Coal, PlantLeft + 5, PlantTop + 1)]),
            Built("underfunded", "The town with a fire and a police station, its services funded below their need with auto-budget off",
                  [.. Town, .. Stations, new SetAutoBudgetCommand(false), new SetBudgetCommand(60, 40, 75, 7)]),
            Built("wilderness", "Seed 8's map with nothing built", []),
        };

        /// <summary>
        /// The mid-run logs, <c>MID_RUN_LOGS</c> in <c>conformance/generate.ts</c>: a fixture's log with commands sent
        /// partway through its run, which no fixture's log has.
        /// </summary>
        public static readonly IReadOnlyList<Fixture> MidRun =
        [
            // Among them a step that pauses the city, takes a command and resumes it
            MidRunLog("suburbMidRun", Suburb, "with commands sent partway through its run",
            [
                Logged(100, new AddFundsCommand()),
                Logged(700, BuildingAt(ToolName.Residential, 33, 21)),
                Logged(700, new ToolCommand(ToolName.Road, [new TilePosition(31, 23), new TilePosition(32, 23), new TilePosition(33, 23),
                                                            new TilePosition(34, 23), new TilePosition(35, 23)], true)),
                Logged(1200, new SetSpeedCommand(Speed.Paused)),
                Logged(1200, new SetBudgetCommand(null, null, null, 12)),
                Logged(1200, new SetSpeedCommand(Speed.Fast)),
            ], 2000),

            // Each running into the next: the broke suburb has the nuclear plant a meltdown needs, and a crash makes the
            // plane it brings down
            MidRunLog("suburbBrokeDisasters", SuburbBroke,
                      "with every disaster a player may trigger, one after another, partway through its run",
                      Enum.GetValues<DisasterKind>().Select((kind, i) => Logged(100 + 200 * i, new TriggerDisasterCommand(kind))).ToList(), 3000),
        ];

        /// <summary>
        /// Every log the fixture tool writes: every fixture's, then the mid-run logs.
        /// </summary>
        public static IReadOnlyList<Fixture> Logs => [.. All, .. MidRun];

        public static Fixture Named(string name)
        {
            return All.SingleOrDefault(fixture => fixture.Name == name)
                   ?? throw new ArgumentException($"No fixture named {name}: the fixtures are {string.Join(", ", All.Select(fixture => fixture.Name))}");
        }

        /// <summary>
        /// The committed logs' directory.
        /// </summary>
        public static string CommittedLogs => RepositoryFiles.GetPath(LogsDirectory);

        public static string LogPath(string directory, string name)
        {
            return Path.Combine(directory, $"{name}{LogExtension}");
        }

        // A fixture built by commands, all sent before the first step, with checkpoints of the city as built and after
        // its run
        private static Fixture Built(string name, string description, IReadOnlyList<Command> commands)
        {
            return new Fixture(name, description, _ => new SeedStart(Seed, Level.Easy), commands.Select(command => Logged(0, command)).ToList(),
                               [0, RunSteps]);
        }

        // A fixture that starts from a city no command builds, whose save its log keeps. The save is committed data, by
        // design: nothing rebuilds it, so the tool writes it back as it reads it
        private static Fixture FromCommittedSave(string name, string description, IReadOnlyList<Command> commands)
        {
            return Built(name, description, commands) with { Start = directory => CommittedSave(directory, name) };
        }

        private static LogStart CommittedSave(string directory, string name)
        {
            LogStart start = CommandLog.Parse(File.ReadAllText(LogPath(directory, name))).Start;
            return start as SaveStart ?? throw new InvalidDataException($"The log of {name} starts from no save.");
        }

        // The fixture's log with commands added partway through its run, described by the fixture's name and the log's
        // purpose, with a checkpoint where it starts, at each step that applies commands, after them, and at its last
        // step, so a command applied a step early or late moves the hash at its own step
        private static Fixture MidRunLog(string name, Fixture fixture, string purpose, IReadOnlyList<LoggedCommand> added, int steps)
        {
            return new Fixture(name, $"The {fixture.Name} fixture's log {purpose}", fixture.Start, [.. fixture.Entries, .. added],
                               [.. new[] { 0 }.Concat(added.Select(command => command.Step)).Append(steps).Distinct()]);
        }

        // The plant's 16 tiles and 720 of wire are more than the 700 a coal plant powers
        private static IEnumerable<Command> WireBlock()
        {
            return Enumerable.Range(0, WireBottom - PlantTop + 1)
                .Select(i => LineOf(ToolName.Wire, WireLeft, PlantTop + i, WireRight, PlantTop + i));
        }

        private static LoggedCommand Logged(int step, Command command)
        {
            return new LoggedCommand(step, PlayerIds.Local, JsonNode.Parse(ProtocolJson.Serialize(command)));
        }
    }
}
