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

namespace Micropolis.Server
{
    /// <summary>
    /// The cities the server runs: each loaded while at least one player is in it, and kept in the store, by its id,
    /// while none is. A city is saved to the store when it starts, when a player saves it, when its last player leaves,
    /// which unloads it, and as the server stops; entering it again loads it and it resumes. One city's saves are kept
    /// in the order they were taken. The registry counts who is in each city under one lock, and waits on
    /// a city's work and the store outside it, so one busy city holds up no other. A player entering a city as its last
    /// player leaves finds it loaded, or waits for its save and loads it again.
    /// </summary>
    internal sealed class CityRegistry : IHostedService
    {
        private readonly CityStore _store;
        private readonly ServerClock _clock;
        private readonly ILogger<CityRegistry> _logger;
        private readonly SemaphoreSlim _lock = new SemaphoreSlim(1, 1);
        // The cities loaded, by id, each with how many connections are in it or entering it
        private readonly Dictionary<string, Loaded> _loaded = new Dictionary<string, Loaded>(StringComparer.Ordinal);
        // The cities loading from the store or saving to it as they unload, by id, each finishing once that is done or
        // has failed. A player entering one waits for it, then looks again.
        private readonly Dictionary<string, Task> _moving = new Dictionary<string, Task>(StringComparer.Ordinal);

        public CityRegistry(CityStore store, ServerClock clock, ILogger<CityRegistry> logger)
        {
            _store = store;
            _clock = clock;
            _logger = logger;
        }

        /// <summary>
        /// Starts the city under a new id, keeps it in the store, and counts in the connection that will join it, held
        /// from its first step when that connection's debug channel holds it.
        /// </summary>
        /// <exception cref="CityStoreException">The store couldn't keep the city, which then doesn't start.</exception>
        public async Task<LoadedCity> StartCityAsync(StartingCity start, bool held)
        {
            string id = CityId.New();
            await _store.WriteAsync(id, SavedGame.Write(start.Name, start.City));
            LoadedCity city = new LoadedCity(id, start, _clock, held, Failed);

            await _lock.WaitAsync();
            try
            {
                return Enter(Add(city));
            }
            finally
            {
                _lock.Release();
            }
        }

        /// <summary>
        /// The city with the id, loaded from the store if no one is in it, with the connection that will join it
        /// counted in; or null when there is no such city. A city it loads is held from its first step when that
        /// connection's debug channel holds it; one already loaded is held as the connection joins it.
        /// </summary>
        /// <exception cref="SaveFormatException">The store keeps the city as a save the rules don't load.</exception>
        /// <exception cref="CityStoreException">The store couldn't be read.</exception>
        public async Task<LoadedCity?> EnterAsync(string id, bool held)
        {
            while (true)
            {
                Task? moving;
                TaskCompletionSource loading = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

                await _lock.WaitAsync();
                try
                {
                    if (!_moving.TryGetValue(id, out moving))
                    {
                        if (_loaded.TryGetValue(id, out Loaded? loaded))
                        {
                            return Enter(loaded);
                        }

                        _moving[id] = loading.Task;
                    }
                }
                finally
                {
                    _lock.Release();
                }

                if (moving is null)
                {
                    return await LoadAsync(id, held, loading);
                }

                // The city is loading for another player, or its last player has just left: once it has loaded, or its
                // save is kept, the next look finds it
                await moving;
            }
        }

        /// <summary>
        /// Takes the connection out of the city it entered, joined or not, and when it was the last in it, saves the
        /// city to the store and unloads it.
        /// </summary>
        public async Task LeaveAsync(CityConnection connection, LoadedCity city)
        {
            try
            {
                await city.LeaveAsync(connection);
            }
            catch (CityStoppedException)
            {
                // The city failed, which Failed logs; it is no longer loaded
            }

            TaskCompletionSource unloaded = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

            await _lock.WaitAsync();
            try
            {
                if (!_loaded.TryGetValue(city.Id, out Loaded? loaded) || loaded.City != city || --loaded.Players > 0)
                {
                    return;
                }

                _loaded.Remove(city.Id);
                _moving[city.Id] = unloaded.Task;
            }
            finally
            {
                _lock.Release();
            }

            try
            {
                await UnloadAsync(city);
            }
            finally
            {
                await DoneMovingAsync(city.Id, unloaded);
            }
        }

