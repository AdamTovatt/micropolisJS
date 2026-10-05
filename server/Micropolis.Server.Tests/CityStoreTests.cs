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

using EasyReasy.Database;
using Microsoft.Extensions.Time.Testing;

namespace Micropolis.Server.Tests
{
    /// <summary>
    /// The store's contract on the shared database: save, load, a missing city, a save replacing an older one, and the
    /// times it records. Each test works in a transaction it never commits; <see cref="CityStoreFileTests"/> holds those
    /// that need a database of their own.
    /// </summary>
    [TestClass]
    public sealed class CityStoreTests
    {
        private static readonly DateTimeOffset Started = new DateTimeOffset(2026, 10, 4, 5, 38, 23, 123, TimeSpan.Zero);

        private readonly FakeTimeProvider _time = new FakeTimeProvider(Started);
        private CityStore _store = null!;
        private IDbTransactionSession _session = null!;

        [TestInitialize]
        public async Task OpenStore()
        {
            (_store, _session) = await SharedCityDatabase.OpenAsync(_time);
        }

        [TestCleanup]
        public async Task CloseStore()
        {
            // Never committed, so nothing a test wrote stays
            await _session.DisposeAsync();
        }

        [TestMethod]
        public async Task ReadAsync_NoSuchCity_IsNull()
        {
            await _store.WriteAsync(CityId.New(), "a save", _session);

            Assert.IsNull(await _store.ReadAsync(CityId.New(), _session));
        }

        [TestMethod]
        public async Task ReadAsync_CityKept_GivesItsSave()
        {
            string city = CityId.New();
            await _store.WriteAsync(city, "a save", _session);

            Assert.AreEqual("a save", await _store.ReadAsync(city, _session));
        }

        [TestMethod]
        public async Task WriteAsync_Twice_KeepsTheLast()
        {
            string city = CityId.New();

            await _store.WriteAsync(city, "the first save", _session);
            await _store.WriteAsync(city, "the second save", _session);

            Assert.AreEqual("the second save", await _store.ReadAsync(city, _session));
        }

        [TestMethod]
        public async Task WriteAsync_NewCity_RecordsItSavedAndOpenedNow()
        {
            string city = CityId.New();

            await _store.WriteAsync(city, "a save", _session);

            Assert.AreEqual(new StoredCity("a save", "2026-10-04T05:38:23.123Z", "2026-10-04T05:38:23.123Z"), await TestCityDatabase.ReadRowAsync(_session, city));
        }

        [TestMethod]
        public async Task WriteAsync_CityKept_RecordsItSavedNowAndKeepsWhenItWasOpened()
        {
            string city = CityId.New();
            await _store.WriteAsync(city, "the first save", _session);
            _time.Advance(TimeSpan.FromHours(1));

            await _store.WriteAsync(city, "the second save", _session);

            Assert.AreEqual(new StoredCity("the second save", "2026-10-04T06:38:23.123Z", "2026-10-04T05:38:23.123Z"), await TestCityDatabase.ReadRowAsync(_session, city));
        }

        [TestMethod]
        public async Task ReadAsync_CityKept_RecordsItOpenedNowAndKeepsWhenItWasSaved()
        {
            string city = CityId.New();
            await _store.WriteAsync(city, "a save", _session);
            _time.Advance(TimeSpan.FromDays(2));

            await _store.ReadAsync(city, _session);

            Assert.AreEqual(new StoredCity("a save", "2026-10-04T05:38:23.123Z", "2026-10-06T05:38:23.123Z"), await TestCityDatabase.ReadRowAsync(_session, city));
        }

        [TestMethod]
        [DataRow("../0123456789abcdef0123456789abcd", DisplayName = "a path")]
        [DataRow("0123456789ABCDEF0123456789ABCDEF", DisplayName = "upper-case hex")]
        public async Task ReadAndWrite_NotACityId_AreRefused(string city)
        {
            await Assert.ThrowsExactlyAsync<ArgumentException>(() => _store.ReadAsync(city, _session));
            await Assert.ThrowsExactlyAsync<ArgumentException>(() => _store.WriteAsync(city, "a save", _session));
        }
    }
}
