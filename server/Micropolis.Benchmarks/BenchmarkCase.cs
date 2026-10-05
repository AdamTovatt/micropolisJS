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
}
