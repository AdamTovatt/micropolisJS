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
    /// while none is. A city is saved to the store when it starts, and when its last player leaves, which unloads it;
    /// entering it again loads it and it resumes. The registry counts who is in each city under one lock, and waits on
    /// a city's work and the store outside it, so one busy city holds up no other. A player entering a city as its last
    /// player leaves finds it loaded, or waits for its save and loads it again.
    /// </summary>
    internal sealed class CityRegistry : IHostedService
    {
        private readonly CityStore _store;
        private readonly CityClock _clock;
        private readonly ILogger<CityRegistry> _logger;
        private readonly SemaphoreSlim _lock = new SemaphoreSlim(1, 1);
        // The cities loaded, by id, each with how many connections are in it or entering it
        private readonly Dictionary<string, Loaded> _loaded = new Dictionary<string, Loaded>(StringComparer.Ordinal);
        // The cities saving as they unload, by id, each finishing once its save is kept or has failed
        private readonly Dictionary<string, Task> _unloading = new Dictionary<string, Task>(StringComparer.Ordinal);

        public CityRegistry(CityStore store, CityClock clock, ILogger<CityRegistry> logger)
        {
            _store = store;
            _clock = clock;
            _logger = logger;
        }

        /// <summary>
        /// Starts the city under a new id, keeps it in the store, and counts in the connection that will join it.
        /// </summary>
        /// <exception cref="CityStoreException">The store couldn't keep the city, which then doesn't start.</exception>
        public async Task<LoadedCity> StartCityAsync(StartingCity start)
        {
            string id = CityId.New();
            await _store.WriteAsync(id, SavedGame.Write(start.Name, start.City));

            await _lock.WaitAsync();
            try
            {
                return Enter(Load(id, start));
            }
            finally
            {
                _lock.Release();
            }
        }

        /// <summary>
        /// The city with the id, loaded from the store if no one is in it, with the connection that will join it
        /// counted in; or null when there is no such city.
        /// </summary>
        /// <exception cref="SaveFormatException">The store keeps the city as a save the rules don't load.</exception>
        /// <exception cref="CityStoreException">The store couldn't be read.</exception>
        public async Task<LoadedCity?> EnterAsync(string id)
        {
            while (true)
            {
                Task? unloading;

                await _lock.WaitAsync();
                try
                {
                    if (!_unloading.TryGetValue(id, out unloading))
                    {
                        if (_loaded.TryGetValue(id, out Loaded? loaded))
                        {
                            return Enter(loaded);
                        }

                        string? savedGame = await _store.ReadAsync(id);
                        return savedGame is null ? null : Enter(Load(id, StartingCity.FromSave(savedGame)));
                    }
                }
                finally
                {
                    _lock.Release();
                }

                // The city's last player has just left: once its save is kept, it loads from there
                await unloading;
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
                _unloading[city.Id] = unloaded.Task;
            }
            finally
            {
                _lock.Release();
            }

            await UnloadAsync(city);

            await _lock.WaitAsync();
            try
            {
                _unloading.Remove(city.Id);
            }
            finally
            {
                _lock.Release();
            }

            unloaded.SetResult();
        }

        // Nothing loads before a player enters a city
        Task IHostedService.StartAsync(CancellationToken cancellationToken)
        {
            return Task.CompletedTask;
        }

        /// <summary>
        /// Saves and unloads every city still loaded as the server stops, and waits for those already saving. The
        /// connections close before the server's services stop, so this finds a city loaded only where a player's
        /// leaving didn't unload it.
        /// </summary>
        async Task IHostedService.StopAsync(CancellationToken cancellationToken)
        {
            List<LoadedCity> loaded;
            List<Task> unloading;

            await _lock.WaitAsync(cancellationToken);
            try
            {
                loaded = _loaded.Values.Select(entry => entry.City).ToList();
                unloading = _unloading.Values.ToList();
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

            await Task.WhenAll(unloading);
        }

        private Loaded Load(string id, StartingCity start)
        {
            Loaded loaded = new Loaded(new LoadedCity(id, start, _clock, Failed));
            _loaded[id] = loaded;
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
                string savedGame = await city.RunAsync(host => host.Save());
                await _store.WriteAsync(city.Id, savedGame);
                await city.StopAsync();
            }
            catch (CityStoppedException)
            {
                // The store keeps the city as it was last saved
            }
            catch (CityStoreException exception)
            {
                _logger.LogError(exception, "City {City} couldn't be saved, and stays loaded", city.Id);

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
