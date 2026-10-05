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

namespace Micropolis.Rules
{
    /// <summary>
    /// The counters city time follows from.
    /// </summary>
    public readonly record struct CityTimeCounters(Speed Speed, long SpeedCycle, long Phase, long CityTime);

    /// <summary>
    /// How far city time gets in a number of steps, from the step and phase counters alone: the speed cycle lets a
    /// phase through, and city time advances on phase 0. A run that ends anywhere else has stalled. It restates the
    /// simulation's speed gate on purpose: an independent model, so a city that stops letting phases through can't
    /// vouch for itself.
    /// </summary>
    public static class CityTimeModel
    {
        private const int PhasesPerCycle = 16;
        private const int SpeedCycleMax = Simulation.SpeedCycles - 1;

        public static CityTimeCounters CountersOf(Simulation city)
        {
            return new CityTimeCounters(city.Speed, city.SpeedCycle, city.PhaseCycle, city.CityTime);
        }

        public static long ImpliedCityTime(CityTimeCounters counters, long steps)
        {
            int perPhase = StepsPerPhase(counters.Speed);
            long speedCycle = counters.SpeedCycle;
            long phase = counters.Phase;
            long cityTime = counters.CityTime;

            for (long i = 0; i < steps; i++)
            {
                speedCycle = speedCycle == SpeedCycleMax ? 0 : speedCycle + 1;

                if (speedCycle % perPhase == 0)
                {
                    if (phase == 0)
                    {
                        cityTime++;
                    }

                    phase = (phase + 1) % PhasesPerCycle;
                }
            }

            return cityTime;
        }

        /// <summary>
        /// Takes this many steps, each a call of <paramref name="step"/>, and fails when city time didn't advance as
        /// far as they imply: the city stalled. Whoever calls it first checks that the city steps at all.
        /// </summary>
        public static void TakeSteps(Simulation city, long steps, Action step)
        {
            if (steps < 0)
            {
                throw new StepsFailedException($"Steps are taken in whole numbers from 0, got {steps}");
            }

            CityTimeCounters before = CountersOf(city);

            for (long i = 0; i < steps; i++)
            {
                step();
            }

            long expected = ImpliedCityTime(before, steps);

            if (city.CityTime != expected)
            {
                throw new StepsFailedException(
                    $"The city stalled: {steps} steps should advance city time from {before.CityTime} to {expected}, but it reached {city.CityTime}");
            }
        }

        // Steps a phase is let through on, by speed: every 5th at slow, every 3rd at medium, every one at fast
        /// <summary>
        /// The steps a unit of city time takes at the running speed, away from the wrap of the step counter: one phase
        /// of the cycle every so many steps, and a unit of city time a cycle.
        /// </summary>
        public static int StepsPerCityTime(Speed speed)
        {
            return StepsPerPhase(speed) * PhasesPerCycle;
        }

        private static int StepsPerPhase(Speed speed)
        {
            return speed switch
            {
                Speed.Slow => 5,
                Speed.Medium => 3,
                Speed.Fast => 1,
                _ => throw new StepsFailedException($"City time doesn't advance at speed {(int)speed}"),
            };
        }
    }
}
