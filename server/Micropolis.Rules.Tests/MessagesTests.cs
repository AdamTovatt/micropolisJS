/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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
    /// <see cref="Messages"/> against <c>conformance/messages.json</c>, which <c>test/vocabulary.ts</c> holds the
    /// client's <c>src/messages.ts</c> to: the same names, each with the same string, or list of strings.
    /// </summary>
    [TestClass]
    public sealed class MessagesTests
    {
        private static readonly IReadOnlyDictionary<string, JsonElement> Defined = ConformanceMessages.Load().Messages;

        public static IEnumerable<object[]> Strings => typeof(Messages).GetFields(BindingFlags.Public | BindingFlags.Static)
            .Where(constant => constant.IsLiteral)
            .Select(constant => new object[] { constant.Name, (string)constant.GetRawConstantValue()! });

        public static IEnumerable<object[]> Lists => typeof(Messages).GetFields(BindingFlags.Public | BindingFlags.Static)
            .Where(list => !list.IsLiteral)
            .Select(list => new object[] { list.Name, ((IReadOnlyList<string>)list.GetValue(null)!).ToArray() });

        [TestMethod]
        [DynamicData(nameof(Strings))]
        public void Message_ComparedWithTheMessagesFile_HasTheSameString(string name, string value)
        {
            Assert.IsTrue(Defined.ContainsKey(name), $"conformance/messages.json has no {name}.");
            Assert.AreEqual(Defined[name].GetString(), value);
        }

        // A name the file holds that the rules lack is one the client knows and no city sends
        [TestMethod]
        public void MessagesFile_EachName_IsOneTheRulesHold()
        {
            CollectionAssert.AreEquivalent(Defined.Keys.ToList(), Strings.Concat(Lists).Select(name => (string)name[0]).ToList());
        }

        // An event is known by its string alone: a listener and a front-end message's subject both name it so, and two
        // names sharing one string would be one event, as test/messages.ts checks the client's
        [TestMethod]
        public void Messages_EachName_HasAStringNoOtherNameShares()
        {
            Assert.IsNotEmpty(Strings);
            Assert.AreEqual("", Shared(Strings.Select(name => ((string)name[0], (string)name[1]))));
        }

        // The check can fail
        [TestMethod]
        public void Shared_TwoNamesWithOneString_NamesBoth()
        {
            Assert.AreEqual("FIRE and BLAZE share \"fire\"", Shared([("FIRE", "fire"), ("FLOOD", "flood"), ("BLAZE", "fire")]));
        }

        // Each string that more than one name has, with the names that share it
        private static string Shared(IEnumerable<(string Name, string Value)> names)
        {
            return string.Join("; ", names.GroupBy(name => name.Value, name => name.Name)
                .Where(sharing => sharing.Count() > 1)
                .Select(sharing => $"{string.Join(" and ", sharing)} share \"{sharing.Key}\""));
        }

        [TestMethod]
        [DynamicData(nameof(Lists))]
        public void MessageList_ComparedWithTheMessagesFile_HasTheSameStringsInOrder(string name, string[] values)
        {
            Assert.IsTrue(Defined.ContainsKey(name), $"conformance/messages.json has no {name}.");
            CollectionAssert.AreEqual(Defined[name].EnumerateArray().Select(value => value.GetString()).ToArray(), values);
        }
    }
}
