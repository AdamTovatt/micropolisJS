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
    public sealed class CityStoreTests
    {
        private string _directory = "";

        [TestInitialize]
        public void NewDirectory()
        {
            _directory = ServerUnderTest.NewStore();
        }

        [TestCleanup]
        public void DeleteDirectory()
        {
            if (File.Exists(_directory))
            {
                File.Delete(_directory);
            }

            ServerUnderTest.DeleteStore(_directory);
        }

        [TestMethod]
        public async Task ReadAsync_NoDirectoryYet_IsNull()
        {
            Assert.IsNull(await new CityStore(_directory).ReadAsync(CityId.New()));
        }

        [TestMethod]
        public async Task ReadAsync_NoSuchCity_IsNull()
        {
            CityStore store = new CityStore(_directory);
            await store.WriteAsync(CityId.New(), "a save");

            Assert.IsNull(await store.ReadAsync(CityId.New()));
        }

        [TestMethod]
        public async Task WriteAsync_Twice_KeepsTheLastAndNoPartWritten()
        {
            CityStore store = new CityStore(_directory);
            string city = CityId.New();

            await store.WriteAsync(city, "the first save");
            await store.WriteAsync(city, "the second save");

            Assert.AreEqual("the second save", await store.ReadAsync(city));
            CollectionAssert.AreEqual(new[] { city + ".json" }, Directory.GetFiles(_directory).Select(Path.GetFileName).ToArray());
        }

        [TestMethod]
        public async Task WriteAsync_DirectoryThatCantBeMade_FailsAsTheStore()
        {
            await File.WriteAllTextAsync(_directory, "");

            await Assert.ThrowsExactlyAsync<CityStoreException>(() => new CityStore(_directory).WriteAsync(CityId.New(), "a save"));
        }

        [TestMethod]
        [DataRow("../0123456789abcdef0123456789abcd", DisplayName = "a path out of the directory")]
        [DataRow("0123456789ABCDEF0123456789ABCDEF", DisplayName = "upper-case hex")]
        public async Task ReadAndWrite_NotACityId_AreRefused(string city)
        {
            CityStore store = new CityStore(_directory);

            await Assert.ThrowsExactlyAsync<ArgumentException>(() => store.ReadAsync(city));
            await Assert.ThrowsExactlyAsync<ArgumentException>(() => store.WriteAsync(city, "a save"));
        }
    }
}
