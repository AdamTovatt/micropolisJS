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
    /// What drives a city host's loop: the time now, in milliseconds, and a way to run a callback again soon, as
    /// <c>Ticker</c> in <c>src/cityHost.ts</c>.
    /// </summary>
    internal interface ITicker
    {
        double Now();

        void Later(Action callback);
    }

    /// <summary>
    /// A city's loop on the server's clock: each turn comes a frame after the one before asked for it, as the city's
    /// work.
    /// </summary>
    internal sealed class TimerTicker : ITicker
    {
        /// <summary>
        /// How long a turn waits after the one before: a frame at the rate the city steps.
        /// </summary>
        public static readonly TimeSpan FrameInterval = TimeSpan.FromSeconds(1.0 / StepDriver.StepsPerSecond);

        private readonly TimeProvider _time;
        private readonly long _started;
        private readonly Action<Action> _post;
        private readonly CancellationToken _stopped;

        /// <param name="post">Runs a callback as the city's work.</param>
        /// <param name="stopped">Cancelled once the city has stopped, after which no turn comes.</param>
        public TimerTicker(TimeProvider time, Action<Action> post, CancellationToken stopped)
        {
            _time = time;
            _started = time.GetTimestamp();
            _post = post;
            _stopped = stopped;
        }

        public double Now()
        {
            return _time.GetElapsedTime(_started).TotalMilliseconds;
        }

        public void Later(Action callback)
        {
            _ = WaitThenPostAsync(callback);
        }

        private async Task WaitThenPostAsync(Action callback)
        {
            try
            {
                await Task.Delay(FrameInterval, _time, _stopped);
            }
            catch (OperationCanceledException) when (_stopped.IsCancellationRequested)
            {
                return;
            }

            _post(callback);
        }
    }

    /// <summary>
    /// A city's loop run by the debug channel, on a clock that moves only when told: <see cref="Run"/> takes one turn
    /// of it, after moving the clock on, as the client's tests run the browser's hosts (test/helpers/manualTicker.ts).
    /// </summary>
    internal sealed class ManualTicker : ITicker
    {
        private double _time;
        private List<Action> _callbacks = new List<Action>();

        public double Now()
        {
            return _time;
        }

        public void Later(Action callback)
        {
            _callbacks.Add(callback);
        }

        public void Run(double milliseconds)
        {
            _time += milliseconds;
            List<Action> callbacks = _callbacks;
            _callbacks = new List<Action>();
            callbacks.ForEach(callback => callback());
        }
    }
}
