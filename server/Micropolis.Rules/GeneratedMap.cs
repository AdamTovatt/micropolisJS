/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 * Modified in Adam Tovatt's continuation of micropolisJS. Copyright (C) 2026 Adam Tovatt
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
    /// The land <see cref="MapGenerator"/> lays, as its first draws decide: an island, a naked island that rivers run
    /// across, or plain land, laid at once or after a draw for an island that came to nothing.
    /// </summary>
    public enum MapLand
    {
        Island,
        NakedIsland,
        Land,
        LandAfterIslandDraw,
    }

    /// <summary>
    /// A map <see cref="MapGenerator.Lay"/> generated, with the land it laid and the number of lakes it drew, which is
    /// 0 for an island, since an island has none drawn.
    /// </summary>
    public sealed record GeneratedMap(GameMap Map, MapLand Land, int Lakes);
}
