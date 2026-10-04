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
using System.Text.Encodings.Web;
using System.Text.Json;
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
    [JsonConverter(typeof(JsonStringEnumConverter<ToolName>))]
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
        [JsonStringEnumMemberName("wire")] Wire,
    }

    /// <summary>
    /// The disasters a player may trigger, as <c>DISASTER_KINDS</c> lists them, in its order.
    /// </summary>
    [JsonConverter(typeof(JsonStringEnumConverter<DisasterKind>))]
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
    /// A tile of a tool's path.
    /// </summary>
    public readonly record struct TilePosition(
        [property: JsonPropertyName("x")] int X,
        [property: JsonPropertyName("y")] int Y);

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
    [JsonConverter(typeof(JsonStringEnumConverter<Outcome>))]
    public enum Outcome
    {
        [JsonStringEnumMemberName("ok")] Ok,
        [JsonStringEnumMemberName("failed")] Failed,
        [JsonStringEnumMemberName("noMoney")] NoMoney,
        [JsonStringEnumMemberName("needsBulldoze")] NeedsBulldoze,
        [JsonStringEnumMemberName("rejected")] Rejected,
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
        };

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
}
