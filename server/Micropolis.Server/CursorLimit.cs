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

namespace Micropolis.Server
{
    /// <summary>
    /// How many hover boxes one connection may pass on: at most <see cref="PerSecond"/> in any second, counted per
    /// connection, where <see cref="CityLimits"/> counts per client address. Hand-built rather than one of
    /// System.Threading.RateLimiting's limiters, which can't run on the server's <see cref="TimeProvider"/>, the clock
    /// the tests move.
    /// </summary>
    internal sealed class CursorLimit
    {
        /// <summary>
        /// Well above what the browser sends, one a <c>REPORT_INTERVAL_MS</c> in <c>src/playerCursors.ts</c>, so a
        /// player's own boxes are never dropped.
        /// </summary>
        public const int PerSecond = 20;

        private static readonly TimeSpan Window = TimeSpan.FromSeconds(1);

        private readonly TimeProvider _time;
        // When each of the last boxes passed on was counted, oldest at _oldest, as a ring of PerSecond
        private readonly long[] _counted = new long[PerSecond];
        private int _oldest;
        private int _count;

        public CursorLimit(TimeProvider time)
        {
            _time = time;
        }

        /// <summary>
        /// Whether the connection may pass on another box now, counting it if so.
        /// </summary>
        public bool TryCount()
        {
            long now = _time.GetTimestamp();

            while (_count > 0 && _time.GetElapsedTime(_counted[_oldest], now) >= Window)
            {
                _oldest = (_oldest + 1) % PerSecond;
                _count--;
            }

            if (_count == PerSecond)
            {
                return false;
            }

            _counted[(_oldest + _count) % PerSecond] = now;
            _count++;
            return true;
        }
    }
}
