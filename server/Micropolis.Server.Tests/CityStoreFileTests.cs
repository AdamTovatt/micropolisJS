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

using Micropolis.Rules;

namespace Micropolis.Server.Tests
{
    /// <summary>
    /// The store's contract where a test's database outlives a store, has writers of its own, or is changed under the
    /// store: each test has a file of its own, migrated as the server migrates its database.
    /// </summary>
    [TestClass]
    public sealed class CityStoreFileTests
    {
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
        public async Task WriteAsync_TwoCitiesAtOnce_FailsNeitherAndKeepsEachCitysOwnSave()
        {
            CityStore store = TestCityDatabase.OpenStore(_file);
            string first = CityId.New();
            string second = CityId.New();
            // Saves the size of a city's, each written many times over, so the writes contend for the database
            string firstSave = SavedGame.Write("First", StartingCity.New("First", 2026, Level.Easy).City);
            string secondSave = SavedGame.Write("Second", StartingCity.New("Second", 2027, Level.Hard).City);

            await Task.WhenAll(
                Task.Run(() => WriteRepeatedlyAsync(store, first, firstSave)),
                Task.Run(() => WriteRepeatedlyAsync(store, second, secondSave)));

            Assert.AreEqual(firstSave, await store.ReadAsync(first));
            Assert.AreEqual(secondSave, await store.ReadAsync(second));
        }

        [TestMethod]
        public async Task ReadAsync_StoreOpenedOnAnExistingDatabase_FindsTheCitiesKeptBefore()
        {
            string city = CityId.New();
            await TestCityDatabase.OpenStore(_file).WriteAsync(city, "a save");

            CityStore reopened = TestCityDatabase.OpenStore(_file);

            Assert.AreEqual("a save", await reopened.ReadAsync(city));
        }

        [TestMethod]
        public async Task ReadAndWrite_DatabaseThatCantBeOpened_FailAsTheStore()
        {
            CityStore store = TestCityDatabase.OpenStore(_file);
            // Gone from under the store, which opens only a database that exists
            TestCityDatabase.Delete(_file);

            await Assert.ThrowsExactlyAsync<CityStoreException>(() => store.ReadAsync(CityId.New()));
            await Assert.ThrowsExactlyAsync<CityStoreException>(() => store.WriteAsync(CityId.New(), "a save"));
            Assert.IsFalse(File.Exists(_file), "The store made the database it couldn't open");
        }

        // The server owns a writable database, so one it can only read fails entering a stored city as it fails saving
        // one, naming the database, rather than letting a player into a city whose open it can't record
        [TestMethod]
        public async Task ReadAndWrite_ReadOnlyDatabase_FailAsTheStoreNamingTheDatabase()
        {
            CityStore store = TestCityDatabase.OpenStore(_file);
            string city = CityId.New();
            await store.WriteAsync(city, "a save");
            TestCityDatabase.MakeReadOnly(_file);

            CityStoreException read = await Assert.ThrowsExactlyAsync<CityStoreException>(() => store.ReadAsync(city));
            CityStoreException written = await Assert.ThrowsExactlyAsync<CityStoreException>(() => store.WriteAsync(city, "another save"));

            StringAssert.Contains(read.Message, _file);
            StringAssert.Contains(written.Message, _file);
        }

        [TestMethod]
        public async Task WriteAsync_ThatFails_KeepsTheLastSave()
        {
            CityStore store = TestCityDatabase.OpenStore(_file);
            string city = CityId.New();
            await store.WriteAsync(city, "the first save");
            TestCityDatabase.MakeReadOnly(_file);

            await Assert.ThrowsExactlyAsync<CityStoreException>(() => store.WriteAsync(city, "the second save"));

            TestCityDatabase.MakeWritable(_file);
            Assert.AreEqual("the first save", await store.ReadAsync(city));
        }

        private static async Task WriteRepeatedlyAsync(CityStore store, string city, string savedGame)
        {
            for (int i = 0; i < 20; i++)
            {
                await store.WriteAsync(city, savedGame);
            }
        }
    }
}
