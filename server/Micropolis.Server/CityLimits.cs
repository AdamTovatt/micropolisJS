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

using Micropolis.Rules;

namespace Micropolis.Server
{
    /// <summary>
    /// What one client address may do in the cities, as the sign-in rate limit bounds the players it signs in: how fast
    /// its connections send commands, which a city keeps in its log for as long as it is loaded and echoes to every
    /// player in it, how many cities it starts or uploads, which the store keeps, and how often it copies a whole city
    /// out, saving it to the store or downloading it. Players behind a proxy the server doesn't trust share one
    /// address, and so these limits, as they share the sign-in limit. Counted on the server's
    /// <see cref="TimeProvider"/>, by a <see cref="FixedWindow"/> and two <see cref="TokenBucket"/>s for each address. An
    /// address is forgotten once it is back to a fresh one's state, as other addresses are checked, so the addresses
    /// kept are only those that did something lately.
    /// </summary>
    internal sealed class CityLimits
    {
        /// <summary>
        /// How many cities one client address may start or upload in <see cref="CityWindow"/>: room for players who
        /// share an address, each trying a few maps.
        /// </summary>
        public const int CitiesPerWindow = 60;

        /// <summary>
        /// The window the cities an address starts are counted in, from the first it starts once the last window ended.
        /// </summary>
        public static readonly TimeSpan CityWindow = TimeSpan.FromMinutes(10);

        /// <summary>
        /// The characters of commands a second one client address's connections may send, past a burst: a player
        /// dragging a tool sends a short command each frame, a few kilobytes a second.
        /// </summary>
        public const int CommandCharactersPerSecond = 8 * 1024;

        /// <summary>
        /// The characters of commands one client address may send at once: two of the longest the game's map allows.
        /// </summary>
        public static readonly int CommandBurstCharacters = 2 * CommandReader.MaxCommandLength(MapGenerator.MapWidth, MapGenerator.MapHeight);

        /// <summary>
        /// How many copies of a whole city one client address may make at once, saves and downloads alike: room for
        /// players who share an address, each saving a few times in a row.
        /// </summary>
        public const int CopyBurst = 10;

        /// <summary>
        /// How often one client address may copy a city, past the burst.
        /// </summary>
        public static readonly TimeSpan CopyInterval = TimeSpan.FromSeconds(6);

        /// <summary>
        /// How often the addresses back to a fresh one's state are forgotten, at the first check after it has passed.
        /// </summary>
        public static readonly TimeSpan ForgetInterval = TimeSpan.FromMinutes(1);

        private readonly TimeProvider _time;
        private readonly object _lock = new object();
        private readonly Dictionary<string, AddressLimits> _addresses = new Dictionary<string, AddressLimits>(StringComparer.Ordinal);
        // When the addresses were last looked through for ones to forget
        private long _lastForgot;

        public CityLimits(TimeProvider time)
        {
            _time = time;
            _lastForgot = time.GetTimestamp();
        }

        /// <summary>
        /// How many addresses are kept, each one that has done something it hasn't yet recovered from.
        /// </summary>
        internal int AddressesKept
        {
            get
            {
                lock (_lock)
                {
                    return _addresses.Count;
                }
            }
        }

        /// <summary>
        /// Whether the address may copy a whole city now, to save or download it, counting it if so.
        /// </summary>
        public bool TryCopyCity(string address)
        {
            return Try(address, (limits, now) => limits.Copies.TryTake(now, 1));
        }

        /// <summary>
        /// Whether the address may start or upload a city now, counting it if so.
        /// </summary>
        public bool TryStartCity(string address)
        {
            return Try(address, (limits, now) => limits.Cities.TryCount(now));
        }

        /// <summary>
        /// Whether the address may send a command message of this many characters now, counting them if so.
        /// </summary>
        public bool TrySendCommand(string address, int characters)
        {
            if (characters > CommandBurstCharacters)
            {
                return false;
            }

            return Try(address, (limits, now) => limits.Commands.TryTake(now, characters));
        }

        private bool Try(string address, Func<AddressLimits, long, bool> take)
        {
            lock (_lock)
            {
                long now = _time.GetTimestamp();
                ForgetFresh(now);

                if (!_addresses.TryGetValue(address, out AddressLimits? limits))
                {
                    limits = new AddressLimits(_time);
                    _addresses.Add(address, limits);
                }

                return take(limits, now);
            }
        }

        // An address back to a fresh one's state answers as one that was never seen would, so it is forgotten
        private void ForgetFresh(long now)
        {
            if (_time.GetElapsedTime(_lastForgot, now) < ForgetInterval)
            {
                return;
            }

            _lastForgot = now;

            foreach ((string address, AddressLimits limits) in _addresses)
            {
                if (limits.IsFresh(now))
                {
                    _addresses.Remove(address);
                }
            }
        }

        // One address's limits
        private sealed class AddressLimits
        {
            public AddressLimits(TimeProvider time)
            {
                Cities = new FixedWindow(time, CitiesPerWindow, CityWindow);
                Commands = new TokenBucket(time, CommandBurstCharacters, CommandCharactersPerSecond, TimeSpan.FromSeconds(1));
                Copies = new TokenBucket(time, CopyBurst, 1, CopyInterval);
            }

            public FixedWindow Cities { get; }

            public TokenBucket Commands { get; }

            public TokenBucket Copies { get; }

            public bool IsFresh(long now)
            {
                return Cities.IsFresh(now) && Commands.IsFresh(now) && Copies.IsFresh(now);
            }
        }
    }
}
