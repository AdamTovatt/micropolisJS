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
using System.Text.Json.Nodes;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// Every field a stateful component holds is saved, under its own name in camel case in one of the component's
    /// groups of the save, or listed with the reason it isn't, as <c>test/savedFields.ts</c> checks the TypeScript: a
    /// field the simulation adds is either saved or explained. A field is a declared one or a property's backing field,
    /// named by its property.
    /// </summary>
    [TestClass]
    public sealed class SavedFieldsTests
    {
        private const string Component = "a component saved under its own key";
        private const string Reference = "a reference to the map, the stream or another component";
        private const string Listeners = "its event listeners, which the simulation attaches as it builds the city";

        private static readonly Simulation City = FixtureCities.City("town", "run");

        private static readonly JsonObject Save = City.Save();

        public static IEnumerable<object[]> Cases =>
        [
            ["the simulation", City, new[] { "simulation" }, new Dictionary<string, string>
            {
                ["Map"] = Component, ["Evaluation"] = Component, ["Valves"] = Component, ["Budget"] = Component,
                ["Census"] = Component, ["PowerManager"] = Component, ["SpriteManager"] = Component,
                ["DisasterManager"] = Component,
                ["Random"] = "saved as randomState",
                ["BlockMaps"] = "saved under scannedState.blockMaps, but for the temporary maps, which each scan writes in full",
                ["MapScanner"] = "holds only the tile handlers",
                ["RepairManager"] = "holds only the tile handlers",
                ["TrafficManager"] = "its route stack is cleared at the start of every use",
                ["_tools"] = "a tool holds staged edits only while a command applies, and clears them before the next",
                ["_cityYearLast"] = "the date last sent to the UI, which a load resets",
                ["_cityMonthLast"] = "the date last sent to the UI, which a load resets",
                ["Events"] = Listeners,
            }],
            ["the census", City.Census, new[] { "census", "scannedState.census" }, new Dictionary<string, string>()],
            ["the budget", City.Budget, new[] { "budget" }, new Dictionary<string, string> { ["Events"] = Listeners }],
            ["the valves", City.Valves, new[] { "valves" }, new Dictionary<string, string> { ["Events"] = Listeners }],
            ["the evaluation", City.Evaluation, new[] { "evaluation" }, new Dictionary<string, string> { ["Events"] = Listeners }],
            ["the disaster manager", City.DisasterManager, new[] { "disasters" }, new Dictionary<string, string>
            {
                ["_map"] = Reference, ["_spriteManager"] = Reference, ["_random"] = Reference, ["Events"] = Listeners,
            }],
            ["the power manager", City.PowerManager, new[] { "scannedState.power" }, new Dictionary<string, string>
            {
                ["_map"] = Reference, ["PowerGridMap"] = "saved as powerGrid", ["Events"] = Listeners,
            }],
            ["the sprite manager", City.SpriteManager, new[] { "sprites" }, new Dictionary<string, string>
            {
                ["_spriteList"] = "saved as list, each sprite as its entry", ["Map"] = Reference, ["Random"] = Reference,
                ["Events"] = Listeners,
            }],
        ];

        public static string DisplayName(MethodInfo method, object[] data)
        {
            return (string)data[0];
        }

        [TestMethod]
        [DynamicData(nameof(Cases), DynamicDataDisplayName = nameof(DisplayName))]
        public void Fields_StatefulComponent_AreSavedOrListedWithWhyNot(string name, object component, string[] groupPaths,
                                                                       Dictionary<string, string> notSaved)
        {
            List<JsonObject> groups = groupPaths.Select(Group).ToList();
            List<string> members = Members(component.GetType()).ToList();

            Assert.AreEqual("", string.Join(", ", members.Where(member => !IsSaved(member, groups) && !notSaved.ContainsKey(member))),
                            $"Fields of {name} neither saved nor explained.");
            Assert.AreEqual("", string.Join(", ", notSaved.Keys.Where(member => !members.Contains(member) || IsSaved(member, groups))),
                            $"Fields of {name} explained but saved, or no longer held.");
        }

        // Each sprite's fields are saved in its entry of the sprite list, as test/spriteManager.ts checks them
        [TestMethod]
        public void Fields_Sprite_AreSavedInItsEntry()
        {
            JsonArray list = Group("sprites")["list"]!.AsArray();
            Assert.IsNotEmpty(list, "The town's run ends with no sprite to check.");
            JsonObject entry = list[0]!.AsObject();

            Assert.AreEqual("", string.Join(", ", Members(typeof(Sprite)).Where(member => !IsSaved(member, [entry]))));
        }

        // A field added to a component and left out of its save fails the check
        [TestMethod]
        public void Members_ComponentWithAnUnsavedField_FindsIt()
        {
            List<string> unsaved = Members(typeof(UnsavedComponent)).Where(member => !IsSaved(member, [new JsonObject { ["kept"] = 1 }])).ToList();

            CollectionAssert.AreEqual(new[] { "Dropped", "_lost" }, unsaved);
        }

        // The members of a type that hold state: its declared instance fields, a property's backing field named by its
        // property
        private static IEnumerable<string> Members(Type type)
        {
            return type.GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly)
                .Select(field => field.Name.StartsWith('<') ? field.Name[1..field.Name.IndexOf('>')] : field.Name)
                .Order(StringComparer.Ordinal);
        }

        private static bool IsSaved(string member, IEnumerable<JsonObject> groups)
        {
            string name = member.TrimStart('_');
            string key = char.ToLowerInvariant(name[0]) + name[1..];
            return groups.Any(group => group.ContainsKey(key));
        }

        private static JsonObject Group(string path)
        {
            return path.Split('.').Aggregate(Save, (group, key) => group[key]!.AsObject());
        }

        private sealed class UnsavedComponent
        {
            private readonly int _lost = 0;

            public int Kept { get; set; }

            public int Dropped { get; set; }

            public int Read()
            {
                return _lost;
            }
        }
    }
}
