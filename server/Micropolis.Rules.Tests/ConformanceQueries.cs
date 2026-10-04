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
using static Micropolis.Rules.Tests.ConformanceFile;
using static Micropolis.Rules.Tests.ConformanceJson;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// What the TypeScript reference answered to queries and the records it produced, from
    /// <c>conformance/queries.json</c>: the category of each tile value, each save's records, and each query with its
    /// answer, about a save of <c>conformance/saves/</c> or asked before any city has started.
    /// </summary>
    public sealed record ConformanceQueries(IReadOnlyList<string> Categories, IReadOnlyList<CityRecords> Records, IReadOnlyList<AnsweredQuery> Answers)
    {
        public static ConformanceQueries Load()
        {
            return Parse(Read("queries.json"));
        }

        /// <summary>
        /// The file, read as <c>JSON.parse</c> reads it, as the server reads a query, since a query is any JSON.
        /// </summary>
        public static ConformanceQueries Parse(string json)
        {
            JsonObject file = Members(JsonText.Parse(json), "the file", ["categories", "records", "answers"]);

            List<string> categories = List(file["categories"], "categories").Select(category => String(category, "a category")).ToList();
            List<CityRecords> records = List(file["records"], "records").Select(ReadRecords).ToList();
            List<AnsweredQuery> answers = List(file["answers"], "answers").Select(ReadAnswer).ToList();

            NonEmpty("categories", categories);
            NonEmpty("records", records);
            NonEmpty("answers", answers);

            return new ConformanceQueries(categories, records, answers);
        }

        private static CityRecords ReadRecords(JsonNode? node)
        {
            JsonObject records = Members(node, "a city's records", ["city", "commands", "evaluation", "budget", "settings"]);
            JsonNode? city = records["city"];

            if (city is not JsonObject)
            {
                String(city, "city");
            }
            else
            {
                Members(city, "a new city", ["seed", "level"]);
            }

            return new CityRecords(city!, List(records["commands"], "commands").ToList(), Object(records["evaluation"], "evaluation"),
                Object(records["budget"], "budget"), Object(records["settings"], "settings"));
        }

        private static AnsweredQuery ReadAnswer(JsonNode? node)
        {
            JsonObject answered = Members(node, "an answered query", ["save", "query", "answer"], ["funds"]);
            string? save = answered["save"] is null ? null : String(answered["save"], "save");
            long? funds = answered.ContainsKey("funds") ? WholeNumber(answered["funds"], "funds", 0, long.MaxValue) : null;
            return new AnsweredQuery(save, funds, answered["query"], Object(answered["answer"], "answer"));
        }
    }

    /// <summary>
    /// The records a city produces once the commands have applied to it: the city a save of <c>conformance/saves/</c>
    /// holds, by its name, or a new city on a seed's map at a level, as <c>{"seed", "level"}</c>.
    /// </summary>
    public sealed record CityRecords(JsonNode City, IReadOnlyList<JsonNode?> Commands, JsonObject Evaluation, JsonObject Budget, JsonObject Settings)
    {
        /// <summary>
        /// The city as the commands left it.
        /// </summary>
        public Simulation Build()
        {
            Simulation city = City is JsonObject start
                ? Simulation.NewCity((uint)(double)start["seed"]!, (Level)(int)(double)start["level"]!, Speed.Medium)
                : FixtureCities.City((string)City!);

            city.ApplyCommands(Commands.Select(command => new ReceivedCommand("conformance", command?.DeepClone())).ToList());
            return city;
        }

        public override string ToString()
        {
            return Commands.Count == 0 ? City.ToJsonString()
                : $"{City.ToJsonString()} after {string.Join(", ", Commands.Select(command => command?.ToJsonString() ?? "null"))}";
        }
    }

    /// <summary>
    /// A query and its answer, about the named save's city, or asked before any city has started when the save is null.
    /// </summary>
    public sealed record AnsweredQuery(string? Save, long? Funds, JsonNode? Query, JsonObject Answer)
    {
        /// <summary>
        /// The city the query is about, from the save, with its funds replaced where the answer names them.
        /// </summary>
        public Simulation City()
        {
            int dot = Save!.LastIndexOf('.');
            return FixtureCities.City(Save[..dot], Save[(dot + 1)..],
                Funds is long funds ? save => save["budget"]!["totalFunds"] = funds : null);
        }

        public override string ToString()
        {
            string city = Funds is null ? Save ?? "no city" : $"{Save} with {Funds} funds";
            return $"{city}: {(Query is null ? "null" : Query.ToJsonString())}";
        }
    }
}
