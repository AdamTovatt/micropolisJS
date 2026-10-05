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
    /// A bucket of tokens, full at first, refilled at a number of tokens a period, a part of a period refilling that
    /// part of them, up to full. A take of more than it holds is refused and takes nothing. Hand-built, as
    /// <see cref="CursorLimit"/> is and for the same reason, so it runs on the server's <see cref="TimeProvider"/>: each
    /// time it is given is a timestamp of that clock. It is not thread-safe.
    /// </summary>
    internal sealed class TokenBucket
    {
        private readonly TimeProvider _time;
        // The level is counted in tokens times the period's ticks, so a tick's refill is the whole number of tokens a
        // period refills
        private readonly long _periodTicks;
        private readonly long _capacity;
        private readonly long _refillPerTick;
        private long _level;
        // When the level was last brought up to date
        private long _counted;

        public TokenBucket(TimeProvider time, long capacity, long tokensPerPeriod, TimeSpan period)
        {
            _time = time;
            _periodTicks = period.Ticks;
            _capacity = capacity * _periodTicks;
            _refillPerTick = tokensPerPeriod;
            _level = _capacity;
            _counted = time.GetTimestamp();
        }

        /// <summary>
        /// Whether the bucket holds the tokens now, taking them if so.
        /// </summary>
        public bool TryTake(long now, long tokens)
        {
            Refill(now);
            long taken = tokens * _periodTicks;

            if (taken > _level)
            {
                return false;
            }

            _level -= taken;
            return true;
        }

        /// <summary>
        /// Whether the bucket is full now, as a new one is.
        /// </summary>
        public bool IsFresh(long now)
        {
            Refill(now);
            return _level == _capacity;
        }

        private void Refill(long now)
        {
            long elapsed = _time.GetElapsedTime(_counted, now).Ticks;
            _counted = now;
            long missing = _capacity - _level;

            // Compared before multiplying, so a long idle while can't overflow the refill
            _level = elapsed >= (missing + _refillPerTick - 1) / _refillPerTick ? _capacity : _level + elapsed * _refillPerTick;
        }
    }
}
