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

using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

// The state messages the city sends the client, as StateMessage in src/protocol.ts defines them, and the records among
// them, which the simulation produces for the windows to show. protocol/README.md describes them. The server only
// writes them, each field by field in the protocol's order, its type first.

namespace Micropolis.Rules
{
    /// <summary>
    /// What the city sends the client about itself, named by its <c>type</c> field, which comes first.
    /// </summary>
    public abstract record StateMessage
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public abstract string Type { get; }
    }

    /// <summary>
    /// The city's evaluation, as the evaluation window shows it: <c>EvaluationRecord</c> in <c>src/protocol.ts</c>.
    /// </summary>
    /// <param name="Approval">The share of the public, in percent, who think the mayor is doing a good job.</param>
    /// <param name="Problems">The ids of the worst problems, worst first, each one some of the public voted for.</param>
    /// <param name="CityClass">The city's class, one of <c>CITY_CLASSES</c>.</param>
    /// <param name="Level">The game's difficulty, by its number in <c>GAME_LEVELS</c>.</param>
    public sealed record EvaluationRecord(
        [property: JsonPropertyName("approval")] long Approval,
        [property: JsonPropertyName("problems")] IReadOnlyList<int> Problems,
        [property: JsonPropertyName("population")] long Population,
        [property: JsonPropertyName("migration")] long Migration,
        [property: JsonPropertyName("assessedValue")] long AssessedValue,
        [property: JsonPropertyName("cityClass")] string CityClass,
        [property: JsonPropertyName("level")] int Level,
        [property: JsonPropertyName("score")] long Score,
        [property: JsonPropertyName("scoreDelta")] long ScoreDelta,
        [property: JsonPropertyName("scoreBreakdown")] IReadOnlyList<ScoreEntry> ScoreBreakdown) : StateMessage
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "evaluation";
    }

    /// <summary>
    /// One step of the yearly score calculation: the points it moved the score by.
    /// </summary>
    /// <param name="Reason">The step, one of <c>SCORE_REASONS</c>.</param>
    public sealed record ScoreEntry(
        [property: JsonPropertyName("reason")] string Reason,
        [property: JsonPropertyName("points")] long Points);

    /// <summary>
    /// The budget, as the budget window shows it: <c>BudgetRecord</c> in <c>src/protocol.ts</c>.
    /// </summary>
    /// <param name="Funding">Each service's funding, 0 to 1 of what it needs, a single-precision float as the original
    /// keeps it, written as the double it widens to.</param>
    public sealed record BudgetRecord(
        [property: JsonPropertyName("taxRate")] long TaxRate,
        [property: JsonPropertyName("taxesCollected")] long TaxesCollected,
        [property: JsonPropertyName("funds")] long Funds,
        [property: JsonPropertyName("maintenance")] ServiceAmounts<long> Maintenance,
        [property: JsonPropertyName("funding")] ServiceAmounts<double> Funding) : StateMessage
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "budget";
    }

    /// <summary>
    /// The city's settings, as the settings window shows them: <c>SettingsRecord</c> in <c>src/protocol.ts</c>.
    /// </summary>
    /// <param name="Speed">The speed the city runs at, as <c>setSpeed</c> sets it, 0 when paused.</param>
    public sealed record SettingsRecord(
        [property: JsonPropertyName("autoBudget")] bool AutoBudget,
        [property: JsonPropertyName("disasters")] bool Disasters,
        [property: JsonPropertyName("speed")] int Speed) : StateMessage
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "settings";
    }

    /// <summary>
    /// The whole map: each tile's raw value, with its flags, row by row, top row first.
    /// </summary>
    public sealed record MapMessage(
        [property: JsonPropertyName("width")] int Width,
        [property: JsonPropertyName("height")] int Height,
        [property: JsonPropertyName("tiles")] IReadOnlyList<int> Tiles) : StateMessage
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "map";
    }

    /// <summary>
    /// A tile whose raw value changed, and its new value.
    /// </summary>
    public sealed record TileChange(
        [property: JsonPropertyName("x")] int X,
        [property: JsonPropertyName("y")] int Y,
        [property: JsonPropertyName("value")] int Value);

    /// <summary>
    /// The tiles that changed since the last map or tiles message.
    /// </summary>
    public sealed record TilesMessage(
        [property: JsonPropertyName("changes")] IReadOnlyList<TileChange> Changes) : StateMessage
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "tiles";
    }

    /// <summary>
    /// A tile whose walkway changed, and its walkway now, a kind for each of its ninths (<see cref="Walkways"/>).
    /// </summary>
    public sealed record WalkwayChange(
        [property: JsonPropertyName("x")] int X,
        [property: JsonPropertyName("y")] int Y,
        [property: JsonPropertyName("ninths")] int Ninths);

    /// <summary>
    /// The tiles whose walkway changed since the last walkways message: in the whole state, every tile that holds any.
    /// </summary>
    public sealed record WalkwaysMessage(
        [property: JsonPropertyName("changes")] IReadOnlyList<WalkwayChange> Changes) : StateMessage
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "walkways";
    }

    /// <summary>
    /// A sprite as the client draws it: its type, its row of the sprite sheet, and its frame, its column, both counted
    /// from 1; and the square it is drawn in, <paramref name="Width"/> map pixels a side with its top-left corner at map
    /// pixel (<paramref name="X"/>, <paramref name="Y"/>).
    /// </summary>
    public sealed record SpriteView(
        [property: JsonPropertyName("type")] int Type,
        [property: JsonPropertyName("frame")] long Frame,
        [property: JsonPropertyName("x")] long X,
        [property: JsonPropertyName("y")] long Y,
        [property: JsonPropertyName("width")] int Width);

    /// <summary>
    /// Every sprite on the map.
    /// </summary>
    public sealed record SpritesMessage(
        [property: JsonPropertyName("sprites")] IReadOnlyList<SpriteView> Sprites) : StateMessage
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "sprites";
    }

    /// <summary>
    /// The city's date: the month from 0, and the year.
    /// </summary>
    public sealed record DateMessage(
        [property: JsonPropertyName("month")] long Month,
        [property: JsonPropertyName("year")] long Year) : StateMessage
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "date";
    }

    /// <summary>
    /// The city's step clock (<see cref="Simulation.StepClock"/>): the steps it has taken while it wasn't paused, which
    /// the departures a ride is stamped with count on, so the client lines them up with its own clock.
    /// </summary>
    public sealed record ClockMessage(
        [property: JsonPropertyName("steps")] long Steps) : StateMessage
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "clock";
    }

    /// <summary>
    /// The city's population as the last monthly growth check counted it.
    /// </summary>
    public sealed record PopulationMessage(
        [property: JsonPropertyName("population")] long Population) : StateMessage
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "population";
    }

    /// <summary>
    /// The conditions that limit the city's growth, as the simulation publishes them each cycle: <c>StatusRecord</c>
    /// in <c>src/protocol.ts</c>.
    /// </summary>
    /// <param name="Conditions">The advisor conditions that hold, each named by its message.</param>
    public sealed record StatusRecord(
        [property: JsonPropertyName("powerCapacity")] long PowerCapacity,
        [property: JsonPropertyName("powerLoad")] long PowerLoad,
        [property: JsonPropertyName("residentialCapped")] bool ResidentialCapped,
        [property: JsonPropertyName("commercialCapped")] bool CommercialCapped,
        [property: JsonPropertyName("industrialCapped")] bool IndustrialCapped,
        [property: JsonPropertyName("conditions")] IReadOnlyList<string> Conditions) : StateMessage
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "status";
    }

    /// <summary>
    /// The demand for each kind of zone, as the demand valves last set it.
    /// </summary>
    public sealed record DemandMessage(
        [property: JsonPropertyName("residential")] long Residential,
        [property: JsonPropertyName("commercial")] long Commercial,
        [property: JsonPropertyName("industrial")] long Industrial) : StateMessage
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "demand";
    }

    /// <summary>
    /// Where a piece of news happened, in map tiles: a place, a place the monster TV shows, or one where it follows the
    /// sprite of the given type, a monster or a tornado, of which the map holds at most one each. A field the place
    /// doesn't have is left out.
    /// </summary>
    public sealed record NewsPlace(
        [property: JsonPropertyName("x")] long X,
        [property: JsonPropertyName("y")] long Y,
        [property: JsonPropertyName("showable"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? Showable = null,
        [property: JsonPropertyName("trackable"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? Trackable = null,
        [property: JsonPropertyName("sprite"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Sprite = null);

    /// <summary>
    /// News the simulation sends for the player: its subject, one of the messages in <c>src/messages.ts</c>, and where
    /// it happened, if it did somewhere.
    /// </summary>
    public sealed record NewsMessage(
        [property: JsonPropertyName("subject")] string Subject,
        [property: JsonPropertyName("data"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] NewsPlace? Data = null) : StateMessage
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "news";
    }

    /// <summary>
    /// What came of a command, any player's.
    /// </summary>
    public sealed record CommandResultMessage(
        [property: JsonPropertyName("result")] CommandResult Result) : StateMessage
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "commandResult";
    }

    /// <summary>
    /// The year end paid the budget with values the player should review. The city stepped on: nothing waits for it.
    /// </summary>
    public sealed record BudgetReviewDueMessage : StateMessage
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "budgetReviewDue";
    }

    /// <summary>
    /// A run of a route the traffic rule found by road, or a ride of it from station to station, as the <c>trips</c>
    /// message carries it, <c>[x, y, "NESW…"]</c>: the tile the run starts on, then a letter for each step to the next
    /// tile of it, to its last.
    /// </summary>
    [JsonConverter(typeof(TripConverter))]
    public sealed record Trip(int X, int Y, string Steps)
    {
        /// <summary>
        /// The letter of a step each way, in the order of <see cref="Direction.CardinalDirections"/>: north, up the map,
        /// east, south and west.
        /// </summary>
        public const string StepLetters = "NESW";
    }

    /// <summary>
    /// Writes a trip as <c>[x, y, "NESW…"]</c>, and reads one strictly: anything else, a step that isn't one of
    /// <see cref="Trip.StepLetters"/> among it, is an error.
    /// </summary>
    internal sealed class TripConverter : JsonConverter<Trip>
    {
        private const string Shape = "A trip is [x, y, steps]";

        public override Trip Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            Expect(reader.TokenType == JsonTokenType.StartArray, Shape);
            Trip trip = ReadPath(ref reader, Shape);
            Expect(reader.Read() && reader.TokenType == JsonTokenType.EndArray, Shape);

            return trip;
        }

        public override void Write(Utf8JsonWriter writer, Trip value, JsonSerializerOptions options)
        {
            writer.WriteStartArray();
            WritePath(writer, value);
            writer.WriteEndArray();
        }

        /// <summary>
        /// Reads the start and the steps of a trip, or of a ride, the first entries of its array, strictly: anything
        /// else is an error, which says the array is <paramref name="shape"/>.
        /// </summary>
        internal static Trip ReadPath(ref Utf8JsonReader reader, string shape)
        {
            int x = ReadWholeNumber(ref reader, shape);
            int y = ReadWholeNumber(ref reader, shape);
            Expect(reader.Read() && reader.TokenType == JsonTokenType.String, shape);
            string steps = reader.GetString()!;
            Expect(steps.All(step => Trip.StepLetters.Contains(step)), shape);

            return new Trip(x, y, steps);
        }

        /// <summary>
        /// Writes the start and the steps of a trip, or of a ride, the first entries of its array.
        /// </summary>
        internal static void WritePath(Utf8JsonWriter writer, Trip path)
        {
            writer.WriteNumberValue(path.X);
            writer.WriteNumberValue(path.Y);
            writer.WriteStringValue(path.Steps);
        }

        /// <summary>
        /// Fails, saying the array is <paramref name="shape"/>, unless what the reader read <paramref name="holds"/>.
        /// </summary>
        internal static void Expect(bool holds, string shape)
        {
            if (!holds)
            {
                throw new JsonException($"{shape}, the steps a string of the letters {Trip.StepLetters}.");
            }
        }

        private static int ReadWholeNumber(ref Utf8JsonReader reader, string shape)
        {
            Expect(reader.Read() && reader.TokenType == JsonTokenType.Number, shape);
            Expect(reader.TryGetInt32(out int value), shape);

            return value;
        }
    }

    /// <summary>
    /// A ride of a route the traffic rule found, from the station it gets on at to the one it gets off at, as the
    /// <c>trips</c> message carries it, <c>[x, y, "NESW…", departure]</c>: its path, as a trip's, from the station it
    /// gets on at, a letter for each step to the next tile of it, to the station it gets off at, and the step clock's
    /// value of the departure it boards (<see cref="Timetable"/>).
    /// </summary>
    [JsonConverter(typeof(RideConverter))]
    public sealed record Ride(Trip Path, long Departure);

    /// <summary>
    /// Writes a ride as <c>[x, y, "NESW…", departure]</c>, and reads one strictly: anything else, a step that isn't one
    /// of <see cref="Trip.StepLetters"/> among it or a departure that isn't a whole number from 0, is an error.
    /// </summary>
    internal sealed class RideConverter : JsonConverter<Ride>
    {
        private const string Shape = "A ride is [x, y, steps, departure], the departure a whole number from 0";

        public override Ride Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            TripConverter.Expect(reader.TokenType == JsonTokenType.StartArray, Shape);
            Trip path = TripConverter.ReadPath(ref reader, Shape);
            TripConverter.Expect(reader.Read() && reader.TokenType == JsonTokenType.Number, Shape);
            TripConverter.Expect(reader.TryGetInt64(out long departure) && departure >= 0, Shape);
            TripConverter.Expect(reader.Read() && reader.TokenType == JsonTokenType.EndArray, Shape);

            return new Ride(path, departure);
        }

        public override void Write(Utf8JsonWriter writer, Ride value, JsonSerializerOptions options)
        {
            writer.WriteStartArray();
            TripConverter.WritePath(writer, value.Path);
            writer.WriteNumberValue(value.Departure);
            writer.WriteEndArray();
        }
    }

    /// <summary>
    /// The trips <see cref="Trips"/> offered since the last messages: the runs of routes by road, in the order they were
    /// offered, and the rides, each from the station it gets on at to the one it gets off at, in the order they were
    /// offered.
    /// </summary>
    public sealed record TripsMessage(
        [property: JsonPropertyName("routes")] IReadOnlyList<Trip> Routes,
        [property: JsonPropertyName("rides")] IReadOnlyList<Ride> Rides) : StateMessage
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "trips";
    }

    /// <summary>
    /// The simulation recomputed the layer, so an overlay showing it is out of date.
    /// </summary>
    public sealed record OverlayUpdatedMessage(
        [property: JsonPropertyName("layer")] string Layer) : StateMessage
    {
        [JsonPropertyName("type")]
        [JsonPropertyOrder(-1)]
        public override string Type => "overlayUpdated";
    }
}
