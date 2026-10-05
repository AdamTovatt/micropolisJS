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

using System.Text.Json.Nodes;
using Micropolis.Conformance;
using Micropolis.Rules;

namespace Micropolis.Benchmarks
{
    /// <summary>
    /// One city the benchmark runs, named for its row of the report, at one speed: a fixture's saved city, or a new
    /// city on a seed's map.
    /// </summary>
    internal abstract record BenchmarkCase(string Name, Speed Speed)
    {
        /// <summary>
        /// The name of the speed, as the report writes it and the headless runner's <c>--speed</c> option names it.
        /// </summary>
        public string SpeedName => RunningSpeeds.Name(Speed);

        /// <summary>
        /// A fresh city, as the case starts it.
        /// </summary>
        public abstract Simulation Start();

        /// <summary>
        /// What the report says of the case beyond what it says of every case, or null for nothing.
        /// </summary>
        public virtual string? Description => null;

        /// <summary>
        /// The settings the case runs under, given the run's: theirs, unless the case warms up or times fewer steps.
        /// </summary>
        public virtual BenchmarkSettings SettingsFor(BenchmarkSettings settings)
        {
            return settings;
        }
    }

    /// <summary>
    /// A fixture's city from its save after its golden run, <c>conformance/saves/&lt;fixture&gt;.run.json</c>, at the
    /// speed it is saved at, with random disasters on or off as given, whatever the save holds.
    /// </summary>
    internal sealed record FixtureCase(string Fixture, Speed Speed, bool DisastersEnabled) : BenchmarkCase(Fixture, Speed)
    {
        public FixtureSavePoint Save => FixtureSaves.At(Fixture, FixtureSaves.Run);

        public override Simulation Start()
        {
            JsonObject save = JsonNode.Parse(Save.ReadCommitted())!.AsObject();
            save["disasters"]!["disastersEnabled"] = DisastersEnabled;
            Simulation city = Simulation.FromSave(CanonicalJson.Write(save));

            if (city.Speed != Speed)
            {
                throw new InvalidDataException($"The save {Save.Name} is saved at {city.Speed}, but its case runs it at {Speed}.");
            }

            return city;
        }
    }

    /// <summary>
    /// A new city on the map the seed generates, at the level and speed given, as the browser starts one.
    /// </summary>
    internal sealed record NewCityCase(uint Seed, Level Level, Speed Speed) : BenchmarkCase($"new city (seed {Seed})", Speed)
    {
        public override Simulation Start()
        {
            return Simulation.NewCity(Seed, Level, Speed);
        }
    }

    /// <summary>
    /// A new city on a blank map built up from edge to edge: a road on every fourth row and column, and in each lot
    /// between the roads a built zone, residential, commercial and industrial in turn, row by row, but for the lots of
    /// twelve nuclear plants. Each road between two junctions carries a power line, but the junctions are plain road, so
    /// power crosses the grid through the zones beside the lines; the power scan counts a zone it reaches again each
    /// time, so it takes twelve plants to power them all. Its zones empty within a few years, as no demand fills so
    /// many, so it runs at most <see cref="MostWarmup"/> steps to warm up and <see cref="MostSteps"/> timed, while they
    /// stand full.
    /// </summary>
    internal sealed record ZonedMapCase(Speed Speed) : BenchmarkCase("fully zoned map", Speed)
    {
        /// <summary>
        /// The most steps the case warms up and times: whole cycles of 16 phases at every speed, as
        /// <see cref="BenchmarkSettings.Default"/>'s are.
        /// </summary>
        public const int MostWarmup = 480;
        public const int MostSteps = 1680;

        /// <summary>
        /// The lots, by their column and row of lots, that hold a nuclear plant, spread over the map.
        /// </summary>
        internal static readonly IReadOnlySet<(int Column, int Row)> PlantLots = new HashSet<(int Column, int Row)>
            { (1, 1), (13, 2), (25, 1), (7, 6), (19, 6), (7, 12), (19, 12), (7, 18), (19, 18), (1, 22), (13, 22), (25, 22) };

        public override string Description =>
            "The fully zoned map is a new city at the easy level on a blank map built up from edge to edge: a road on " +
            "every fourth row and column, a power line along each road between two junctions, a built zone in every lot " +
            "between the roads, residential, commercial and industrial in turn, and twelve nuclear plants, which power " +
            $"them all. Its zones empty within a few years, so it warms up {MostWarmup} steps at most and times " +
            $"{MostSteps} at most, while they stand full.";

        public override Simulation Start()
        {
            return Simulation.NewCity(Map(), 0, Level.Easy, Speed);
        }

        public override BenchmarkSettings SettingsFor(BenchmarkSettings settings)
        {
            return settings with { Warmup = Math.Min(settings.Warmup, MostWarmup), Steps = Math.Min(settings.Steps, MostSteps) };
        }

        /// <summary>
        /// The map the city starts on.
        /// </summary>
        public static GameMap Map()
        {
            GameMap map = new GameMap(120, 100);

            for (int y = 0; y < map.Height; y++)
            {
                for (int x = 0; x < map.Width; x++)
                {
                    bool onRow = y % 4 == 0;
                    bool onColumn = x % 4 == 0;

                    if (onRow && onColumn)
                    {
                        map.SetTile(x, y, TileValues.ROADS, TileFlags.BULLBIT);
                    }
                    else if (onRow)
                    {
                        map.SetTile(x, y, TileValues.HROADPOWER, TileFlags.BLBNCNBIT);
                    }
                    else if (onColumn)
                    {
                        map.SetTile(x, y, TileValues.VROADPOWER, TileFlags.BLBNCNBIT);
                    }
                }
            }

            int zones = 0;

            for (int row = 0; 4 * row + 3 < map.Height; row++)
            {
                for (int column = 0; 4 * column + 3 < map.Width; column++)
                {
                    int centreX = 4 * column + 2;
                    int centreY = 4 * row + 2;

                    // A plant's four tiles a side take its lot and the roads east and south of it
                    if (PlantLots.Contains((column, row)))
                    {
                        map.PutZone(centreX, centreY, TileValues.NUCLEAR, 4);
                        continue;
                    }

                    int centre = (zones++ % 3) switch
                    {
                        0 => TileValues.RZB + 9,
                        1 => TileValues.CZB + 9,
                        _ => TileValues.IZB + 9,
                    };
                    ZoneUtils.PutZone(map, centreX, centreY, centre, false);
                }
            }

            return map;
        }
    }
}
