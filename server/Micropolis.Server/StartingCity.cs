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
    /// A city as it starts to be hosted: its name, the simulation, and where its command log starts.
    /// </summary>
    internal sealed record StartingCity(string Name, Simulation City, LogStart LogStart)
    {
        /// <summary>
        /// A new city on the map the seed generates, at the level, whose log starts from the seed and level.
        /// </summary>
        public static StartingCity New(string name, uint seed, Level level)
        {
            return new StartingCity(name, Simulation.NewCity(seed, level, Speed.Medium), new SeedStart(seed, level));
        }

        /// <summary>
        /// The city a saved game's text holds, whose log starts from it as loaded: one a player uploads, or one the
        /// store keeps.
        /// </summary>
        /// <exception cref="SaveFormatException">The text is no saved game the rules load.</exception>
        public static StartingCity FromSave(string savedGame)
        {
            Simulation city = SavedGame.Load(savedGame, out string name);
            return new StartingCity(name, city, SaveStart.Of(city));
        }
    }
}
