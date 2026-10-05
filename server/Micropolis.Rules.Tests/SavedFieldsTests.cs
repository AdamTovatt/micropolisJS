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
using System.Text.Json.Nodes;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// Every field a stateful component holds is saved, under its own name in camel case in one of the component's
    /// groups of the save, or listed with the reason it isn't: a field the simulation adds is either saved or
    /// explained. A field is a declared one or a property's backing field, named by its property. A field holding a
    /// component saved under a key of its own is listed as saved apart, and that component has a case of its own.
    /// </summary>
    [TestClass]
    public sealed class SavedFieldsTests
    {
        private const string Reference = "a reference to the map, the stream or another component";
        private const string Listeners = "its event listeners, which the simulation attaches as it builds the city";
        private const string BlockMapShape = "given by the BlockMaps constructor for the map's key and the game map's size";

        private static readonly Simulation City = FixtureCities.City("town", "run");

        private static readonly JsonObject Save = City.Save();

        private static readonly IReadOnlyList<SavedFieldsCase> AllCases =
        [
            new SavedFieldsCase("the simulation", City, ["simulation"],
                ["Map", "Evaluation", "Valves", "Budget", "Census", "PowerManager", "SpriteManager", "DisasterManager",
                 "Random", "BlockMaps"],
                new Dictionary<string, string>
                {
                    ["MapScanner"] = "holds only the tile handlers",
                    ["RepairManager"] = "holds only the tile handlers",
                    ["TrafficManager"] = "its route, and its router's buffers, start afresh at every trip",
                    ["Trips"] = "the trips offered for the client to draw as cars, which the rules never read",
                    ["_tools"] = "a tool holds staged edits only while a command applies, and clears them before the next",
                    ["_cityYearLast"] = "the date last sent to the UI, which a load resets",
                    ["_cityMonthLast"] = "the date last sent to the UI, which a load resets",
                    ["Events"] = Listeners,
                }),
            new SavedFieldsCase("the census", City.Census, ["census", "scannedState.census"], [], []),
            new SavedFieldsCase("the budget", City.Budget, ["budget"], [], new Dictionary<string, string> { ["Events"] = Listeners }),
            new SavedFieldsCase("the valves", City.Valves, ["valves"], [], new Dictionary<string, string> { ["Events"] = Listeners }),
            new SavedFieldsCase("the evaluation", City.Evaluation, ["evaluation"], [],
                new Dictionary<string, string> { ["Events"] = Listeners }),
            new SavedFieldsCase("the disaster manager", City.DisasterManager, ["disasters"], [], new Dictionary<string, string>
            {
                ["_map"] = Reference, ["_spriteManager"] = Reference, ["_random"] = Reference, ["Events"] = Listeners,
            }),
            new SavedFieldsCase("the power manager", City.PowerManager, ["scannedState.power"], ["PowerGridMap"],
                new Dictionary<string, string> { ["_map"] = Reference, ["Events"] = Listeners }),
            new SavedFieldsCase("the sprite manager", City.SpriteManager, ["sprites"], [], new Dictionary<string, string>
            {
                ["_spriteList"] = "saved as list, each sprite as its entry", ["Map"] = Reference, ["Random"] = Reference,
                ["Events"] = Listeners,
                ["Router"] = "scratch for the ships' route searches, whose results never depend on what an earlier search left",
            }),
            new SavedFieldsCase("the map", City.Map, ["map"], [], new Dictionary<string, string>
            {
                ["_data"] = "saved as tiles, each tile as its raw value", ["Bounds"] = "derived from the width and height",
            }),
            new SavedFieldsCase("the block maps", City.BlockMaps, ["scannedState.blockMaps"], [], new Dictionary<string, string>
            {
                ["_saved"] = "the maps of its properties, each with the key it is saved under",
            }),
            // Its entries are saved as the list under its key, and the rest is fixed by the map it belongs to. With no
            // group to look a name up in, the case catches only a field added to the type.
            new SavedFieldsCase("a block map", City.BlockMaps.LandValueMap, [], [], new Dictionary<string, string>
            {
                ["_data"] = "saved as the list under the map's key",
                ["BlockSize"] = BlockMapShape, ["Min"] = BlockMapShape, ["Max"] = BlockMapShape,
                ["Width"] = BlockMapShape, ["Height"] = BlockMapShape,
            }),
            // Saved as the list randomState, so like a block map's, the case catches only a field added to the type
            new SavedFieldsCase("the random stream", City.Random, [], [], new Dictionary<string, string>
            {
                ["_s0"] = "saved as randomState's first word", ["_s1"] = "saved as randomState's second word",
                ["_s2"] = "saved as randomState's third word", ["_s3"] = "saved as randomState's fourth word",
            }),
        ];

        public static IEnumerable<object[]> Cases => AllCases.Select(testCase => new object[] { testCase });

        public static string DisplayName(MethodInfo method, object[] data)
        {
            return ((SavedFieldsCase)data[0]).Name;
        }

        [TestMethod]
        [DynamicData(nameof(Cases), DynamicDataDisplayName = nameof(DisplayName))]
        public void Fields_StatefulComponent_AreSavedOrListedWithWhyNot(SavedFieldsCase testCase)
        {
            List<JsonObject> groups = testCase.Groups.Select(Group).ToList();
            List<string> members = Members(testCase.Component.GetType()).ToList();
            List<string> listed = testCase.SavedApart.Concat(testCase.NotSaved.Keys).ToList();

            Assert.AreEqual("", string.Join(", ", members.Where(member => !IsSaved(member, groups) && !listed.Contains(member))),
                            $"Fields of {testCase.Name} neither saved nor explained.");
            Assert.AreEqual("", string.Join(", ", listed.Where(member => !members.Contains(member) || IsSaved(member, groups))),
                            $"Fields of {testCase.Name} explained but saved, or no longer held.");
        }

        // Each sprite's fields are saved in its entry of the sprite list
        [TestMethod]
        public void Fields_Sprite_AreSavedInItsEntry()
        {
            JsonArray list = Group("sprites")["list"]!.AsArray();
            Assert.IsNotEmpty(list, "The town's run ends with no sprite to check.");
            JsonObject entry = list[0]!.AsObject();

            Assert.AreEqual("", string.Join(", ", Members(typeof(Sprite)).Where(member => !IsSaved(member, [entry]))));
        }

        // A ship's mission's fields are saved in the object of its entry's mission, which the run save, holding no ship,
        // has none of
        [TestMethod]
        public void Fields_ShipMission_AreSavedInItsObject()
        {
            Assert.AreEqual("", string.Join(", ", Members(typeof(ShipMission)).Where(member => !IsSaved(member, [new ShipMission().Save()]))));
        }

        // A plane's and a helicopter's flights' fields are saved in the object of its entry's flight
        [TestMethod]
        public void Fields_PlaneFlight_AreSavedInItsObject()
        {
            Assert.AreEqual("", string.Join(", ", Members(typeof(PlaneFlight)).Where(member => !IsSaved(member, [PlaneFlight.Departing.Save()]))));
        }

        [TestMethod]
        public void Fields_CopterFlight_AreSavedInItsObject()
        {
            Assert.AreEqual("", string.Join(", ", Members(typeof(CopterFlight)).Where(member => !IsSaved(member, [CopterFlight.Returning.Save()]))));
        }

        // A member listed as saved apart is excused only because a case of its own checks its fields
        [TestMethod]
        public void Cases_MemberSavedApart_HasACaseOfItsOwn()
        {
            Assert.AreEqual("", string.Join(", ", SavedApartWithoutACase(AllCases)), "Components with no case of their own.");
        }

        // A component whose case is missing fails the check
        [TestMethod]
        public void SavedApartWithoutACase_CaseRemoved_FindsIt()
        {
            List<SavedFieldsCase> cases = AllCases.Where(testCase => testCase.Name != "the map").ToList();

            CollectionAssert.AreEqual(new[] { "the simulation's Map" }, SavedApartWithoutACase(cases).ToList());
        }

        // A field added to a component and left out of its save fails the check
        [TestMethod]
        public void Members_ComponentWithAnUnsavedField_FindsIt()
        {
            List<string> unsaved = Members(typeof(UnsavedComponent)).Where(member => !IsSaved(member, [new JsonObject { ["kept"] = 1 }])).ToList();

            CollectionAssert.AreEqual(new[] { "Dropped", "_lost" }, unsaved);
        }

        // Each member a case lists as saved apart whose type no case checks, named with the case that lists it. A member
        // a case explains, such as one holding the tile handlers, needs no case: its reason covers what it holds.
        private static IEnumerable<string> SavedApartWithoutACase(IReadOnlyList<SavedFieldsCase> cases)
        {
            HashSet<Type> checkedTypes = cases.Select(testCase => testCase.Component.GetType()).ToHashSet();

            return cases.SelectMany(testCase => Fields(testCase.Component.GetType())
                .Where(field => testCase.SavedApart.Contains(field.Name))
                .Select(field => (field.Name, Value: field.Field.GetValue(testCase.Component)))
                .Where(field => field.Value is null || !checkedTypes.Contains(field.Value.GetType()))
                .Select(field => $"{testCase.Name}'s {field.Name}{(field.Value is null ? " (null)" : "")}"));
        }

        private static IEnumerable<string> Members(Type type)
        {
            return Fields(type).Select(field => field.Name);
        }

        // The fields of a type that hold state: its declared instance fields, a property's backing field named by its
        // property
        private static IEnumerable<(string Name, FieldInfo Field)> Fields(Type type)
        {
            return type.GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly)
                .Select(field => (Name: field.Name.StartsWith('<') ? field.Name[1..field.Name.IndexOf('>')] : field.Name, Field: field))
                .OrderBy(field => field.Name, StringComparer.Ordinal);
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

        /// <summary>
        /// One component's check: the groups of the save its fields are saved in, by their paths; its members holding a
        /// component saved under a key of its own, which a case of its own checks; and the rest it doesn't save, each
        /// with the reason why not.
        /// </summary>
        public sealed record SavedFieldsCase(string Name, object Component, IReadOnlyList<string> Groups,
                                             IReadOnlyList<string> SavedApart, Dictionary<string, string> NotSaved);

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
