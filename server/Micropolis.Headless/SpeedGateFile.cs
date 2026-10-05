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
using static Micropolis.Headless.ConformanceText;

namespace Micropolis.Headless
{
    /// <summary>
    /// <c>conformance/speedGate.json</c>: at each running speed, the steps of a fixture's city, counted from 0, at
    /// which the speed gate lets a phase of the city cycle through. The run passes the step counter's wrap
    /// (<see cref="Simulation.SpeedCycles"/>), which shifts the slow and medium gates.
    /// </summary>
    internal static class SpeedGateFile
    {
        public const string FileName = "speedGate.json";

        private const string GateFixture = "suburb";
        private const int GateSteps = 2100;

        /// <summary>
        /// The file's text, from the fixture's built save among <paramref name="saves"/>.
        /// </summary>
        public static string Write(IReadOnlyList<FixtureSave> saves)
        {
            string built = FixtureSaves.TextOf(saves, GateFixture, FixtureSaves.Built);
            List<JsonNode?> speeds = new List<JsonNode?>();

            foreach (Speed speed in RunningSpeeds.All)
            {
                Simulation city = HeadlessRunner.StartFromSave(JsonNode.Parse(built)!.AsObject(), null, speed);
                int speedCycle = city.SpeedCycle;
                JsonArray phaseSteps = new JsonArray();

                // Each phase run moves the phase cycle on, and nothing else in a step moves it
                for (int step = 0; step < GateSteps; step++)
                {
                    int phase = city.PhaseCycle;
                    city.Step();

                    if (city.PhaseCycle != phase)
                    {
                        phaseSteps.Add(step);
                    }
                }

                EnsureCovers(speedCycle + GateSteps > Simulation.SpeedCycles, "the step counter's wrap");

                speeds.Add(new JsonObject
                {
                    ["speed"] = RunningSpeeds.Name(speed),
                    ["speedCycle"] = speedCycle,
                    ["phaseSteps"] = phaseSteps,
                });
            }

            return JsonLines.FileOf([
                "{",
                JsonLines.Member("fixture", GateFixture, false),
                JsonLines.Member("steps", GateSteps, false),
                .. JsonLines.ListMember("speeds", speeds, true),
                "}",
            ]);
        }
    }
}
