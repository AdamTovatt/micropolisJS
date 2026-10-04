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

using System.Collections.Concurrent;
using System.Data.Common;
using System.Text.Json.Nodes;
using EasyReasy.Database;
using Micropolis.Rules;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
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
        // The server's clock, which only the autosave tests move: the cities run on the debug channel's manual clock
        private FakeTimeProvider _time = null!;
        private ErrorLog _log = null!;
        private CityRegistry _registry = null!;
        private readonly CityConnection _ada = new CityConnection(new PlayerInfo("a", "Ada"));
        private readonly CityConnection _grace = new CityConnection(new PlayerInfo("g", "Grace"));

        [TestInitialize]
        public void StartRegistry()
        {
            _database = TestCityDatabase.NewFile();
            DbDataSource dataSource = TestCityDatabase.OpenDataSource(_database);
            _heldStore = new HeldStore(dataSource, new DbSessionFactory(dataSource));
            _time = new FakeTimeProvider();
            _log = new ErrorLog();
            _registry = new CityRegistry(_heldStore, new ServerClock(_time, Manual: true), _log);
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
        public async Task Autosave_CityThatStepped_StoresItAfterTheInterval()
        {
            LoadedCity city = await StartedAsync();
            string started = await StoredAsync(city);
            string stepped = await ChangedAsync(city);

            _time.Advance(CityRegistry.AutosaveInterval);

            CollectionAssert.AreEqual(new[] { started, stepped }, await SavesKeptBeforeOneMoreAsync(city));
        }

        [TestMethod]
        public async Task Autosave_CityThatOnlyAppliedACommand_StoresItAfterTheInterval()
        {
            LoadedCity city = await StartedAsync();
            string started = await StoredAsync(city);
            string commanded = await city.RunAsync(host =>
            {
                host.Send("a", new JsonObject { ["type"] = "addFunds" });
                host.Flush();
                return host.Save();
            });
            Assert.AreNotEqual(started, commanded, "The command changed nothing saved");

            _time.Advance(CityRegistry.AutosaveInterval);

            CollectionAssert.AreEqual(new[] { started, commanded }, await SavesKeptBeforeOneMoreAsync(city));
        }

        [TestMethod]
        public async Task Autosave_CityUnchangedSinceItStarted_StoresNothing()
        {
            LoadedCity city = await StartedAsync();
            string started = await StoredAsync(city);

            _time.Advance(CityRegistry.AutosaveInterval);

            CollectionAssert.AreEqual(new[] { started }, await SavesKeptBeforeOneMoreAsync(city));
        }

        [TestMethod]
        public async Task Autosave_CityUnchangedSinceAPlayerSavedIt_StoresNothing()
        {
            LoadedCity city = await StartedAsync();
            string started = await StoredAsync(city);
            string saved = await ChangedAsync(city);
            await _registry.SaveAsync(city);

            _time.Advance(CityRegistry.AutosaveInterval);

            CollectionAssert.AreEqual(new[] { started, saved }, await SavesKeptBeforeOneMoreAsync(city));
        }

        // A player's save restarts the countdown, so the autosave due before it doesn't come, and the next comes an
        // interval after the save
        [TestMethod]
        public async Task Autosave_AfterAPlayersSave_ComesAnIntervalAfterIt()
        {
            TimeSpan beforeDue = TimeSpan.FromMinutes(1);
            LoadedCity city = await StartedAsync();
            string started = await StoredAsync(city);
            _time.Advance(CityRegistry.AutosaveInterval - beforeDue);
            string saved = await ChangedAsync(city);
            await _registry.SaveAsync(city);

            string missedByTheOldCountdown = await ChangedAsync(city);
            _time.Advance(beforeDue);
            string later = await ChangedAsync(city);
            _time.Advance(CityRegistry.AutosaveInterval - beforeDue);

            List<string> kept = await SavesKeptBeforeOneMoreAsync(city);
            CollectionAssert.DoesNotContain(kept, missedByTheOldCountdown, "The autosave due before the player's save came");
            CollectionAssert.AreEqual(new[] { started, saved, later }, kept);
        }

        [TestMethod]
        public async Task Autosave_WhileTheStoreKeepsItAndAPlayerSavesANewerOne_KeepsThePlayersSaveLast()
        {
            LoadedCity city = await StartedAsync();
            await ChangedAsync(city);
            Task begun = _heldStore.HoldNext();
            _time.Advance(CityRegistry.AutosaveInterval);
            await begun.WaitAsync(WorkTimeout);

            string newer = await ChangedAsync(city).WaitAsync(WorkTimeout);
            Task saving = _registry.SaveAsync(city);

            await AssertStillWaitingAsync(saving, "Kept the player's save before the autosave taken earlier");
            _heldStore.Release();
            await saving;
            Assert.AreEqual(newer, await StoredAsync(city));
        }

        // An autosave taken behind a save the store is still keeping would only queue up saves while the store is slow
        [TestMethod]
        public async Task Autosave_WhileTheStoreKeepsAPlayersSave_TakesNone()
        {
            LoadedCity city = await StartedAsync();
            string started = await StoredAsync(city);
            string older = await ChangedAsync(city);
            Task begun = _heldStore.HoldNext();
            Task saving = _registry.SaveAsync(city);
            await begun;

            await ChangedAsync(city).WaitAsync(WorkTimeout);
            _time.Advance(CityRegistry.AutosaveInterval);
            _heldStore.Release();
            await saving;

            CollectionAssert.AreEqual(new[] { started, older }, await SavesKeptBeforeOneMoreAsync(city));
        }

        // The failed autosave doesn't restart the countdown or count the city as stored, so the next stores it unchanged
        [TestMethod]
        public async Task Autosave_StoreThatFailsIt_KeepsTheCityLoadedAndTheNextAutosaveStoresIt()
        {
            LoadedCity city = await StartedAsync();
            string started = await StoredAsync(city);
            string stepped = await ChangedAsync(city);
            Task begun = _heldStore.HoldNext();
            _time.Advance(CityRegistry.AutosaveInterval);
            await begun.WaitAsync(WorkTimeout);

            _heldStore.ReleaseFailing();

            Assert.IsInstanceOfType<CityStoreException>(await _log.FirstError.WaitAsync(WorkTimeout));
            Assert.AreSame(city, await _registry.EnterAsync(city.Id, held: true));
            _time.Advance(CityRegistry.AutosaveInterval);
            CollectionAssert.AreEqual(new[] { started, stepped }, await SavesKeptBeforeOneMoreAsync(city));
        }

        // As the store stops keeping it in its unloading, which leaves it loaded and its countdown running
        [TestMethod]
        public async Task Autosave_CityItsLastPlayersLeavingCouldntStore_StoresItAtTheNext()
        {
            LoadedCity city = await StartedAsync();
            string started = await StoredAsync(city);
            string stepped = await ChangedAsync(city);
            TestCityDatabase.MakeReadOnly(_database);
            await _registry.LeaveAsync(_ada, city);
            TestCityDatabase.MakeWritable(_database);

            _time.Advance(CityRegistry.AutosaveInterval);

            CollectionAssert.AreEqual(new[] { started, stepped }, await SavesKeptBeforeOneMoreAsync(city));
        }

        // The countdown starts as a city loads from the store, as it does when one starts
        [TestMethod]
        public async Task Autosave_CityLoadedFromTheStore_StoresItAnIntervalAfterItLoaded()
        {
            LoadedCity unloaded = await StartedAsync();
            await _registry.LeaveAsync(_ada, unloaded);
            List<string> keptBefore = _heldStore.Kept(unloaded.Id);
            LoadedCity city = (await _registry.EnterAsync(unloaded.Id, held: true))!;
            await city.JoinAsync(new Joining(_ada, 0, Hold: true));
            string stepped = await ChangedAsync(city);

            _time.Advance(CityRegistry.AutosaveInterval);

            CollectionAssert.AreEqual(keptBefore.Append(stepped).ToList(), await SavesKeptBeforeOneMoreAsync(city));
        }

        // Its stopping saves every city it can, and a city that it couldn't, or that loads after, is left as the store
        // last kept it rather than saved on to a store that is stopping too
        [TestMethod]
        public async Task Autosave_AfterTheServerStopped_StoresNothing()
        {
            LoadedCity city = await StartedAsync();
            string started = await StoredAsync(city);
            await ChangedAsync(city);
            TestCityDatabase.MakeReadOnly(_database);
            await ((IHostedService)_registry).StopAsync(CancellationToken.None);
            TestCityDatabase.MakeWritable(_database);

            _time.Advance(CityRegistry.AutosaveInterval);

            CollectionAssert.AreEqual(new[] { started }, await SavesKeptBeforeOneMoreAsync(city));
        }

        // A city on the server's clock, which neither the debug channel holds nor moves on, changes in its loop's turns
        [TestMethod]
        public async Task Autosave_CitySteppingOnTheServersClock_StoresItAfterTheInterval()
        {
            FakeTimeProvider time = new FakeTimeProvider();
            CityRegistry registry = new CityRegistry(_heldStore, new ServerClock(time, Manual: false), _log);
            LoadedCity city = await registry.StartCityAsync(StartingCity.New("Town", 2026, Level.Easy), held: false);
            string started = await StoredAsync(city);
            await FramesAsync(city, time, ManyFrames);

            time.Advance(CityRegistry.AutosaveInterval);

            List<string> kept = await SavesKeptBeforeOneMoreAsync(registry, city);
            Assert.AreEqual(2, kept.Count);
            Assert.AreEqual(started, kept[0]);
            Assert.AreNotEqual(started, kept[1], "Stored the city as it started");
            await ((IHostedService)registry).StopAsync(CancellationToken.None);
        }

        // As a city paused by a command its loop applied, which takes no step
        [TestMethod]
        public async Task Autosave_CityPausedByACommandOnTheServersClock_StoresItAfterTheInterval()
        {
            FakeTimeProvider time = new FakeTimeProvider();
            CityRegistry registry = new CityRegistry(_heldStore, new ServerClock(time, Manual: false), _log);
            LoadedCity city = await registry.StartCityAsync(StartingCity.New("Town", 2026, Level.Easy), held: false);
            string started = await StoredAsync(city);
            await city.RunAsync(host => host.Send("a", new JsonObject { ["type"] = "setSpeed", ["speed"] = 0 }));
            await FramesAsync(city, time, ManyFrames);
            Assert.AreEqual(1, await city.RunAsync(host => host.ChangeCount), "The city stepped before it paused");

            time.Advance(CityRegistry.AutosaveInterval);

            List<string> kept = await SavesKeptBeforeOneMoreAsync(registry, city);
            Assert.AreEqual(2, kept.Count);
            Assert.AreEqual(started, kept[0]);
            Assert.AreNotEqual(started, kept[1], "Stored the city as it started");
            await ((IHostedService)registry).StopAsync(CancellationToken.None);
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

        // Every save the store has kept of the city, oldest first, its start's included, up to now. A player's save of the
        // city is kept only after every save of it taken before, so it takes one, and reads the saves once that is kept,
        // leaving it out once it has checked that it is the city as it stands
        private async Task<List<string>> SavesKeptBeforeOneMoreAsync(LoadedCity city)
        {
            return await SavesKeptBeforeOneMoreAsync(_registry, city);
        }

        private async Task<List<string>> SavesKeptBeforeOneMoreAsync(CityRegistry registry, LoadedCity city)
        {
            string now = await city.RunAsync(host => host.Save());
            await registry.SaveAsync(city);
            List<string> kept = _heldStore.Kept(city.Id);
            Assert.AreEqual(now, kept[^1], "The last save kept wasn't the one taken to wait for the others");
            kept.RemoveAt(kept.Count - 1);
            return kept;
        }

        // Fails, saying why, when the work finishes within the time a store write takes to land
        private static async Task AssertStillWaitingAsync(Task work, string message)
        {
            await Task.WhenAny(work, Task.Delay(LandingTime));
            Assert.IsFalse(work.IsCompleted, message);
        }

        // The registry's log, which gives the exception of the first error logged, once one is
        private sealed class ErrorLog : ILogger<CityRegistry>
        {
            private readonly TaskCompletionSource<Exception?> _firstError = new TaskCompletionSource<Exception?>(TaskCreationOptions.RunContinuationsAsynchronously);

            public Task<Exception?> FirstError => _firstError.Task;

            public IDisposable? BeginScope<TState>(TState state) where TState : notnull
            {
                return null;
            }

            public bool IsEnabled(LogLevel logLevel)
            {
                return true;
            }

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                if (logLevel >= LogLevel.Error)
                {
                    _firstError.TrySetResult(exception);
                }
            }
        }

        // A store the test holds up: once told, its next read or write waits until the test releases it. It records each
        // save it keeps.
        private sealed class HeldStore : CityStore
        {
            private readonly ConcurrentQueue<(string City, string SavedGame)> _kept = new ConcurrentQueue<(string City, string SavedGame)>();
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
                _kept.Enqueue((city, savedGame));
            }

            // The saves of the city kept so far, in the order they were kept
            public List<string> Kept(string city)
            {
                return _kept.Where(kept => kept.City == city).Select(kept => kept.SavedGame).ToList();
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
