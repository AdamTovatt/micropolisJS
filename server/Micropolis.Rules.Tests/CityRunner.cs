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
    /// Runs a city run in C#: starts the city as the TypeScript did, steps it, and at each checkpoint compares the events
    /// emitted up to it, in order, then the state hash there.
    /// </summary>
    internal static class CityRunner
    {
        /// <summary>
        /// Where the C# run first differs from the TypeScript's, or <see langword="null"/> when every event and every
        /// checkpoint's state hash match.
        /// </summary>
        public static string? FirstDifference(ConformanceRun run)
        {
            return FirstDifference(run, StartCity(run), ConformanceRuns.ReadEvents(run));
        }

        /// <summary>
        /// The city as the run starts: a new city on the seed's map, or the fixture's city as built at the run's
        /// speed, its saved speed overridden as the headless runner does, with any change to the fixture's save made
        /// after that, before it loads.
        /// </summary>
        public static Simulation StartCity(ConformanceRun run, Action<JsonObject>? change = null)
        {
            if (run.Seed is uint seed)
            {
                return Simulation.NewCity(seed, run.GameLevel, run.RunningSpeed);
            }

            Simulation city = FixtureCities.City(run.Fixture!, "built", save =>
            {
                save["simulation"]!["speed"] = (int)run.RunningSpeed;
                change?.Invoke(save);
            });

            if (city.GameLevel != run.GameLevel)
            {
                throw new InvalidDataException($"{run} is listed at the level {run.Level}, but its city is saved at {city.GameLevel}.");
            }

            return city;
        }

        /// <summary>
        /// Where the run of <paramref name="city"/> first differs from <paramref name="run"/>'s checkpoints and from
        /// <paramref name="expectedEvents"/>.
        /// </summary>
        public static string? FirstDifference(ConformanceRun run, Simulation city, JsonArray expectedEvents)
        {
            JsonArray events = new JsonArray();
            int step = 0;
            int due = 0;
            int compared = 0;
            city.Events.Observer = (name, payload) =>
            {
                JsonObject recorded = RecordedEvents.Of(name, payload);
                recorded["step"] = step;
                events.Add(recorded);
            };

            try
            {
                foreach (RunCheckpoint checkpoint in run.Checkpoints)
                {
                    for (; step < checkpoint.Step; step++)
                    {
                        city.Step();
                    }

                    // The events the TypeScript emitted before the checkpoint, which are in step order
                    while (due < expectedEvents.Count && (int)expectedEvents[due]!["step"]! < checkpoint.Step)
                    {
                        due++;
                    }

                    for (; compared < Math.Max(due, events.Count); compared++)
                    {
                        string? expectedText = compared < due ? CanonicalJson.Write(expectedEvents[compared]) : null;
                        string? actualText = compared < events.Count ? CanonicalJson.Write(events[compared]) : null;

                        if (expectedText != actualText)
                        {
                            return $"Event {compared} differs: expected {expectedText ?? "no event"}, was {actualText ?? "no event"}.";
                        }
                    }

                    string hash = StateHash.HashSavedState(city.Save());

                    if (hash != checkpoint.Hash)
                    {
                        return $"The state hash after step {checkpoint.Step} differs: expected {checkpoint.Hash}, was {hash}.";
                    }
                }
            }
            finally
            {
                city.Events.Observer = null;
            }

            return null;
        }
    }
}
