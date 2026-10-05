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
using System.Reflection;
using DbUp;
using DbUp.Engine;
using EasyReasy.Database.Sqlite;
using Microsoft.Data.Sqlite;

namespace Micropolis.Server
{
    /// <summary>
    /// The SQLite file the <see cref="CityStore"/> keeps the cities in, and its schema, which the numbered scripts in
    /// <c>Migrations/</c>, embedded in the assembly, build. DbUp records each script it has run in the database, so a
    /// script runs once, and every change to the schema is a new script after the last, never an edit to one that ran.
    /// </summary>
    internal static class CityDatabase
    {
        /// <summary>
        /// The connection string the store opens the database with. It opens the file only if it exists, since
        /// <see cref="Migrate"/> made it, so a database removed under a running server fails as the store rather than
        /// coming back empty. Without pooling, each read and write opens the file afresh, and the server holds no
        /// handle on it between them: the store reads and writes as a city starts, loads and unloads, so a pool would
        /// save nothing worth keeping.
        /// </summary>
        public static string ConnectionString(string file)
        {
            return new SqliteConnectionStringBuilder
            {
                DataSource = file,
                Mode = SqliteOpenMode.ReadWrite,
                Pooling = false,
            }.ToString();
        }

        /// <summary>
        /// The database as the store opens it.
        /// </summary>
        public static DbDataSource OpenDataSource(string file)
        {
            return new SqliteDataSourceFactory().CreateDataSource(ConnectionString(file));
        }

        /// <summary>
        /// Makes the database, and the directory it is in, if they don't exist, and runs the scripts it hasn't run.
        /// </summary>
        /// <returns>The names of the scripts it ran.</returns>
        /// <exception cref="CityStoreException">The database couldn't be made, opened or brought up to date.</exception>
        public static IReadOnlyList<string> Migrate(string file)
        {
            try
            {
                string? directory = Path.GetDirectoryName(file);

                if (!string.IsNullOrEmpty(directory))
                {
                    Directory.CreateDirectory(directory);
                }
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                throw new CityStoreException($"The store couldn't make the directory of its database {file}.", exception);
            }

            string connectionString = new SqliteConnectionStringBuilder(ConnectionString(file)) { Mode = SqliteOpenMode.ReadWriteCreate }.ToString();
            UpgradeEngine upgrader = DeployChanges.To
                .SqliteDatabase(connectionString)
                .WithScriptsEmbeddedInAssembly(Assembly.GetExecutingAssembly(), IsScript)
                // SQLite changes a schema in a transaction, so a script that fails part way leaves none of it, nor its
                // record of having run
                .WithTransactionPerScript()
                // The server logs the scripts that ran once it has its logging
                .LogToNowhere()
                .Build();

            DatabaseUpgradeResult result = upgrader.PerformUpgrade();

            if (!result.Successful)
            {
                string failed = result.ErrorScript is null ? "" : $" at {result.ErrorScript.Name}";
                throw new CityStoreException($"The store couldn't bring its database {file} up to date{failed}.", result.Error);
            }

            return result.Scripts.Select(script => script.Name).ToList();
        }

        // Whether the embedded resource is one of the scripts in Migrations/
        private static bool IsScript(string resourceName)
        {
            return resourceName.Contains(".Migrations.") && resourceName.EndsWith(".sql", StringComparison.Ordinal);
        }
    }
}