        /// <summary>
        /// Saves the loaded city to the store as it stands now, once every save of it taken before is kept or has failed
        /// to be, so the store never keeps an older save over a newer one, its unloading's included. The city steps on
        /// meanwhile: its work only takes the save.
        /// </summary>
        /// <exception cref="CityStoreException">The store couldn't keep the save. The city stays loaded, so the next
        /// save, its last player's leaving or the server's stopping saves it again.</exception>
        /// <exception cref="CityStoppedException">The city stopped before the save was taken.</exception>
        public async Task SaveAsync(LoadedCity city)
        {
            try
            {
                await city.SaveAsync(savedGame => _store.WriteAsync(city.Id, savedGame));
            }
            catch (CityStoreException exception)
            {
                _logger.LogError(exception, "City {City} couldn't be saved, and stays loaded", city.Id);
                throw;
            }
        }

        // Nothing loads before a player enters a city
        Task IHostedService.StartAsync(CancellationToken cancellationToken)
        {
            return Task.CompletedTask;
        }

        /// <summary>
        /// Saves and unloads every city still loaded as the server stops, and waits for those already saving. The
        /// connections close before the server's services stop, so this finds a city loaded only where a player's
        /// leaving didn't unload it. It saves every city however long that takes, past the host's shutdown timeout,
        /// which would otherwise stop it before a city it hadn't saved yet.
        /// </summary>
        async Task IHostedService.StopAsync(CancellationToken cancellationToken)
        {
            List<LoadedCity> loaded;
            List<Task> moving;

            await _lock.WaitAsync();
            try
            {
                loaded = _loaded.Values.Select(entry => entry.City).ToList();
                moving = _moving.Values.ToList();
                _loaded.Clear();
            }
            finally
            {
                _lock.Release();
            }

            foreach (LoadedCity city in loaded)
            {
                await UnloadAsync(city);
            }

            await Task.WhenAll(moving);
        }

        // Reads the city from the store and loads it, outside the lock, so no other city waits on it. Those entering it
        // meanwhile wait on loading.
        private async Task<LoadedCity?> LoadAsync(string id, bool held, TaskCompletionSource loading)
        {
            try
            {
                string? savedGame = await _store.ReadAsync(id);
                LoadedCity? city = savedGame is null ? null : new LoadedCity(id, StartingCity.FromSave(savedGame), _clock, held, Failed);

                await _lock.WaitAsync();
                try
                {
                    return city is null ? null : Enter(Add(city));
                }
                finally
                {
                    _lock.Release();
                }
            }
            finally
            {
                await DoneMovingAsync(id, loading);
            }
        }

        private async Task DoneMovingAsync(string id, TaskCompletionSource moved)
        {
            await _lock.WaitAsync();
            try
            {
                _moving.Remove(id);
            }
            finally
            {
                _lock.Release();
            }

            moved.SetResult();
        }

        private Loaded Add(LoadedCity city)
        {
            Loaded loaded = new Loaded(city);
            _loaded[city.Id] = loaded;
            return loaded;
        }

        private static LoadedCity Enter(Loaded loaded)
        {
            loaded.Players++;
            return loaded.City;
        }

        // Saves the city to the store and stops it. A city that fails as it saves is gone, as Failed says. One the store
        // can't keep stays loaded, so it isn't lost, and is saved again when its next player leaves or the server stops.
        private async Task UnloadAsync(LoadedCity city)
        {
            try
            {
                await SaveAsync(city);
                await city.StopAsync();
            }
            catch (CityStoppedException)
            {
                // The store keeps the city as it was last saved
            }
            catch (CityStoreException)
            {
                // SaveAsync logged it
                await _lock.WaitAsync();
                try
                {
                    _loaded[city.Id] = new Loaded(city);
                }
                finally
                {
                    _lock.Release();
                }
            }
        }

        // A city whose work threw is unloaded without saving: the store keeps it as it was last saved
        private void Failed(LoadedCity city, Exception exception)
        {
            _logger.LogError(exception, "City {City} failed, and is unloaded without saving", city.Id);

            _ = RemoveAsync();

            async Task RemoveAsync()
            {
                await _lock.WaitAsync();
                try
                {
                    if (_loaded.TryGetValue(city.Id, out Loaded? loaded) && loaded.City == city)
                    {
                        _loaded.Remove(city.Id);
                    }
                }
                finally
                {
                    _lock.Release();
                }
            }
        }

        // A loaded city, and how many connections are in it or entering it, which only changes under the lock
        private sealed class Loaded
        {
            public Loaded(LoadedCity city)
            {
                City = city;
            }

            public LoadedCity City { get; }

            public int Players { get; set; }
        }
    }
}
