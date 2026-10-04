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

namespace Micropolis.Server
{
    /// <summary>
    /// The server's cities at rest: a directory holding each city's saved game, as the game saves one, in a file named
    /// by the city's id. Nothing removes a city from it: what a player may keep on the server is bounded only by
    /// accounts, which players don't have.
    /// </summary>
    internal sealed class CityStore
    {
        /// <param name="directory">Made when the first city is kept, if it doesn't exist.</param>
        public CityStore(string directory)
        {
            Location = directory;
        }

        /// <summary>
        /// The directory the cities are kept in.
        /// </summary>
        public string Location { get; }

        /// <summary>
        /// The city's saved game, or null when the store holds no city with that id.
        /// </summary>
        /// <exception cref="CityStoreException">The store couldn't be read.</exception>
        public async Task<string?> ReadAsync(string city)
        {
            string path = PathOf(city);

            try
            {
                return await File.ReadAllTextAsync(path);
            }
            catch (Exception exception) when (exception is FileNotFoundException or DirectoryNotFoundException)
            {
                return null;
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                throw new CityStoreException($"The store couldn't read the city {city}.", exception);
            }
        }

        /// <summary>
        /// Keeps the city's saved game, in place of any before it. The file is written whole before it replaces the
        /// last, so a write cut short leaves the last save.
        /// </summary>
        /// <exception cref="CityStoreException">The store couldn't be written.</exception>
        public async Task WriteAsync(string city, string savedGame)
        {
            string path = PathOf(city);
            string written = path + ".writing";

            try
            {
                Directory.CreateDirectory(Location);
                await File.WriteAllTextAsync(written, savedGame);
                File.Move(written, path, overwrite: true);
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                throw new CityStoreException($"The store couldn't keep the city {city}.", exception);
            }
        }

        // A city's id is checked before it names a file, so no id reaches outside the directory
        private string PathOf(string city)
        {
            if (!CityId.IsOne(city))
            {
                throw new ArgumentException($"\"{city}\" is not a city's id.", nameof(city));
            }

            return Path.Combine(Location, city + ".json");
        }
    }
}
