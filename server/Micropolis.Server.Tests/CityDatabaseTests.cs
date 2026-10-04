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

namespace Micropolis.Server.Tests
{
    [TestClass]
    public sealed class CityDatabaseTests
    {
        private const string FirstScript = "Micropolis.Server.Migrations.001_CreateCities.sql";

        private string _file = "";

        [TestInitialize]
        public void NewFile()
        {
            _file = TestCityDatabase.NewFile();
        }

        [TestCleanup]
        public void DeleteFile()
        {
            TestCityDatabase.Delete(_file);
        }

        [TestMethod]
        public void Migrate_NewDatabase_RunsEveryScriptInOrder()
        {
            List<string> scripts = typeof(CityDatabase).Assembly.GetManifestResourceNames()
                .Where(name => name.EndsWith(".sql", StringComparison.Ordinal))
                .Order(StringComparer.Ordinal)
                .ToList();

            IReadOnlyList<string> ran = CityDatabase.Migrate(_file);

            Assert.AreEqual(FirstScript, scripts[0]);
            CollectionAssert.AreEqual(scripts, ran.ToList());
        }

        [TestMethod]
        public void Migrate_DatabaseUpToDate_RunsNothing()
        {
            CityDatabase.Migrate(_file);

            Assert.AreEqual(0, CityDatabase.Migrate(_file).Count);
        }

        [TestMethod]
        public void Migrate_DirectoryThatDoesntExist_MakesIt()
        {
            string directory = Path.Combine(Path.GetTempPath(), $"micropolis-cities-{Guid.NewGuid():N}");

            try
            {
                CityDatabase.Migrate(Path.Combine(directory, "cities.db"));

                Assert.IsTrue(File.Exists(Path.Combine(directory, "cities.db")));
            }
            finally
            {
                // Only if made, so a failure to make it isn't hidden by a failure to delete it
                if (Directory.Exists(directory))
                {
                    Directory.Delete(directory, recursive: true);
                }
            }
        }

        [TestMethod]
        public async Task Migrate_FileThatIsntADatabase_FailsAsTheStore()
        {
            await TestCityDatabase.WriteNotADatabaseAsync(_file);

            Assert.ThrowsExactly<CityStoreException>(() => CityDatabase.Migrate(_file));
        }

        [TestMethod]
        public async Task Migrate_DirectoryThatCantBeMade_FailsAsTheStore()
        {
            // A file where the database's directory would be
            await File.WriteAllTextAsync(_file, "");

            Assert.ThrowsExactly<CityStoreException>(() => CityDatabase.Migrate(Path.Combine(_file, "cities.db")));
        }
    }
}
