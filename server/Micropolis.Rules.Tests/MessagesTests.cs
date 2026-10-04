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
using System.Text.Json;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// <see cref="Messages"/> against <c>src/messages.ts</c>, through <c>conformance/messages.json</c>: each name the
    /// C# holds has the TypeScript's string, or list of strings.
    /// </summary>
    [TestClass]
    public sealed class MessagesTests
    {
        private static readonly IReadOnlyDictionary<string, JsonElement> TypeScript = ConformanceMessages.Load().Messages;

        public static IEnumerable<object[]> Strings => typeof(Messages).GetFields(BindingFlags.Public | BindingFlags.Static)
            .Where(constant => constant.IsLiteral)
            .Select(constant => new object[] { constant.Name, (string)constant.GetRawConstantValue()! });

        public static IEnumerable<object[]> Lists => typeof(Messages).GetFields(BindingFlags.Public | BindingFlags.Static)
            .Where(list => !list.IsLiteral)
            .Select(list => new object[] { list.Name, ((IReadOnlyList<string>)list.GetValue(null)!).ToArray() });

        [TestMethod]
        [DynamicData(nameof(Strings))]
        public void Message_ComparedWithTypeScript_HasTheSameString(string name, string value)
        {
            Assert.IsTrue(TypeScript.ContainsKey(name), $"src/messages.ts has no {name}.");
            Assert.AreEqual(TypeScript[name].GetString(), value);
        }

        // An event is known by its string alone: a listener, a front-end message's subject and a recorded event all
        // name it so, and two names sharing one string would be one event, as test/messages.ts checks the TypeScript's
        [TestMethod]
        public void Messages_EachName_HasAStringNoOtherNameShares()
        {
            List<string> shared = Strings.GroupBy(name => (string)name[1], name => (string)name[0])
                .Where(sharing => sharing.Count() > 1)
                .Select(sharing => $"{string.Join(" and ", sharing)} share \"{sharing.Key}\"")
                .ToList();

            Assert.IsNotEmpty(Strings);
            Assert.AreEqual("", string.Join("; ", shared));
        }

        [TestMethod]
        [DynamicData(nameof(Lists))]
        public void MessageList_ComparedWithTypeScript_HasTheSameStringsInOrder(string name, string[] values)
        {
            Assert.IsTrue(TypeScript.ContainsKey(name), $"src/messages.ts has no {name}.");
            CollectionAssert.AreEqual(TypeScript[name].EnumerateArray().Select(value => value.GetString()).ToArray(), values);
        }
    }
}
