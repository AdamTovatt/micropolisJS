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
    /// Stand-ins for the disaster triggers a triggerDisaster command calls, ported by #27 (sprites and disasters),
    /// until that lane merges: each throws <see cref="NotPortedException"/>, naming the function.
    /// </summary>
    /// <remarks>
    /// Each is an extension method, so the owning lane's instance method of the same name takes its place without a
    /// change at the call, and a test fails while a stand-in has such a method beside it: each is deleted as its lane
    /// merges. No test pins which stand-in a disaster kind reaches, since it would pin the throwing stand-ins
    /// themselves.
    /// </remarks>
    internal static class PortStandIns
    {
        public static void MakeFire(this DisasterManager disasterManager)
        {
            throw new NotPortedException("disasterManager.makeFire");
        }

        public static void MakeFlood(this DisasterManager disasterManager)
        {
            throw new NotPortedException("disasterManager.makeFlood");
        }

        public static void MakeCrash(this DisasterManager disasterManager)
        {
            throw new NotPortedException("disasterManager.makeCrash");
        }

        public static void MakeMeltdown(this DisasterManager disasterManager)
        {
            throw new NotPortedException("disasterManager.makeMeltdown");
        }

        public static void MakeMonster(this SpriteManager spriteManager)
        {
            throw new NotPortedException("spriteManager.makeMonster");
        }

        public static void MakeTornado(this SpriteManager spriteManager)
        {
            throw new NotPortedException("spriteManager.makeTornado");
        }
    }
}
