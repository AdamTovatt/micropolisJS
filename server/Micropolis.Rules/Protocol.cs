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
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

// The bodies of /api/session, the messages on the city's WebSocket, /ws/city, and the commands a player sends the
// simulation. src/protocol.ts defines the same by hand, and the examples under protocol/examples/ pin the two together:
// each side's tests read every example of what that side reads or writes and write it back to the same bytes.
// protocol/README.md describes the wire format. The protocol lives with the game rules rather than in the host, so a
// test or a tool reads it without one, and command messages can carry the rules' own types.

namespace Micropolis.Rules
{
    /// <summary>
    /// A player as the others see them. A value type, so a list of players can hold no null.
    /// </summary>
    public readonly record struct PlayerInfo
    {
        // A struct also has a parameterless constructor, which System.Text.Json would otherwise use, filling no
        // field it was not given
        [JsonConstructor]
        public PlayerInfo(string id, string name)
        {
            Id = id;
            Name = name;
        }

        /// <summary>
        /// The player id: the subject of the player's token.
        /// </summary>
        [JsonPropertyName("id")]
        public string Id { get; }

        /// <summary>
        /// The display name the player signed in with. Two players may share one.
        /// </summary>
        [JsonPropertyName("name")]
        public string Name { get; }
    }

    /// <summary>
    /// A message the server sends, discriminated by its <c>type</c> field.
    /// </summary>
    [JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
    [JsonDerivedType(typeof(HelloMessage), "hello")]
    [JsonDerivedType(typeof(PlayersMessage), "players")]
    [JsonDerivedType(typeof(CursorMessage), "cursor")]
    [JsonDerivedType(typeof(StateBatchMessage), "state")]
    [JsonDerivedType(typeof(AnswerMessage), "answer")]
    [JsonDerivedType(typeof(FailedMessage), "failed")]
    public abstract record ServerMessage;

    /// <summary>
    /// The server's welcome, the first message on every connection.
    /// </summary>
    /// <param name="You">The connecting player's id.</param>
    /// <param name="Players">Everyone online, the connecting player included, in the order they came online.</param>
    public sealed record HelloMessage(
        [property: JsonPropertyName("you")] string You,
        [property: JsonPropertyName("players")] IReadOnlyList<PlayerInfo> Players) : ServerMessage;

    /// <summary>
    /// Someone came online or went offline.
    /// </summary>
    /// <param name="Players">Everyone now online, in the order they came online.</param>
    public sealed record PlayersMessage(
        [property: JsonPropertyName("players")] IReadOnlyList<PlayerInfo> Players) : ServerMessage;

    /// <summary>
    /// The state messages the city sent in one batch, in the order it sent them, as StateMessage in
    /// <c>src/protocol.ts</c> defines each: every player in the city receives the same batches.
    /// </summary>
    public sealed record StateBatchMessage(
        [property: JsonPropertyName("messages")] JsonArray Messages) : ServerMessage
    {
        /// <summary>
        /// The batch of the state messages given, in their order.
        /// </summary>
        public static StateBatchMessage Of(IReadOnlyList<StateMessage> messages)
        {
            return new StateBatchMessage(new JsonArray(messages.Select(message => (JsonNode?)ProtocolJson.ToNode(message)).ToArray()));
        }
    }

    /// <summary>
    /// The answer to the player's request with the given id, sent after any state the request changed. What the value
    /// is depends on the request: <c>protocol/README.md</c> lists them.
    /// </summary>
    public sealed record AnswerMessage(
        [property: JsonPropertyName("id")] long Id,
        [property: JsonPropertyName("value")] JsonNode? Value) : ServerMessage;

    /// <summary>
    /// Why the player's request with the given id failed, in words.
    /// </summary>
    public sealed record FailedMessage(
        [property: JsonPropertyName("id")] long Id,
        [property: JsonPropertyName("error")] string Error) : ServerMessage;

    /// <summary>
    /// A city that has started or been joined, as <c>CityJoined</c> in <c>src/protocol.ts</c>: its id, which any
    /// player joins it by, its name, and its game seed.
    /// </summary>
    public sealed record CityJoined(
        [property: JsonPropertyName("city")] string City,
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("seed")] uint Seed);

