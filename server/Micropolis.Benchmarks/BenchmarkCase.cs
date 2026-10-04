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
using Micropolis.Repository;
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
        /// The name of the speed, as the report and the case list write it.
        /// </summary>
        public string SpeedName => Names.Of(Speed);

        /// <summary>
        /// A fresh city, as the case starts it.
        /// </summary>
        public abstract Simulation Start();

        /// <summary>
        /// The case as the case list writes it, from which the TypeScript measurement starts the same city.
        /// </summary>
        public abstract JsonObject ToJson();
    }

    /// <summary>
    /// A fixture's city from its save after its golden run, <c>conformance/saves/&lt;fixture&gt;.run.json</c>, at the
    /// speed it is saved at, with random disasters on or off as given, whatever the save holds.
    /// </summary>
    internal sealed record FixtureCase(string Fixture, Speed Speed, bool DisastersEnabled) : BenchmarkCase(Fixture, Speed)
    {
        public string SavePath => $"conformance/saves/{Fixture}.run.json";

        public override Simulation Start()
        {
            JsonObject save = JsonNode.Parse(File.ReadAllText(RepositoryFiles.GetPath(SavePath)))!.AsObject();
            save["disasters"]!["disastersEnabled"] = DisastersEnabled;
            Simulation city = Simulation.FromSave(CanonicalJson.Write(save));

            if (city.Speed != Speed)
            {
                throw new InvalidDataException($"{SavePath} is saved at {city.Speed}, but its case runs it at {Speed}.");
            }

            return city;
        }

        public override JsonObject ToJson()
        {
            return new JsonObject
            {
                ["name"] = Name,
                ["speed"] = SpeedName,
                ["save"] = SavePath,
                ["disastersEnabled"] = DisastersEnabled,
            };
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

        public override JsonObject ToJson()
        {
            return new JsonObject
            {
                ["name"] = Name,
                ["speed"] = SpeedName,
                ["seed"] = Seed,
                ["level"] = Names.Of(Level),
            };
        }
    }

    /// <summary>
    /// The running speeds and the levels by name, as the headless runner names them (<c>headless/city.ts</c>).
    /// </summary>
    internal static class Names
    {
        public static string Of(Speed speed)
        {
            return speed switch
            {
                Speed.Slow => "slow",
                Speed.Medium => "medium",
                Speed.Fast => "fast",
                _ => throw new ArgumentOutOfRangeException(nameof(speed), speed, "A benchmark runs a city at a running speed."),
            };
        }

        public static string Of(Level level)
        {
            return level switch
            {
                Level.Easy => "easy",
                Level.Medium => "medium",
                Level.Hard => "hard",
                _ => throw new ArgumentOutOfRangeException(nameof(level), level, "No such level."),
            };
        }
    }
}
