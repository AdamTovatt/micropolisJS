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

using System.Reflection;
using System.Runtime.CompilerServices;

namespace Micropolis.Rules.Tests
{
    [TestClass]
    public sealed class PortStandInsTests
    {
        // An instance method of a stand-in's name takes its place at every call, leaving the stand-in dead, and any
        // test it held inconclusive running against the real method: the merge that brings the method deletes it
        [TestMethod]
        public void StandIns_ComparedWithTheTypesTheyExtend_HaveNoInstanceMethodOfTheirName()
        {
            List<string> replaced = typeof(PortStandIns).GetMethods(BindingFlags.Public | BindingFlags.Static)
                .Where(method => method.IsDefined(typeof(ExtensionAttribute), false))
                .Where(method => method.GetParameters()[0].ParameterType
                    .GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)
                    .Any(instanceMethod => instanceMethod.Name == method.Name))
                .Select(method => $"{method.GetParameters()[0].ParameterType.Name}.{method.Name}")
                .ToList();

            Assert.IsEmpty(replaced, $"Stand-ins the real methods replace: {string.Join(", ", replaced)}.");
        }
    }
}
