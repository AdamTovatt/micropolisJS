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
        // Two cycles of the simulation's 16 phases at medium speed, which lets a phase through every third step
        private const int TwoCycles = 2 * 16 * 3;

        // How long a test waits for registry work that holds nothing up
        private static readonly TimeSpan WorkTimeout = TimeSpan.FromSeconds(5);

        private string _store = "";
        private HeldStore _heldStore = null!;
        private CityRegistry _registry = null!;
        private readonly CityConnection _ada = new CityConnection(new PlayerInfo("a", "Ada"));

        [TestInitialize]
        public void StartRegistry()
        {
            _store = ServerUnderTest.NewStore();
            _heldStore = new HeldStore(_store);
            _registry = new CityRegistry(_heldStore, new ServerClock(new FakeTimeProvider(), Manual: true), NullLogger<CityRegistry>.Instance);
        }

        [TestCleanup]
        public void DeleteStore()
        {
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
            // Still running, and saved as its next player leaves, once the store can keep it
            string saved = await ChangedAsync(city);
            ServerUnderTest.DeleteStore(_store);
            await _registry.LeaveAsync(_ada, city);
            Assert.AreEqual(saved, await StoredAsync(city));
        }

        [TestMethod]
        public async Task EnterAsync_AsTheLastPlayersLeaveSaves_WaitsForTheSaveAndLoadsIt()
        {
            LoadedCity city = await StartedAsync();
            string saved = await ChangedAsync(city);
            Task begun = _heldStore.HoldNext();
            Task leaving = _registry.LeaveAsync(_ada, city);
            await begun;

            Task<LoadedCity?> entering = _registry.EnterAsync(city.Id);

            Assert.IsFalse(entering.IsCompleted, "Entered the city before its save was kept");
            _heldStore.Release();
            await leaving;
            LoadedCity again = (await entering)!;
            Assert.AreNotSame(city, again);
            Assert.AreEqual(saved, await again.RunAsync(host => host.Save()));
        }

        [TestMethod]
        public async Task EnterAsync_StoredCityTwiceWhileItIsRead_LoadsItOnceWithoutHoldingUpAnotherCity()
        {
            LoadedCity city = await StartedAsync();
            await _registry.LeaveAsync(_ada, city);
            Task begun = _heldStore.HoldNext();
            Task<LoadedCity?> first = _registry.EnterAsync(city.Id);
            await begun;

            Task<LoadedCity?> second = _registry.EnterAsync(city.Id);
            LoadedCity other = await _registry.StartCityAsync(StartingCity.New("Other", 2027, Level.Easy)).WaitAsync(WorkTimeout);

            Assert.IsFalse(first.IsCompleted || second.IsCompleted, "Entered the city before it was read");
            _heldStore.Release();
            Assert.AreSame(await first, await second);
            Assert.AreNotSame(city, other);
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

        // Moves the city on from its start, and gives its save. A held driver advances by the debug channel's calls.
        private static async Task<string> ChangedAsync(LoadedCity city)
        {
            return await city.RunAsync(host =>
            {
                Assert.IsNull(host.Advance(TwoCycles).Error);
                return host.Save();
            });
        }

        private async Task<string> StoredAsync(LoadedCity city)
        {
            return await File.ReadAllTextAsync(new CityStore(_store).PathOf(city.Id));
        }

        // A store the test holds up: once told, its next read or write waits until the test releases it
        private sealed class HeldStore : CityStore
        {
            private TaskCompletionSource? _begun;
            private TaskCompletionSource? _released;

            public HeldStore(string directory) : base(directory)
            {
            }

            // Holds the next read or write, and gives what finishes once it has begun, and waits
            public Task HoldNext()
            {
                _begun = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                _released = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                return _begun.Task;
            }

            public void Release()
            {
                _released!.SetResult();
            }

            public override async Task<string?> ReadAsync(string city)
            {
                await WaitIfHeldAsync();
                return await base.ReadAsync(city);
            }

            public override async Task WriteAsync(string city, string savedGame)
            {
                await WaitIfHeldAsync();
                await base.WriteAsync(city, savedGame);
            }

            private async Task WaitIfHeldAsync()
            {
                TaskCompletionSource? begun = Interlocked.Exchange(ref _begun, null);

                if (begun is not null)
                {
                    begun.SetResult();
                    await _released!.Task;
                }
            }
        }
    }
}
