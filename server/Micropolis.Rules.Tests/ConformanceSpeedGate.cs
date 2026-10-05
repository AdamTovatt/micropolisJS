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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// <c>conformance/speedGate.json</c>: at each running speed, the steps of a fixture's run, counted from 0, at which
    /// a phase runs.
    /// </summary>
    public sealed record ConformanceSpeedGate(string Fixture, int Steps, IReadOnlyList<GatedSpeed> Speeds)
    {
        public static ConformanceSpeedGate Load()
        {
            return Parse(ConformanceFile.Read("speedGate.json"));
        }

        public static ConformanceSpeedGate Parse(string json)
        {
            ConformanceSpeedGate gate = ConformanceFile.Parse<ConformanceSpeedGate>(json);
            ConformanceFile.NonEmpty("speeds", gate.Speeds);

            foreach (GatedSpeed speed in gate.Speeds)
            {
                ConformanceFile.NonEmpty($"{speed.Speed}'s phaseSteps", speed.PhaseSteps);
            }

            return gate;
        }
    }

    /// <summary>
    /// One speed's run: the step counter it starts from, and the steps that ran a phase.
    /// </summary>
    public sealed record GatedSpeed(string Speed, int SpeedCycle, IReadOnlyList<int> PhaseSteps);
}
