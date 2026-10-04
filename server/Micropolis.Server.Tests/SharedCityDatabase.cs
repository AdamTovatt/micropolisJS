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

using System.Data.Common;
using EasyReasy.Database;
using EasyReasy.Database.Mapping;
using EasyReasy.Database.Sqlite;
using EasyReasy.Database.Testing;

namespace Micropolis.Server.Tests
{
    /// <summary>
    /// The city database the store's tests share, one file for the test run, reset and migrated once, in which each
    /// test works in a transaction it never commits.
    /// </summary>
    [TestClass]
    public static class SharedCityDatabase
    {
        private static readonly string DatabaseFile = TestCityDatabase.NewFile();
        // Set up by the first test that needs it. A setup that fails stays failed, so each test on the shared database
        // reports that one cause and no other test is touched, where an [AssemblyInitialize] would fail every test in
        // the assembly.
        private static readonly Lazy<Task<TestDatabaseManager>> Manager = new Lazy<Task<TestDatabaseManager>>(SetUpAsync);

        /// <summary>
        /// A store on the shared database, which a test reads and writes in the transaction of its session.
        /// </summary>
        internal static async Task<(CityStore Store, IDbTransactionSession Session)> OpenAsync(TimeProvider time)
        {
            TestDatabaseManager manager = await Manager.Value;
            CityStore store = new CityStore(manager.DataSource, new DbSessionFactory(manager.DataSource), time);
            return (store, await manager.CreateTransactionSessionAsync());
        }

        [AssemblyCleanup]
        public static void DeleteFile()
        {
            TestCityDatabase.Delete(DatabaseFile);
        }

        private static async Task<TestDatabaseManager> SetUpAsync()
        {
            // SQLite takes an empty file as an empty database, and the store's connections open only a file that exists
            File.Create(DatabaseFile).Dispose();
            TestDatabaseManager manager = new TestDatabaseManager(new SqliteDataSourceFactory(), () => CityDatabase.ConnectionString(DatabaseFile));
            await manager.EnsureCleanDatabaseSetupAsync(new Setup(DatabaseFile));
            return manager;
        }

        // Resets the database by dropping every table, and sets it up as the server does
        private sealed class Setup : ITestDatabaseSetup
        {
            private readonly string _file;

            public Setup(string file)
            {
                _file = file;
            }

            public async Task ResetDatabaseAsync(DbConnection connection)
            {
                IEnumerable<string> tables = await connection.QueryAsync<string>(
                    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");

                foreach (string table in tables.ToList())
                {
                    await connection.ExecuteAsync($"DROP TABLE \"{table.Replace("\"", "\"\"")}\"");
                }
            }

            public void SetupDatabase()
            {
                CityDatabase.Migrate(_file);
            }
        }
    }
}
