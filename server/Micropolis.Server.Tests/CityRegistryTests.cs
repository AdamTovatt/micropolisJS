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
using System.Text.Json.Nodes;
using EasyReasy.Database;
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

        // Half a second of the server's clock, in which a city that isn't held takes a step on most frames
        private const int ManyFrames = 30;

        // How long a test waits for registry work that holds nothing up
        private static readonly TimeSpan WorkTimeout = TimeSpan.FromSeconds(5);

        // How long a test gives a store write it expects to wait on another to land anyway, were it not waiting: well past
        // a write's time, so one that lands too soon fails the test, while a busy machine can only let it pass
        private static readonly TimeSpan LandingTime = TimeSpan.FromMilliseconds(500);

        // The registry's store outlives the registry's loading and unloading, so it is a file of the test's own
        private string _database = "";
        private HeldStore _heldStore = null!;
        private CityRegistry _registry = null!;
        private readonly CityConnection _ada = new CityConnection(new PlayerInfo("a", "Ada"));
        private readonly CityConnection _grace = new CityConnection(new PlayerInfo("g", "Grace"));

        [TestInitialize]
        public void StartRegistry()
        {
            _database = TestCityDatabase.NewFile();
            DbDataSource dataSource = TestCityDatabase.OpenDataSource(_database);
            _heldStore = new HeldStore(dataSource, new DbSessionFactory(dataSource));
            _registry = new CityRegistry(_heldStore, new ServerClock(new FakeTimeProvider(), Manual: true), NullLogger<CityRegistry>.Instance);
        }

        [TestCleanup]
        public void DeleteDatabase()
        {
            TestCityDatabase.Delete(_database);
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
            LoadedCity? entered = await _registry.EnterAsync(city.Id, held: true);

            Assert.AreEqual(saved, await StoredAsync(city));
            Assert.AreNotSame(city, entered);
            Assert.AreEqual(saved, await entered!.RunAsync(host => host.Save()));
        }

        [TestMethod]
        public async Task EnterAsync_CityUnloadedAndLoadedAgain_ContinuesToTheStateHashOfOneThatStayedLoaded()
        {
            LoadedCity city = await StartedAsync(_ada);
            LoadedCity stayed = await StartedAsync(_grace);
            string unloadedAt = HashOf(await ChangedAsync(city));
            Assert.AreEqual(unloadedAt, HashOf(await ChangedAsync(stayed)));

            await _registry.LeaveAsync(_ada, city);
            LoadedCity again = (await _registry.EnterAsync(city.Id, held: true))!;
            await again.JoinAsync(new Joining(_ada, 0, Hold: true));

            Assert.AreNotSame(city, again);
            string continued = HashOf(await ChangedAsync(again));
            Assert.AreNotEqual(unloadedAt, continued, "The city didn't move on after it loaded again");
            Assert.AreEqual(HashOf(await ChangedAsync(stayed)), continued);
        }

        [TestMethod]
        public async Task LeaveAsync_OneOfTwoPlayers_KeepsTheCityLoaded()
        {
            LoadedCity city = await StartedAsync();
            Assert.AreSame(city, await _registry.EnterAsync(city.Id, held: true));

            await _registry.LeaveAsync(_ada, city);

            Assert.AreSame(city, await _registry.EnterAsync(city.Id, held: true));
        }

        [TestMethod]
        public async Task EnterAsync_CityThatFailed_LoadsItAsItWasLastSaved()
        {
            LoadedCity city = await StartedAsync();
            string started = await StoredAsync(city);
            await ChangedAsync(city);
            await Assert.ThrowsExactlyAsync<CityStoppedException>(() => city.RunAsync<bool>(_ => throw new InvalidOperationException("the rules threw")));

            await _registry.LeaveAsync(_ada, city);
            LoadedCity? entered = await _registry.EnterAsync(city.Id, held: true);

            Assert.AreEqual(started, await StoredAsync(city));
            Assert.AreNotSame(city, entered);
            Assert.AreEqual(started, await entered!.RunAsync(host => host.Save()));
        }

        [TestMethod]
        public async Task LeaveAsync_StoreThatCantKeepTheCity_KeepsItLoaded()
        {
            LoadedCity city = await StartedAsync();
            TestCityDatabase.MakeReadOnly(_database);

            await _registry.LeaveAsync(_ada, city);

            Assert.AreSame(city, await _registry.EnterAsync(city.Id, held: true));
            // Still running, and saved as its next player leaves, once the store can keep it
            string saved = await ChangedAsync(city);
            TestCityDatabase.MakeWritable(_database);
            await _registry.LeaveAsync(_ada, city);
            Assert.AreEqual(saved, await StoredAsync(city));
        }

        [TestMethod]
        public async Task SaveAsync_CityLoaded_KeepsItsSaveInTheStoreAndKeepsItLoaded()
        {
            LoadedCity city = await StartedAsync();
            string saved = await ChangedAsync(city);

            await _registry.SaveAsync(city);

            Assert.AreEqual(saved, await StoredAsync(city));
            Assert.AreSame(city, await _registry.EnterAsync(city.Id, held: true));
        }

        [TestMethod]
        public async Task SaveAsync_WhileTheStoreKeepsAnEarlierSave_KeepsTheLaterOneLastWithoutHoldingUpTheCity()
        {
            LoadedCity city = await StartedAsync();
            await ChangedAsync(city);
            Task begun = _heldStore.HoldNext();
            Task earlier = _registry.SaveAsync(city);
            await begun;

            // The city's work goes on while the store holds the save it took
            string saved = await ChangedAsync(city).WaitAsync(WorkTimeout);
            Task later = _registry.SaveAsync(city);

            await AssertStillWaitingAsync(later, "Kept the later save before the earlier one");
            _heldStore.Release();
            await Task.WhenAll(earlier, later);
            Assert.AreEqual(saved, await StoredAsync(city));
        }

        [TestMethod]
        public async Task LeaveAsync_WhileTheStoreKeepsAnEarlierSave_KeepsTheUnloadsSaveLast()
        {
            LoadedCity city = await StartedAsync();
            await ChangedAsync(city);
            Task begun = _heldStore.HoldNext();
            Task earlier = _registry.SaveAsync(city);
            await begun;
            string saved = await ChangedAsync(city);

            Task leaving = _registry.LeaveAsync(_ada, city);

            await AssertStillWaitingAsync(leaving, "Unloaded the city before the earlier save was kept");
            _heldStore.Release();
            await Task.WhenAll(earlier, leaving);
            Assert.AreEqual(saved, await StoredAsync(city));
            Assert.AreNotSame(city, await _registry.EnterAsync(city.Id, held: true));
        }

        [TestMethod]
        public async Task SaveAsync_EarlierSaveTheStoreCouldntKeep_KeepsTheLaterOne()
        {
            LoadedCity city = await StartedAsync();
            await ChangedAsync(city);
            Task begun = _heldStore.HoldNext();
            Task earlier = _registry.SaveAsync(city);
            await begun;
            string saved = await ChangedAsync(city);
            Task later = _registry.SaveAsync(city);

            _heldStore.ReleaseFailing();

            await Assert.ThrowsExactlyAsync<CityStoreException>(() => earlier);
            await later;
            Assert.AreEqual(saved, await StoredAsync(city));
        }

        [TestMethod]
        public async Task SaveAsync_StoreThatCantKeepTheCity_FailsAndKeepsItLoaded()
        {
            LoadedCity city = await StartedAsync();
            string started = await StoredAsync(city);
            await ChangedAsync(city);
            TestCityDatabase.MakeReadOnly(_database);

            await Assert.ThrowsExactlyAsync<CityStoreException>(() => _registry.SaveAsync(city));

            Assert.AreEqual(started, await StoredAsync(city));
            Assert.AreSame(city, await _registry.EnterAsync(city.Id, held: true));
            // Still running, and saved by the next save, once the store can keep it
            string saved = await ChangedAsync(city);
            TestCityDatabase.MakeWritable(_database);
            await _registry.SaveAsync(city);
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

            Task<LoadedCity?> entering = _registry.EnterAsync(city.Id, held: true);

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
            Task<LoadedCity?> first = _registry.EnterAsync(city.Id, held: true);
            await begun;

            Task<LoadedCity?> second = _registry.EnterAsync(city.Id, held: true);
            LoadedCity other = await _registry.StartCityAsync(StartingCity.New("Other", 2027, Level.Easy), held: true).WaitAsync(WorkTimeout);

            Assert.IsFalse(first.IsCompleted || second.IsCompleted, "Entered the city before it was read");
            _heldStore.Release();
            Assert.AreSame(await first, await second);
            Assert.AreNotSame(city, other);
        }

        [TestMethod]
        public async Task EnterAsync_NoSuchCity_IsNull()
        {
            Assert.IsNull(await _registry.EnterAsync(CityId.New(), held: true));
        }

        // On the server's clock, a city's loop turns from the moment it starts: one started for a held connection takes no
        // step before that connection joins it and holds it
        [TestMethod]
        public async Task StartCityAsync_HeldOnTheServersClock_TakesNoStepBeforeTheConnectionJoins()
        {
            FakeTimeProvider time = new FakeTimeProvider();
            CityRegistry registry = new CityRegistry(_heldStore, new ServerClock(time, Manual: false), NullLogger<CityRegistry>.Instance);

            LoadedCity city = await registry.StartCityAsync(StartingCity.New("Town", 2026, Level.Easy), held: true);
            await FramesAsync(city, time, ManyFrames);

            Assert.AreEqual(await StoredAsync(city), await city.RunAsync(host => host.Save()));
            await ((IHostedService)registry).StopAsync(CancellationToken.None);
        }

        // As a new city does, so does one loaded from the store for a held connection
        [TestMethod]
        public async Task EnterAsync_HeldCityItLoadsOnTheServersClock_TakesNoStepBeforeTheConnectionJoins()
        {
            LoadedCity stored = await StartedAsync();
            await ChangedAsync(stored);
            await _registry.LeaveAsync(_ada, stored);
            FakeTimeProvider time = new FakeTimeProvider();
            CityRegistry registry = new CityRegistry(_heldStore, new ServerClock(time, Manual: false), NullLogger<CityRegistry>.Instance);

            LoadedCity city = (await registry.EnterAsync(stored.Id, held: true))!;
            await FramesAsync(city, time, ManyFrames);

            Assert.AreEqual(await StoredAsync(city), await city.RunAsync(host => host.Save()));
            await ((IHostedService)registry).StopAsync(CancellationToken.None);
        }

        // Moves the server's clock on a frame at a time, and lets the city take each turn of its loop that falls due
        private static async Task FramesAsync(LoadedCity city, FakeTimeProvider time, int frames)
        {
            for (int frame = 0; frame < frames; frame++)
            {
                time.Advance(TimerTicker.FrameInterval);
                await city.RunAsync(_ => { });
            }
        }

        // A new city with Ada in it
        private async Task<LoadedCity> StartedAsync()
        {
            return await StartedAsync(_ada);
        }

        // A new city with the player in it, the same as every other new city here
        private async Task<LoadedCity> StartedAsync(CityConnection player)
        {
            LoadedCity city = await _registry.StartCityAsync(StartingCity.New("Town", 2026, Level.Easy), held: true);
            await city.JoinAsync(new Joining(player, 0, Hold: true));
            return city;
        }

        // The state hash of the city a save holds
        private static string HashOf(string savedGame)
        {
            JsonNode state = SavedGame.Load(savedGame, out _).Save();
            return StateHash.HashSavedState(state);
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
            return (await TestCityDatabase.ReadRowAsync(_database, city.Id))!.SavedGame;
        }

        // Fails, saying why, when the work finishes within the time a store write takes to land
        private static async Task AssertStillWaitingAsync(Task work, string message)
        {
            await Task.WhenAny(work, Task.Delay(LandingTime));
            Assert.IsFalse(work.IsCompleted, message);
        }

        // A store the test holds up: once told, its next read or write waits until the test releases it
        private sealed class HeldStore : CityStore
        {
            private TaskCompletionSource? _begun;
            private TaskCompletionSource? _released;

            public HeldStore(DbDataSource dataSource, IDbSessionFactory sessionFactory) : base(dataSource, sessionFactory, TimeProvider.System)
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

            // Releases the read or write held, failing it as a database the store can't reach does
            public void ReleaseFailing()
            {
                _released!.SetException(new CityStoreException("The test's store failed.", new InvalidOperationException("held")));
            }

            public override async Task<string?> ReadAsync(string city, IDbSession? session = null)
            {
                await WaitIfHeldAsync();
                return await base.ReadAsync(city, session);
            }

            public override async Task WriteAsync(string city, string savedGame, IDbSession? session = null)
            {
                await WaitIfHeldAsync();
                await base.WriteAsync(city, savedGame, session);
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
