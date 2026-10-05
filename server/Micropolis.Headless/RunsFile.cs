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

namespace Micropolis.Headless
{
    /// <summary>
    /// <c>conformance/runs.json</c>: cities run at speeds and on maps the fixtures' logs never take, with the state
    /// hash every <see cref="Every"/> steps for as long as a fixture's golden run. How often the late phases of the
    /// cycle run depends on the speed, so a rule those phases hold behaves differently at each: every fixture's city
    /// as built runs at the two running speeds it isn't saved at, and a new city on another seed's map runs at every
    /// running speed, one seed for each kind of land the map generator lays, each at another level.
    /// </summary>
    internal static class RunsFile
    {
        public const string FileName = "runs.json";

        private const int Every = 1024;

        // The first seed of an island, a naked island and open land (maps.json), at the easy, medium and hard levels
        private static readonly IReadOnlyList<(uint Seed, Level Level)> NewCities = [(23, Level.Easy), (1, Level.Medium), (4, Level.Hard)];

        /// <summary>
        /// The file's text, each fixture's city from its built save among <paramref name="saves"/>.
        /// </summary>
        public static string Write(IReadOnlyList<FixtureSave> saves)
        {
            List<JsonNode?> runs = new List<JsonNode?>();

            foreach (Fixture fixture in Fixtures.All)
            {
                string built = FixtureSaves.TextOf(saves, fixture.Name, FixtureSaves.Built);
                Speed saved = FixtureSaves.StartCity(built, null).Speed;

                foreach (Speed speed in RunningSpeeds.All.Where(speed => speed != saved))
                {
                    Simulation city = FixtureSaves.StartCity(built, speed);
                    runs.Add(Run(new JsonObject { ["fixture"] = fixture.Name }, speed, city));
                }
            }

            foreach ((uint seed, Level level) in NewCities)
            {
                foreach (Speed speed in RunningSpeeds.All)
                {
                    runs.Add(Run(new JsonObject { ["seed"] = seed, ["level"] = (int)level }, speed, Simulation.NewCity(seed, level, speed)));
                }
            }

            return JsonLines.FileOf([
                "{",
                JsonLines.Member("steps", Fixtures.RunSteps, false),
                JsonLines.Member("every", Every, false),
                .. JsonLines.ListMember("runs", runs, true),
                "}",
            ]);
        }

        // The run from the start named, at the speed, with its hash at step 0 and every Every steps after
        private static JsonObject Run(JsonObject start, Speed speed, Simulation city)
        {
            JsonArray hashes = new JsonArray(StateHash.HashSavedState(city.Save()));

            for (int step = Every; step <= Fixtures.RunSteps; step += Every)
            {
                HeadlessRunner.Advance(city, Every);
                hashes.Add(StateHash.HashSavedState(city.Save()));
            }

            start["speed"] = RunningSpeeds.Name(speed);
            start["hashes"] = hashes;
            return start;
        }
    }
}
