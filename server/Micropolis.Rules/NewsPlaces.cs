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

namespace Micropolis.Rules
{
    /// <summary>
    /// The places the monster TV shows, as the payload of the event that reports a piece of news carries them:
    /// <c>ShowablePlace</c> and <c>TrackablePlace</c> in <c>src/protocol.ts</c>.
    /// </summary>
    internal static class NewsPlaces
    {
        /// <summary>
        /// A place the monster TV shows.
        /// </summary>
        public static NewsPlace Showable(long x, long y)
        {
            return new NewsPlace(x, y, Showable: true);
        }

        /// <summary>
        /// A place the monster TV shows, following the sprite of the type there as it moves.
        /// </summary>
        public static NewsPlace Trackable(long x, long y, SpriteType sprite)
        {
            return new NewsPlace(x, y, Trackable: true, Sprite: (int)sprite);
        }
    }
}
