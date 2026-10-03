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

using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

// The bodies of /api/session and the messages on the city's WebSocket, /ws/city. src/protocol.ts defines the same by
// hand, and the examples under protocol/examples/ pin the two together: each side's tests read every example of what
// that side reads or writes and write it back to the same bytes. protocol/README.md describes the wire format. The protocol lives with the game
// rules rather than in the host, so a test or a tool reads it without one, and command messages can carry the rules'
// own types.

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
    }
}
