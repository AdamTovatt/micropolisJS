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

using System.Collections.Concurrent;
using System.Text.Json.Nodes;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// Every query in <c>conformance/queries.json</c> answered in C#, and every save's records produced: each must be
    /// the TypeScript's, a rejection's reason word for word included.
    /// </summary>
    [TestClass]
    public sealed class ConformanceQueriesTests
    {
        // A city per save, which answering a query never changes, as Answers_EverySavesQueries_LeaveItsCityAsItWas checks
        private static readonly ConcurrentDictionary<string, Lazy<Simulation>> Cities = new ConcurrentDictionary<string, Lazy<Simulation>>();

        public static IEnumerable<object[]> Records => ConformanceQueries.Load().Records.Select(records => new object[] { records });

        public static IEnumerable<object[]> Answers => ConformanceQueries.Load().Answers.Select(answered => new object[] { answered });

        public static string DisplayName(System.Reflection.MethodInfo method, object[] data)
        {
            return data[0].ToString()!;
        }

        [TestMethod]
        [DynamicData(nameof(Records), DynamicDataDisplayName = nameof(DisplayName))]
        public void Records_SharedCity_AreTheTypeScriptRecords(CityRecords records)
        {
            Simulation city = records.Build();

            Assert.AreEqual(CanonicalJson.Write(records.Evaluation), Canonical(ProtocolJson.Serialize(city.EvaluationRecord())), "The evaluation record");
            Assert.AreEqual(CanonicalJson.Write(records.Budget), Canonical(ProtocolJson.Serialize(city.BudgetRecord())), "The budget record");
            Assert.AreEqual(CanonicalJson.Write(records.Settings), Canonical(ProtocolJson.Serialize(city.SettingsRecord())), "The settings record");
        }

        [TestMethod]
        [DynamicData(nameof(Answers), DynamicDataDisplayName = nameof(DisplayName))]
        public void AnswerQuery_SharedQuery_GivesTheTypeScriptAnswer(AnsweredQuery answered)
        {
            QueryAnswer answer = answered.Save is null
                ? Queries.AnswerWithoutCity(answered.Query?.DeepClone())
                : City(answered.Save).AnswerQuery(answered.Query?.DeepClone());

            Assert.AreEqual(CanonicalJson.Write(answered.Answer), Written(answer));
        }

        [TestMethod]
        public void Answers_EverySavesQueries_LeaveItsCityAsItWas()
        {
            foreach (IGrouping<string?, AnsweredQuery> save in ConformanceQueries.Load().Answers.Where(answered => answered.Save is not null).GroupBy(answered => answered.Save))
            {
                Simulation city = FixtureCities.City(save.Key!);
                string before = StateHash.HashSavedState(city.Save());

                foreach (AnsweredQuery answered in save)
                {
                    city.AnswerQuery(answered.Query?.DeepClone());
                }

                Assert.AreEqual(before, StateHash.HashSavedState(city.Save()), save.Key);
            }
        }

        [TestMethod]
        public void ZoneCategory_EveryTileValue_IsTheTypeScriptCategory()
        {
            IReadOnlyList<string> categories = ConformanceQueries.Load().Categories;

            Assert.HasCount(TileValues.TILE_COUNT, categories);
            for (int value = 0; value < categories.Count; value++)
            {
                Assert.AreEqual(categories[value], Queries.ZoneCategory(value), $"Tile value {value}");
            }

            CollectionAssert.AreEquivalent(Queries.ZoneCategories.ToList(), categories.Distinct().ToList());
        }

        // A map preview's answer is the map the seed generates, which maps.json lists
        [TestMethod]
        public void AnswerQuery_MapPreview_IsTheListedMap()
        {
            foreach (ListedMap listed in ConformanceMaps.Load().Maps)
            {
                JsonObject query = new JsonObject { ["type"] = "mapPreview", ["seed"] = listed.Seed };

                foreach (QueryAnswer answer in new[] { Queries.AnswerWithoutCity(query), City("town.built").AnswerQuery(query) })
                {
                    MapPreviewAnswer preview = (MapPreviewAnswer)answer;
                    Assert.AreEqual(listed.Seed, preview.Seed);
                    Assert.AreEqual(listed.Map.Width, preview.Width);
                    Assert.AreEqual(listed.Map.Height, preview.Height);
                    CollectionAssert.AreEqual(listed.Map.Tiles, preview.Tiles.ToArray(), $"{listed}");
                }
            }
        }

        [TestMethod]
        public void Load_SharedFile_CoversEveryAnswerType()
        {
            HashSet<string> types = ConformanceQueries.Load().Answers.Select(answered => (string)answered.Answer["type"]!).ToHashSet();

            // A map preview's is checked against maps.json above
            Assert.IsTrue(types.SetEquals(["overlay", "tileReport", "budgetForecast", "rejected"]), string.Join(", ", types.Order()));
        }

        [TestMethod]
        [DataRow("no categories", "{\"categories\":[],\"records\":[],\"answers\":[]}", "categories is empty")]
        [DataRow("no records", "{\"categories\":[\"CLEAR\"],\"records\":[],\"answers\":[]}", "records is empty")]
        [DataRow("no answers",
                 "{\"categories\":[\"CLEAR\"],\"records\":[{\"city\":\"s\",\"commands\":[],\"evaluation\":{},\"budget\":{},\"settings\":{}}],\"answers\":[]}",
                 "answers is empty")]
        [DataRow("an answer without its query", "{\"categories\":[\"CLEAR\"],\"records\":[],\"answers\":[{\"save\":null,\"answer\":{}}]}", "lacks query")]
        [DataRow("records with an unknown member",
                 "{\"categories\":[\"CLEAR\"],\"records\":[{\"city\":\"s\",\"commands\":[],\"evaluation\":{},\"budget\":{},\"settings\":{},\"sprites\":{}}],\"answers\":[]}",
                 "unknown member sprites")]
        [DataRow("a new city without its level",
                 "{\"categories\":[\"CLEAR\"],\"records\":[{\"city\":{\"seed\":7},\"commands\":[],\"evaluation\":{},\"budget\":{},\"settings\":{}}],\"answers\":[]}",
                 "lacks level")]
        public void Parse_BrokenFile_Throws(string description, string json, string message)
        {
            ConformanceAssert.Broken(() => ConformanceQueries.Parse(json), description, message);
        }

        private static Simulation City(string save)
        {
            return Cities.GetOrAdd(save, name => new Lazy<Simulation>(() => FixtureCities.City(name))).Value;
        }

        private static string Canonical(string json)
        {
            return CanonicalJson.Write(JsonNode.Parse(json));
        }

        // The answer as the server writes it: the value of the answer message that carries it
        private static string Written(QueryAnswer answer)
        {
            return CanonicalJson.Write(JsonNode.Parse(ProtocolJson.Serialize(new AnswerMessage(0, ProtocolJson.ToNode(answer))))!["value"]);
        }
    }
}