    /// <summary>
    /// The city's session log: the log, and the steps the city has taken since the session began.
    /// </summary>
    public sealed record SessionLog(
        [property: JsonPropertyName("log")] JsonObject Log,
        [property: JsonPropertyName("step")] long Step);

    /// <summary>
    /// What came of a debug advance: the steps it took, whether a year-end budget review fell due during them, and why
    /// it failed, or null when it took every step asked for.
    /// </summary>
    public sealed record AdvanceResult(
        [property: JsonPropertyName("steps")] long Steps,
        [property: JsonPropertyName("budgetReviewDue")] bool BudgetReviewDue,
        [property: JsonPropertyName("error")] string? Error);

    /// <summary>
    /// What the debug channel answers of a candidate fire station (<see cref="EmergencyServices.FireStationReach"/>):
    /// the tiles of its perimeter on the map, in the order the scan searches them for the station's road, each with the
    /// cover the station would give the target tile with its road there.
    /// </summary>
    public sealed record FireStationReach(
        [property: JsonPropertyName("perimeter")] IReadOnlyList<RoadReach> Perimeter);

    /// <summary>
    /// A tile of a candidate fire station's perimeter, and the cover the station would give the target with its road
    /// on it.
    /// </summary>
    public sealed record RoadReach(
        [property: JsonPropertyName("x")] int X,
        [property: JsonPropertyName("y")] int Y,
        [property: JsonPropertyName("cover")] int Cover);

    /// <summary>
    /// Another player in the city moved their hover box, or it left the map. The server passes it on to the city's
    /// other players and to nothing else: the simulation never sees it, and no log keeps it.
    /// </summary>
    /// <param name="Player">The id of the player whose box it is.</param>
    /// <param name="Cursor">The box, or null when no connection of the player's in the city shows one any
    /// longer.</param>
    public sealed record CursorMessage(
        [property: JsonPropertyName("player")] string Player,
        [property: JsonPropertyName("cursor")] Cursor? Cursor) : ServerMessage;

    /// <summary>
    /// A player's hover box on the map.
    /// </summary>
    /// <param name="Tool">The tool the player holds.</param>
    /// <param name="X">The column of the map tile under the player's pointer, where a click applies the tool.</param>
    /// <param name="Y">The row of that tile.</param>
    /// <param name="Size">The box's side in tiles.</param>
    public sealed record Cursor(
        [property: JsonPropertyName("tool")] CursorTool Tool,
        [property: JsonPropertyName("x")] int X,
        [property: JsonPropertyName("y")] int Y,
        [property: JsonPropertyName("size")] int Size);

    /// <summary>
    /// The tools a hover box shows, as <c>CURSOR_TOOLS</c> in <c>src/protocol.ts</c> lists them, in its order: those of
    /// <see cref="ToolName"/>, then the query tool. Read by name only, as the client's reader reads it.
    /// </summary>
    [JsonConverter(typeof(ProtocolNameConverter<CursorTool>))]
    public enum CursorTool
    {
        [JsonStringEnumMemberName("airport")] Airport,
        [JsonStringEnumMemberName("bulldozer")] Bulldozer,
        [JsonStringEnumMemberName("coal")] Coal,
        [JsonStringEnumMemberName("commercial")] Commercial,
        [JsonStringEnumMemberName("fire")] Fire,
        [JsonStringEnumMemberName("industrial")] Industrial,
        [JsonStringEnumMemberName("nuclear")] Nuclear,
        [JsonStringEnumMemberName("park")] Park,
        [JsonStringEnumMemberName("police")] Police,
        [JsonStringEnumMemberName("port")] Port,
        [JsonStringEnumMemberName("rail")] Rail,
        [JsonStringEnumMemberName("residential")] Residential,
        [JsonStringEnumMemberName("road")] Road,
        [JsonStringEnumMemberName("stadium")] Stadium,
        [JsonStringEnumMemberName("station")] Station,
        [JsonStringEnumMemberName("wire")] Wire,
        [JsonStringEnumMemberName("query")] Query,
    }

