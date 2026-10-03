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

using System.Text.Json.Nodes;

namespace Micropolis.Rules
{
    /// <summary>
    /// Where a piece of news happened, in map tiles, as the payload of the event that reports it carries it:
    /// <c>ShowablePlace</c> and <c>TrackablePlace</c> in <c>src/protocol.ts</c>.
    /// </summary>
    internal static class NewsPlaces
    {
        /// <summary>
        /// A place the monster TV shows.
        /// </summary>
        public static JsonObject Showable(long x, long y)
        {
            return new JsonObject { ["showable"] = true, ["x"] = x, ["y"] = y };
        }

        /// <summary>
        /// A place the monster TV shows, following the sprite of the type there as it moves.
        /// </summary>
        public static JsonObject Trackable(long x, long y, SpriteType sprite)
        {
            return new JsonObject { ["trackable"] = true, ["x"] = x, ["y"] = y, ["sprite"] = (int)sprite };
        }
    }
}
