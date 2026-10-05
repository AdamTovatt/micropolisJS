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

namespace Micropolis.Server
{
    /// <summary>
    /// Turns real time into simulation steps at a fixed rate, <see cref="StepsPerSecond"/>. Time is owed until it adds
    /// up to a whole step, so a slow turn is followed by several steps rather than losing time. Real time only paces
    /// the city: what the city becomes depends on the number of steps alone.
    /// </summary>
    internal sealed class StepDriver
    {
        public const int StepsPerSecond = 60;

        /// <summary>
        /// The most steps one call takes. A long gap, such as a machine that slept, would owe thousands of steps at
        /// once; past this many the rest of the owed time is dropped, which slows the city in real time and changes
        /// nothing else.
        /// </summary>
        public const int MaxStepsPerCall = StepsPerSecond;

        // Owed time is counted in thousandths of a step, so milliseconds convert by multiplying by 60 rather than
        // dividing by the 16⅔ milliseconds of a step, which would round on every turn
        private const int UnitsPerStep = 1000;

        private double? _lastTime;
        private double _owedUnits;

        public bool IsHeld { get; private set; }

        /// <summary>
        /// The number of steps due by now, a time in milliseconds.
        /// </summary>
        public int StepsDue(double now)
        {
            if (_lastTime is not double lastTime)
            {
                _lastTime = now;
                return 0;
            }

            _owedUnits += (now - lastTime) * StepsPerSecond;
            _lastTime = now;

            int steps = (int)Math.Floor(_owedUnits / UnitsPerStep);

            if (steps > MaxStepsPerCall)
            {
                _owedUnits = 0;
                return MaxStepsPerCall;
            }

            _owedUnits -= steps * UnitsPerStep;
            return steps;
        }

        /// <summary>
        /// While the city is not stepping, no time is owed: it resumes without catching up.
        /// </summary>
        public void Idle()
        {
            _lastTime = null;
            _owedUnits = 0;
        }

        /// <summary>
        /// A held driver takes no steps, so that the debug channel decides when the city steps. Holding is not
        /// pausing: the city's speed is untouched, and nothing is owed for the time it is held.
        /// </summary>
        public void Hold()
        {
            IsHeld = true;
            Idle();
        }

        public void Release()
        {
            IsHeld = false;
        }

        /// <summary>
        /// Takes the steps due by now while the city is stepping and the driver is not held.
        /// </summary>
        public void Run(double now, Func<bool> isStepping, Action step)
        {
            if (IsHeld || !isStepping())
            {
                Idle();
                return;
            }

            int steps = StepsDue(now);

            for (int i = 0; i < steps && isStepping(); i++)
            {
                step();
            }
        }
    }
}