    /// <summary>
    /// A request or response body of <c>/api/session</c>. Each body's endpoint and status say what it is, so a body
    /// carries no type.
    /// </summary>
    public abstract record SessionBody;

    /// <summary>
    /// The body of <c>POST /api/session</c>.
    /// </summary>
    /// <param name="Name">The display name to sign in under.</param>
    public sealed record SignInRequest(
        [property: JsonPropertyName("name")] string Name) : SessionBody;

    /// <summary>
    /// A new player's session, the answer to a sign-in. The player learns their id from the socket's hello.
    /// </summary>
    /// <param name="Token">The token that authenticates the player.</param>
    /// <param name="Name">The display name as the server keeps it, trimmed.</param>
    public sealed record SessionResponse(
        [property: JsonPropertyName("token")] string Token,
        [property: JsonPropertyName("name")] string Name) : SessionBody;

    /// <summary>
    /// The player a valid token authenticates, the answer to <c>GET /api/session</c>.
    /// </summary>
    public sealed record PlayerResponse(
        [property: JsonPropertyName("playerId")] string PlayerId,
        [property: JsonPropertyName("name")] string Name) : SessionBody;

    /// <summary>
    /// Why the server refused a sign-in, as text to show the player.
    /// </summary>
    public sealed record ErrorResponse(
        [property: JsonPropertyName("error")] string Error) : SessionBody;

    /// <summary>
    /// The tools that change the city, as <c>TOOL_NAMES</c> in <c>src/protocol.ts</c> lists them, in its order.
    /// </summary>
    [JsonConverter(typeof(ProtocolNameConverter<ToolName>))]
    public enum ToolName
    {
        [JsonStringEnumMemberName("airport")] Airport,
        [JsonStringEnumMemberName("bulldozer")] Bulldozer,
        [JsonStringEnumMemberName("coal")] Coal,
        [JsonStringEnumMemberName("commercial")] Commercial,
        [JsonStringEnumMemberName("fire")] Fire,
        [JsonStringEnumMemberName("industrial")] Industrial,
        [JsonStringEnumMemberName("nuclear")] Nuclear,
        [JsonStringEnumMemberName("park")] Park,
        [JsonStringEnumMemberName("police")] Police,
        [JsonStringEnumMemberName("port")] Port,
        [JsonStringEnumMemberName("rail")] Rail,
        [JsonStringEnumMemberName("residential")] Residential,
        [JsonStringEnumMemberName("road")] Road,
        [JsonStringEnumMemberName("stadium")] Stadium,
        [JsonStringEnumMemberName("station")] Station,
        [JsonStringEnumMemberName("wire")] Wire,
    }

    /// <summary>
    /// The disasters a player may trigger, as <c>DISASTER_KINDS</c> lists them, in its order.
    /// </summary>
    [JsonConverter(typeof(ProtocolNameConverter<DisasterKind>))]
    public enum DisasterKind
    {
        [JsonStringEnumMemberName("monster")] Monster,
        [JsonStringEnumMemberName("fire")] Fire,
        [JsonStringEnumMemberName("flood")] Flood,
        [JsonStringEnumMemberName("crash")] Crash,
        [JsonStringEnumMemberName("meltdown")] Meltdown,
        [JsonStringEnumMemberName("tornado")] Tornado,
        [JsonStringEnumMemberName("earthquake")] Earthquake,
    }

    /// <summary>
    /// A tile of a tool's path or a trip's route.
    /// </summary>
    public readonly record struct TilePosition(
        [property: JsonPropertyName("x")] int X,
        [property: JsonPropertyName("y")] int Y)
    {
        /// <summary>
        /// Whether the tile shares a side with the other: one tile away, across or down.
        /// </summary>
        public bool IsNextTo(TilePosition other)
        {
            return Math.Abs(X - other.X) + Math.Abs(Y - other.Y) == 1;
        }
    }

