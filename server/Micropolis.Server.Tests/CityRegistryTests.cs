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
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;

namespace Micropolis.Server.Tests
{
    /// <summary>
    /// The registry on its own, with a store of the test's: when a city is saved, unloaded and loaded again.
    /// </summary>
    [TestClass]
    public sealed class CityRegistryTests
    {
        private string _store = "";
        private CityRegistry _registry = null!;
        private readonly CityConnection _ada = new CityConnection(new PlayerInfo("a", "Ada"));

        [TestInitialize]
        public void StartRegistry()
        {
            _store = ServerUnderTest.NewStore();
            _registry = new CityRegistry(new CityStore(_store), new CityClock(new FakeTimeProvider(), Manual: true), NullLogger<CityRegistry>.Instance);
        }

        [TestCleanup]
        public void DeleteStore()
        {
            if (File.Exists(_store))
            {
                File.Delete(_store);
            }

            ServerUnderTest.DeleteStore(_store);
        }

        [TestMethod]
        public async Task StopAsync_CityLoaded_KeepsItsSaveInTheStore()
        {
            LoadedCity city = await StartedAsync();
            string saved = await ChangedAsync(city);

            await ((IHostedService)_registry).StopAsync(CancellationToken.None);

            Assert.AreEqual(saved, await StoredAsync(city));
        }

        [TestMethod]
        public async Task LeaveAsync_LastPlayer_SavesTheCityAndUnloadsIt()
        {
            LoadedCity city = await StartedAsync();
            string saved = await ChangedAsync(city);

            await _registry.LeaveAsync(_ada, city);
            LoadedCity? entered = await _registry.EnterAsync(city.Id);

            Assert.AreEqual(saved, await StoredAsync(city));
            Assert.AreNotSame(city, entered);
            Assert.AreEqual(saved, await entered!.RunAsync(host => host.Save()));
        }

        [TestMethod]
        public async Task LeaveAsync_OneOfTwoPlayers_KeepsTheCityLoaded()
        {
            LoadedCity city = await StartedAsync();
            Assert.AreSame(city, await _registry.EnterAsync(city.Id));

            await _registry.LeaveAsync(_ada, city);

            Assert.AreSame(city, await _registry.EnterAsync(city.Id));
        }

        [TestMethod]
        public async Task EnterAsync_CityThatFailed_LoadsItAsItWasLastSaved()
        {
            LoadedCity city = await StartedAsync();
            string started = await StoredAsync(city);
            await ChangedAsync(city);
            await Assert.ThrowsExactlyAsync<CityStoppedException>(() => city.RunAsync<bool>(_ => throw new InvalidOperationException("the rules threw")));

            await _registry.LeaveAsync(_ada, city);
            LoadedCity? entered = await _registry.EnterAsync(city.Id);

            Assert.AreEqual(started, await StoredAsync(city));
            Assert.AreNotSame(city, entered);
            Assert.AreEqual(started, await entered!.RunAsync(host => host.Save()));
        }

        [TestMethod]
        public async Task LeaveAsync_StoreThatCantKeepTheCity_KeepsItLoaded()
        {
            LoadedCity city = await StartedAsync();
            // A file where the store's directory was, which no city can be written into
            ServerUnderTest.DeleteStore(_store);
            await File.WriteAllTextAsync(_store, "");

            await _registry.LeaveAsync(_ada, city);

            Assert.AreSame(city, await _registry.EnterAsync(city.Id));
        }

        [TestMethod]
        public async Task EnterAsync_NoSuchCity_IsNull()
        {
            Assert.IsNull(await _registry.EnterAsync(CityId.New()));
        }

        // A new city with Ada in it
        private async Task<LoadedCity> StartedAsync()
        {
            LoadedCity city = await _registry.StartCityAsync(StartingCity.New("Town", 2026, Level.Easy));
            await city.JoinAsync(new Joining(_ada, 0, Hold: true));
            return city;
        }

        // Moves the city on from its start, and gives its save
        private static async Task<string> ChangedAsync(LoadedCity city)
        {
            return await city.RunAsync(host =>
            {
                Assert.IsNull(host.Advance(96).Error);
                return host.Save();
            });
        }

        private async Task<string> StoredAsync(LoadedCity city)
        {
            return await File.ReadAllTextAsync(Path.Combine(_store, city.Id + ".json"));
        }
    }
}
