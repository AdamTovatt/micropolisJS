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
    /// JavaScript's arithmetic on the city's integers, where it differs from C#'s: the one home of each rule the port
    /// needs, so every unit computes as the TypeScript reference does.
    /// </summary>
    public static class JsMath
    {
        /// <summary>
        /// <c>Math.floor(a / b)</c> for integers: rounds toward −∞, where C#'s division truncates toward zero.
        /// </summary>
        public static long FloorDiv(long a, long b)
        {
            long quotient = a / b;
            return (a % b != 0) && ((a < 0) != (b < 0)) ? quotient - 1 : quotient;
        }

        /// <inheritdoc cref="FloorDiv(long, long)"/>
        public static int FloorDiv(int a, int b)
        {
            return (int)FloorDiv((long)a, b);
        }

        /// <summary>
        /// <c>Math.fround</c>: the nearest single-precision value, as a C# <c>(float)</c> cast gives it, kept as the
        /// double it equals. The TypeScript wraps each operand and result of the original's float arithmetic in it, and
        /// the port wraps the same ones.
        /// </summary>
        public static double Fround(double value)
        {
            return (float)value;
        }
    }
}
