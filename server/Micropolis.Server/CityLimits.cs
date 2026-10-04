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

using System.Threading.RateLimiting;
using Micropolis.Rules;

namespace Micropolis.Server
{
    /// <summary>
    /// What one client address may do in the cities, as the sign-in rate limit bounds the players it signs in: how fast
    /// its connections send commands, which a city keeps in its log for as long as it is loaded and echoes to every
    /// player in it, how many cities it starts or uploads, which the store keeps, and how often it saves one, which
    /// writes the whole city to the store. Players behind a proxy the server doesn't trust share one address, and so
    /// these limits, as they share the sign-in limit.
    /// </summary>
    internal sealed class CityLimits : IDisposable
    {
        /// <summary>
        /// How many cities one client address may start or upload in <see cref="CityWindow"/>: room for players who
        /// share an address, each trying a few maps.
        /// </summary>
        public const int CitiesPerWindow = 60;

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
        /// How many saves one client address may make at once, each a whole city written to the store: room for players
        /// who share an address, each saving a few times in a row.
        /// </summary>
        public const int SaveBurst = 10;

        /// <summary>
        /// How often one client address may save, past the burst.
        /// </summary>
        public static readonly TimeSpan SaveInterval = TimeSpan.FromSeconds(6);

        private readonly PartitionedRateLimiter<string> _cities = PartitionedRateLimiter.Create<string, string>(address =>
            RateLimitPartition.GetFixedWindowLimiter(address, _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = CitiesPerWindow,
                Window = CityWindow,
            }));

        private readonly PartitionedRateLimiter<string> _commands = PartitionedRateLimiter.Create<string, string>(address =>
            RateLimitPartition.GetTokenBucketLimiter(address, _ => new TokenBucketRateLimiterOptions
            {
                TokenLimit = CommandBurstCharacters,
                TokensPerPeriod = CommandCharactersPerSecond,
                ReplenishmentPeriod = TimeSpan.FromSeconds(1),
            }));

        private readonly PartitionedRateLimiter<string> _saves = PartitionedRateLimiter.Create<string, string>(address =>
            RateLimitPartition.GetTokenBucketLimiter(address, _ => new TokenBucketRateLimiterOptions
            {
                TokenLimit = SaveBurst,
                TokensPerPeriod = 1,
                ReplenishmentPeriod = SaveInterval,
            }));

        /// <summary>
        /// Whether the address may save a city now, counting it if so.
        /// </summary>
        public bool TrySave(string address)
        {
            using RateLimitLease lease = _saves.AttemptAcquire(address);
            return lease.IsAcquired;
        }

        /// <summary>
        /// Whether the address may start or upload a city now, counting it if so.
        /// </summary>
        public bool TryStartCity(string address)
        {
            using RateLimitLease lease = _cities.AttemptAcquire(address);
            return lease.IsAcquired;
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

            using RateLimitLease lease = _commands.AttemptAcquire(address, characters);
            return lease.IsAcquired;
        }

        public void Dispose()
        {
            _cities.Dispose();
            _commands.Dispose();
            _saves.Dispose();
        }
    }
}
