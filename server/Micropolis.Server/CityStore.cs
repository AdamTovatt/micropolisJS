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

using System.Data.Common;
using System.Globalization;
using EasyReasy.Database;
using EasyReasy.Database.Mapping;
using Microsoft.Data.Sqlite;

namespace Micropolis.Server
{
    /// <summary>
    /// The server's cities at rest: a row of the <see cref="CityDatabase"/>'s cities table for each city, holding its
    /// saved game, as the game saves one, by the city's id. Each row records when the city was last saved and last
    /// opened, which is when it started or a player's entering it loaded it from the store; entering a city already
    /// loaded doesn't reach the store, but its last player's leaving saves it, so the later of the two times is a city's
    /// last activity. Nothing removes a city from the store; <see cref="CityLimits"/> bounds how fast a client address
    /// adds them. Reading and writing are virtual so a test can hold the store up between them.
    /// </summary>
    internal class CityStore : RepositoryBase
    {
        private readonly TimeProvider _time;

        /// <param name="dataSource">The database, which <see cref="CityDatabase.Migrate"/> has brought up to date.</param>
        public CityStore(DbDataSource dataSource, IDbSessionFactory sessionFactory, TimeProvider time)
            : base(dataSource, sessionFactory)
        {
            _time = time;
        }

        /// <summary>
        /// The database file the cities are kept in.
        /// </summary>
        public string Location => new SqliteConnectionStringBuilder(DataSource.ConnectionString).DataSource;

        /// <summary>
        /// The city's saved game, for a player entering it, or null when the store holds no city with that id. A city it
        /// reads is opened now, whether or not its save then loads.
        /// </summary>
        /// <param name="session">The session to read in, or none for one of its own.</param>
        /// <exception cref="CityStoreException">The store couldn't be read, or couldn't record the city opened.</exception>
        public virtual async Task<string?> ReadAsync(string city, IDbSession? session = null)
        {
            RequireCityId(city);
            string now = Now();

            // One statement reads the save and records the open, so a database the server can't write fails a read as
            // it fails a save: the server owns a writable database, and one it can't write is a misconfiguration to
            // fail on, not to read around
            try
            {
                return await UseSessionAsync(async dbSession => await dbSession.Connection.ExecuteScalarAsync<string>(
                    "UPDATE cities SET last_opened_at = @now WHERE id = @city RETURNING saved_game",
                    new { city, now },
                    dbSession.Transaction), session);
            }
            catch (DbException exception)
            {
                throw new CityStoreException($"The store couldn't read the city {city} from {Location}.", exception);
            }
        }

        /// <summary>
        /// Keeps the city's saved game, in place of any before it, saved now. A city it hasn't kept before is opened now
        /// too, since a city is first kept as it starts. The database replaces the row whole or not at all, so a write
        /// that fails leaves the last save.
        /// </summary>
        /// <param name="session">The session to write in, or none for one of its own.</param>
        /// <exception cref="CityStoreException">The store couldn't be written.</exception>
        public virtual async Task WriteAsync(string city, string savedGame, IDbSession? session = null)
        {
            RequireCityId(city);
            string now = Now();

            try
            {
                await UseSessionAsync(async dbSession => await dbSession.Connection.ExecuteAsync(
                    """
                    INSERT INTO cities (id, saved_game, last_saved_at, last_opened_at) VALUES (@city, @savedGame, @now, @now)
                    ON CONFLICT (id) DO UPDATE SET saved_game = excluded.saved_game, last_saved_at = excluded.last_saved_at
                    """,
                    new { city, savedGame, now },
                    dbSession.Transaction), session);
            }
            catch (DbException exception)
            {
                throw new CityStoreException($"The store couldn't keep the city {city} in {Location}.", exception);
            }
        }

        // Every id the server hands out or accepts is one, so anything else reaching the store is a fault above it, refused
        // rather than kept as a row no player could join
        private static void RequireCityId(string city)
        {
            if (!CityId.IsOne(city))
            {
                throw new ArgumentException($"\"{city}\" is not a city's id.", nameof(city));
            }
        }

        // UTC in ISO 8601 to the millisecond, which sorts as it reads and SQLite's date functions take
        private string Now()
        {
            return _time.GetUtcNow().UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
        }
    }
}
