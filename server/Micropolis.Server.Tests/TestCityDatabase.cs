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
using EasyReasy.Database;
using EasyReasy.Database.Mapping;

namespace Micropolis.Server.Tests
{
    /// <summary>
    /// City databases for the tests, each migrated as the server migrates its own: a fresh file for a test whose store
    /// outlives a server or has writers of its own, and how to read what a store keeps.
    /// </summary>
    internal static class TestCityDatabase
    {
        /// <summary>
        /// A file for a city database, which no one has used: the server, or <see cref="OpenStore"/>, makes it.
        /// </summary>
        public static string NewFile()
        {
            return Path.Combine(Path.GetTempPath(), $"micropolis-cities-{Guid.NewGuid():N}.db");
        }

        /// <summary>
        /// Migrates the file, making it if it doesn't exist, and opens a store on it.
        /// </summary>
        public static CityStore OpenStore(string file, TimeProvider? time = null)
        {
            DbDataSource dataSource = OpenDataSource(file);
            return new CityStore(dataSource, new DbSessionFactory(dataSource), time ?? TimeProvider.System);
        }

        /// <summary>
        /// Migrates the file, making it if it doesn't exist, and gives the database as the server's store opens it.
        /// </summary>
        public static DbDataSource OpenDataSource(string file)
        {
            CityDatabase.Migrate(file);
            return CityDatabase.OpenDataSource(file);
        }

        /// <summary>
        /// The row the store at the file keeps for the city, or null when it keeps none, read without opening it.
        /// </summary>
        public static async Task<StoredCity?> ReadRowAsync(string file, string city)
        {
            await using IDbSession session = await new DbSessionFactory(CityDatabase.OpenDataSource(file)).CreateSessionAsync();
            return await ReadRowAsync(session, city);
        }

        /// <summary>
        /// The row the store keeps for the city, as the session sees it, or null when it keeps none.
        /// </summary>
        public static async Task<StoredCity?> ReadRowAsync(IDbSession session, string city)
        {
            return await session.Connection.QuerySingleOrDefaultAsync<StoredCity>(
                $"""
                SELECT saved_game AS {nameof(StoredCity.SavedGame)}, last_saved_at AS {nameof(StoredCity.LastSavedAt)},
                    last_opened_at AS {nameof(StoredCity.LastOpenedAt)}
                FROM cities WHERE id = @city
                """,
                new { city },
                session.Transaction);
        }

        /// <summary>
        /// Writes a file that isn't a database, though long enough for SQLite to read its header and say so.
        /// </summary>
        public static async Task WriteNotADatabaseAsync(string file)
        {
            await File.WriteAllTextAsync(file, "not a database, though long enough for SQLite to read its header and say so");
        }

        /// <summary>
        /// Makes the database one the server can read but not write, by its Unix mode, or skips the test on Windows.
        /// </summary>
        public static void MakeReadOnly(string file)
        {
            SetMode(file, UnixFileMode.UserRead);
        }

        /// <summary>
        /// Makes the database one the server can neither read nor write, by its Unix mode, or skips the test on Windows.
        /// </summary>
        public static void MakeUnreadable(string file)
        {
            SetMode(file, UnixFileMode.None);
        }

        /// <summary>
        /// Makes a database <see cref="MakeReadOnly"/> or <see cref="MakeUnreadable"/> changed one the server can write
        /// again.
        /// </summary>
        public static void MakeWritable(string file)
        {
            SetMode(file, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }

        /// <summary>
        /// Deletes a city database a test is done with, and the journal SQLite leaves beside a file whose write was cut
        /// short.
        /// </summary>
        public static void Delete(string file)
        {
            File.Delete(file);
            File.Delete(file + "-journal");
        }

        private static void SetMode(string file, UnixFileMode mode)
        {
            if (OperatingSystem.IsWindows())
            {
                Assert.Inconclusive("The test sets the database's Unix mode.");
                return;
            }

            File.SetUnixFileMode(file, mode);
        }
    }

    /// <summary>
    /// A city's row in the store, its times as the store writes them.
    /// </summary>
    internal sealed record StoredCity(string SavedGame, string LastSavedAt, string LastOpenedAt);
}
