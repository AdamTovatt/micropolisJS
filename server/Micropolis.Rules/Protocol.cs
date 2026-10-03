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

// The messages on the city's WebSocket, /ws/city. src/protocol.ts defines the same messages by hand, and the examples
// under protocol/examples/ pin the two together: each side's tests read every example and write it back to the same
// bytes. protocol/README.md describes the wire format.

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
    }
}