    /// <summary>
    /// A change a player makes to the city, discriminated by its <c>type</c> field, as <c>Command</c> in
    /// <c>src/protocol.ts</c> defines it. The simulation reads a command as it arrived with <see cref="CommandReader"/>,
    /// which rejects anything else; writing one puts its fields in the protocol's order.
    /// </summary>
    [JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
    [JsonDerivedType(typeof(ToolCommand), "tool")]
    [JsonDerivedType(typeof(SetBudgetCommand), "setBudget")]
    [JsonDerivedType(typeof(SetSpeedCommand), "setSpeed")]
    [JsonDerivedType(typeof(SetAutoBudgetCommand), "setAutoBudget")]
    [JsonDerivedType(typeof(SetDisastersCommand), "setDisasters")]
    [JsonDerivedType(typeof(TriggerDisasterCommand), "triggerDisaster")]
    [JsonDerivedType(typeof(AddFundsCommand), "addFunds")]
    public abstract record Command;

    /// <summary>
    /// The tool applied at each tile of the path in order, with the per-tile rules and costs of a click.
    /// </summary>
    /// <param name="AutoBulldoze">The sending player's preference: whether the building, road, rail and wire tools clear
    /// what they can before building.</param>
    public sealed record ToolCommand(
        [property: JsonPropertyName("tool")] ToolName Tool,
        [property: JsonPropertyName("path")] IReadOnlyList<TilePosition> Path,
        [property: JsonPropertyName("autoBulldoze")] bool AutoBulldoze) : Command;

    /// <summary>
    /// The tax rate in percent, and the funding of each service named in whole percent of what it needs. A service
    /// left out keeps its funding.
    /// </summary>
    public sealed record SetBudgetCommand(
        [property: JsonPropertyName("road"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Road,
        [property: JsonPropertyName("fire"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Fire,
        [property: JsonPropertyName("police"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Police,
        [property: JsonPropertyName("tax")] int Tax) : Command;

    public sealed record SetSpeedCommand(
        [property: JsonPropertyName("speed")] Speed Speed) : Command;

    public sealed record SetAutoBudgetCommand(
        [property: JsonPropertyName("on")] bool On) : Command;

    public sealed record SetDisastersCommand(
        [property: JsonPropertyName("on")] bool On) : Command;

    public sealed record TriggerDisasterCommand(
        [property: JsonPropertyName("kind")] DisasterKind Kind) : Command;

    /// <summary>
    /// The debug menu's grant of funds.
    /// </summary>
    public sealed record AddFundsCommand : Command;

    /// <summary>
    /// What came of a command, as <c>Outcome</c> in <c>src/protocol.ts</c> names it. A tool command is ok when the tool
    /// succeeded at every tile of its path, and otherwise takes the outcome of the first tile where it didn't.
    /// </summary>
    [JsonConverter(typeof(ProtocolNameConverter<Outcome>))]
    public enum Outcome
    {
        [JsonStringEnumMemberName("ok")] Ok,
        [JsonStringEnumMemberName("failed")] Failed,
        [JsonStringEnumMemberName("noMoney")] NoMoney,
        [JsonStringEnumMemberName("needsBulldoze")] NeedsBulldoze,
        [JsonStringEnumMemberName("onWater")] OnWater,
        [JsonStringEnumMemberName("rejected")] Rejected,
    }

    /// <summary>
    /// Where a zone stands, as <c>GROWTH_OUTLOOKS</c> in <c>src/protocol.ts</c> names it: what its handler can do with it
    /// when it assesses it (<see cref="ZoneUtils.Outlook"/>), best first.
    /// </summary>
    [JsonConverter(typeof(ProtocolNameConverter<GrowthOutlook>))]
    public enum GrowthOutlook
    {
        /// <summary>The zone can grow and never declines.</summary>
        [JsonStringEnumMemberName("LIKELY_TO_GROW")] LikelyToGrow,

        /// <summary>The zone can grow or decline.</summary>
        [JsonStringEnumMemberName("MAY_GROW_OR_DECLINE")] MayGrowOrDecline,

        /// <summary>The zone neither grows nor declines.</summary>
        [JsonStringEnumMemberName("HOLDS_STEADY")] HoldsSteady,

        /// <summary>The zone can decline and never grows.</summary>
        [JsonStringEnumMemberName("LIKELY_TO_DECLINE")] LikelyToDecline,
    }

    /// <summary>
    /// What holds back a zone's growth, as <c>GROWTH_BLOCKERS</c> in <c>src/protocol.ts</c> names it, in the order a
    /// report lists them: a condition of the zone handlers or their grow steps that stops a zone growing, or a term of its
    /// zone score that worsens where it stands, but for the trip's result, which only a trip tells.
    /// </summary>
    [JsonConverter(typeof(ProtocolNameConverter<GrowthBlocker>))]
    public enum GrowthBlocker
    {
        /// <summary>The zone's centre has no power, which sets its score to <see cref="ZoneUtils.UnpoweredZoneScore"/>.</summary>
        [JsonStringEnumMemberName("NO_POWER")] NoPower,

        /// <summary>The demand for the zone's kind is below zero.</summary>
        [JsonStringEnumMemberName("LOW_DEMAND")] LowDemand,

        /// <summary>A home's land value alone gives it a location score below zero, which its pollution only lowers.</summary>
        [JsonStringEnumMemberName("LOW_LAND_VALUE")] LowLandValue,

        /// <summary>A home's land value alone gives it a location score of zero or more, but less its pollution, below.</summary>
        [JsonStringEnumMemberName("POLLUTION_OUTWEIGHS_LAND_VALUE")] PollutionOutweighsLandValue,

        /// <summary>A home's block is too polluted for anyone to move in, whatever its land value.</summary>
        [JsonStringEnumMemberName("TOO_POLLUTED")] TooPolluted,

        /// <summary>Commerce's block scores below zero for nearness to the city centre.</summary>
        [JsonStringEnumMemberName("FAR_FROM_CENTRE")] FarFromCentre,

        /// <summary>Commerce's block's land value is too low for a zone as crowded as this one to grow.</summary>
        [JsonStringEnumMemberName("LAND_VALUE_LIMITS_SIZE")] LandValueLimitsSize,

        /// <summary>An empty home zone has no lot left free for a house among those round its centre.</summary>
        [JsonStringEnumMemberName("NO_FREE_LOT")] NoFreeLot,

        /// <summary>An empty home zone full of houses has too few people round it to be built up.</summary>
        [JsonStringEnumMemberName("NEIGHBOURHOOD_TOO_SPARSE")] NeighbourhoodTooSparse,

        /// <summary>The zone is at the greatest population of its kind.</summary>
        [JsonStringEnumMemberName("FULL")] Full,
    }

    /// <summary>
    /// The bounds <c>src/protocol.ts</c> sets on what a message carries, beyond the types of its fields.
    /// </summary>
    public static class ProtocolLimits
    {
        /// <summary>
        /// The largest game seed, <c>MAX_SEED</c>: a seed is a uint32.
        /// </summary>
        public const uint MaxSeed = uint.MaxValue;
    }

    /// <summary>
    /// Reads and writes an enumeration by its members' protocol names, compared exactly, as the client's reader
    /// compares them: a number, names joined as flags, or a name with spaces round it is an error. Public, unlike
    /// <see cref="ProtocolJson"/>'s own converters, because the enumerations' attributes name it.
    /// </summary>
    public sealed class ProtocolNameConverter<TEnum> : JsonConverter<TEnum> where TEnum : struct, Enum
    {
        public override TEnum Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            if (reader.TokenType != JsonTokenType.String || !ProtocolJson.TryParseName(reader.GetString()!, out TEnum value))
            {
                throw new JsonException($"A {typeof(TEnum).Name} is one of {string.Join(", ", ProtocolJson.Names<TEnum>())}.");
            }

            return value;
        }

        public override void Write(Utf8JsonWriter writer, TEnum value, JsonSerializerOptions options)
        {
            writer.WriteStringValue(ProtocolJson.Name(value));
        }
    }

    /// <summary>
    /// Reads and writes protocol messages. Reading is strict: an unknown field, a missing one or a null where the
    /// protocol has none is an error rather than a default. The fields of a message may come in any order, its
    /// <c>type</c> included, and writing puts them in the protocol's order.
    /// </summary>
    public static class ProtocolJson
    {
        private static readonly JsonSerializerOptions Options = new JsonSerializerOptions
        {
            UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
            RespectNullableAnnotations = true,
            RespectRequiredConstructorParameters = true,
            AllowOutOfOrderMetadataProperties = true,
            // Messages travel as JSON text and are never embedded in HTML, so HTML-sensitive characters and letters
            // of any script are written as they are, as JSON.stringify writes them. protocol/README.md states which
            // characters the two serializers write differently.
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            // A fraction, such as a funding share, and any JSON value a message carries, such as a command a player
            // sent, written as JSON.stringify writes it
            Converters = { new JavaScriptDoubleConverter(), new JavaScriptNodeConverter() },
            // Deep enough to read back whatever a player's message carried, which is read as deep as JsonText reads,
            // inside the messages that carry it on: a rejected command's result echoes the command to every player
            MaxDepth = MaxCarriedDepth,
        };

        // The deepest a message nests, a value a player sent with the objects and lists that carry it around it, as a
        // state batch carries a command result's command
        private const int MaxCarriedDepth = JsonText.MaxDepth + 16;

        /// <summary>
        /// The message as the wire carries it.
        /// </summary>
        public static string Serialize(ServerMessage message)
        {
            return JsonSerializer.Serialize(message, Options);
        }

        /// <summary>
        /// Reads a server message.
        /// </summary>
        /// <exception cref="JsonException">The text is not a server message.</exception>
        public static ServerMessage DeserializeServerMessage(string json)
        {
            try
            {
                return JsonSerializer.Deserialize<ServerMessage>(json, Options)
                    ?? throw new JsonException("A server message cannot be null.");
            }
            catch (NotSupportedException exception)
            {
                // System.Text.Json reports a message with no type this way, as if the fault were the reader's
                throw new JsonException("A server message must have a type.", exception);
            }
        }

        /// <summary>
        /// The session body as the wire carries it.
        /// </summary>
        public static string Serialize(SessionBody body)
        {
            // By the body's own type: a body has no discriminator, so serializing it as a SessionBody writes no field
            return JsonSerializer.Serialize(body, body.GetType(), Options);
        }

        /// <summary>
        /// Reads a session body.
        /// </summary>
        /// <exception cref="JsonException">The text is not a body of the given kind.</exception>
        public static TBody DeserializeSessionBody<TBody>(string json) where TBody : SessionBody
        {
            return JsonSerializer.Deserialize<TBody>(json, Options)
                ?? throw new JsonException("A session body cannot be null.");
        }

        /// <summary>
        /// The command as the wire carries it. A command is read with <see cref="CommandReader"/>, which the simulation
        /// validates it with.
        /// </summary>
        public static string Serialize(Command command)
        {
            return JsonSerializer.Serialize(command, Options);
        }

        /// <summary>
        /// A value of the protocol's, such as a state message or an answer, as the JSON the wire carries it as, to be
        /// carried in another message.
        /// </summary>
        public static JsonNode? ToNode(object value)
        {
            // By the value's own type, which writes a state message's or an answer's type first. The text is read back
            // as JSON.parse reads it, which keeps a lone surrogate a player sent.
            return JsonText.Parse(JsonSerializer.Serialize(value, value.GetType(), Options), MaxCarriedDepth);
        }

        /// <summary>
        /// The message a player sends as the wire carries it.
        /// </summary>
        public static string Serialize(ClientMessage message)
        {
            return JsonSerializer.Serialize(message, Options);
        }

        /// <summary>
        /// The state message as the wire carries it.
        /// </summary>
        public static string Serialize(StateMessage message)
        {
            // By the message's own type, which writes its type first: a state message has no discriminator
            return JsonSerializer.Serialize(message, message.GetType(), Options);
        }

        /// <summary>
        /// The name the protocol gives an enumeration's member, such as a tool's or an outcome's.
        /// </summary>
        public static string Name<TEnum>(TEnum value) where TEnum : struct, Enum
        {
            return EnumNames<TEnum>.ByMember[value];
        }

        /// <summary>
        /// The names the protocol gives an enumeration's members, in their order.
        /// </summary>
        public static IReadOnlyList<string> Names<TEnum>() where TEnum : struct, Enum
        {
            return EnumNames<TEnum>.InOrder;
        }

        /// <summary>
        /// The member of an enumeration the protocol names so, compared exactly.
        /// </summary>
        public static bool TryParseName<TEnum>(string name, out TEnum value) where TEnum : struct, Enum
        {
            return EnumNames<TEnum>.ByName.TryGetValue(name, out value);
        }

        // A double as ECMAScript's Number::toString writes it, where .NET would write an exponent differently, such as
        // 1e-7 for its 1E-07. The protocol carries no number JSON can't hold.
        private sealed class JavaScriptDoubleConverter : JsonConverter<double>
        {
            public override double Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            {
                return reader.GetDouble();
            }

            public override void Write(Utf8JsonWriter writer, double value, JsonSerializerOptions options)
            {
                if (!double.IsFinite(value))
                {
                    throw new JsonException($"The protocol has no number {value}.");
                }

                writer.WriteRawValue(CanonicalJson.FormatNumber(value), skipInputValidation: true);
            }
        }

        // A JSON value as JSON.stringify writes it. System.Text.Json's writer replaces a lone surrogate, which a player's
        // command may hold and JSON.parse reads, with U+FFFD, where JSON.stringify escapes it, so a command a result or
        // a log carries on would no longer be the command that arrived.
        private sealed class JavaScriptNodeConverter : JsonConverterFactory
        {
            public override bool CanConvert(Type typeToConvert)
            {
                return typeof(JsonNode).IsAssignableFrom(typeToConvert);
            }

            public override JsonConverter CreateConverter(Type typeToConvert, JsonSerializerOptions options)
            {
                return (JsonConverter)Activator.CreateInstance(typeof(NodeConverter<>).MakeGenericType(typeToConvert))!;
            }

            private sealed class NodeConverter<TNode> : JsonConverter<TNode> where TNode : JsonNode
            {
                public override TNode? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
                {
                    return JsonNode.Parse(ref reader) as TNode ?? throw new JsonException($"The value is not a {typeof(TNode).Name}.");
                }

                public override void Write(Utf8JsonWriter writer, TNode value, JsonSerializerOptions options)
                {
                    writer.WriteRawValue(CanonicalJson.Stringify(value), skipInputValidation: true);
                }
            }
        }

        // An enumeration's protocol names, read from its members' attributes once
        private static class EnumNames<TEnum> where TEnum : struct, Enum
        {
            public static readonly IReadOnlyList<string> InOrder = Enum.GetValues<TEnum>().Select(member => MemberName(member)).ToList();

            public static readonly IReadOnlyDictionary<TEnum, string> ByMember =
                Enum.GetValues<TEnum>().Zip(InOrder).ToDictionary(pair => pair.First, pair => pair.Second);

            public static readonly IReadOnlyDictionary<string, TEnum> ByName =
                ByMember.ToDictionary(pair => pair.Value, pair => pair.Key, StringComparer.Ordinal);

            private static string MemberName(TEnum member)
            {
                FieldInfo field = typeof(TEnum).GetField(member.ToString())!;

                return field.GetCustomAttribute<JsonStringEnumMemberNameAttribute>()?.Name
                    ?? throw new InvalidOperationException($"{typeof(TEnum).Name}.{field.Name} has no protocol name.");
            }
        }
    }

    /// <summary>
    /// Player ids the protocol defines.
    /// </summary>
    public static class PlayerIds
    {
        /// <summary>
        /// The one player a single-player command log names, such as a fixture's, <c>LOCAL_PLAYER</c> in
        /// <c>test/helpers/commandLog.ts</c>.
        /// </summary>
        public const string Local = "local";
    }
}
