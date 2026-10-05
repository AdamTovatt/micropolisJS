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
    /// At most a limit of counts in a window, which starts at the first count once the last window has ended. A count
    /// refused is not counted. Hand-built, as <see cref="CursorLimit"/> is and for the same reason, so it runs on the
    /// server's <see cref="TimeProvider"/>: each time it is given is a timestamp of that clock. It is not thread-safe.
    /// </summary>
    internal sealed class FixedWindow
    {
        private readonly TimeProvider _time;
        private readonly int _limit;
        private readonly TimeSpan _window;
        private long _started;
        private int _count;

        public FixedWindow(TimeProvider time, int limit, TimeSpan window)
        {
            _time = time;
            _limit = limit;
            _window = window;
        }

        /// <summary>
        /// Whether another count fits in the window now, counting it if so.
        /// </summary>
        public bool TryCount(long now)
        {
            if (IsFresh(now))
            {
                _started = now;
                _count = 0;
            }

            if (_count == _limit)
            {
                return false;
            }

            _count++;
            return true;
        }

        /// <summary>
        /// Whether nothing is counted now, as in a new window.
        /// </summary>
        public bool IsFresh(long now)
        {
            return _count == 0 || _time.GetElapsedTime(_started, now) >= _window;
        }
    }
}
