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
using static Micropolis.Rules.Validation;

// The messages a player's browser sends on the city's WebSocket, as ClientMessage in src/protocol.ts defines them.
// protocol/README.md describes them. A request carries an id, which the server's answer to it carries back.

namespace Micropolis.Rules
{
    /// <summary>
    /// A message a player sends the server, discriminated by its <c>type</c> field. The server reads one with
    /// <see cref="ClientMessageReader"/>; writing one puts its fields in the protocol's order.
    /// </summary>
    [JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
    [JsonDerivedType(typeof(CursorReport), "cursor")]
    [JsonDerivedType(typeof(StartRequest), "start")]
    [JsonDerivedType(typeof(UploadRequest), "upload")]
    [JsonDerivedType(typeof(JoinRequest), "join")]
    [JsonDerivedType(typeof(CommandMessage), "command")]
    [JsonDerivedType(typeof(QueryRequest), "query")]
    [JsonDerivedType(typeof(SaveRequest), "save")]
    [JsonDerivedType(typeof(DownloadRequest), "download")]
    [JsonDerivedType(typeof(CommandLogRequest), "commandLog")]
    [JsonDerivedType(typeof(HoldRequest), "hold")]
    [JsonDerivedType(typeof(ReleaseRequest), "release")]
    [JsonDerivedType(typeof(FlushRequest), "flush")]
    [JsonDerivedType(typeof(AdvanceRequest), "advance")]
    [JsonDerivedType(typeof(CityTimeRequest), "cityTime")]
    [JsonDerivedType(typeof(SavedGameRequest), "savedGame")]
    [JsonDerivedType(typeof(StateHashRequest), "stateHash")]
    [JsonDerivedType(typeof(FireStationReachRequest), "fireStationReach")]
    [JsonDerivedType(typeof(TurnRequest), "turn")]
    public abstract record ClientMessage;

    /// <summary>
    /// The player's hover box, or null once it left the map, which the server passes on to the city's other players as
    /// a <see cref="CursorMessage"/> and to nothing else. The server doesn't answer it. Its values are read for their
    /// kinds; whether its tile is on the city's map is the city's to say.
    /// </summary>
    public sealed record CursorReport(
        [property: JsonPropertyName("cursor")] Cursor? Cursor) : ClientMessage;

    /// <summary>
    /// A message the server answers, by its id.
    /// </summary>
    public abstract record ClientRequest(
        [property: JsonPropertyName("id"), JsonPropertyOrder(-1)] long Id) : ClientMessage;

    /// <summary>
    /// Starts a new city on the server, under the name given, on the map the game seed generates, at a level by its
    /// number in <c>GAME_LEVELS</c>, and joins it. The answer is a <see cref="CityJoined"/>.
    /// </summary>
    public sealed record StartRequest(
        long Id,
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("seed")] uint Seed,
        [property: JsonPropertyName("level")] int Level) : ClientRequest(Id);

    /// <summary>
    /// Starts a city on the server from a saved game's text, and joins it. The answer is a <see cref="CityJoined"/>.
    /// </summary>
    public sealed record UploadRequest(
        long Id,
        [property: JsonPropertyName("save")] string Save) : ClientRequest(Id);

    /// <summary>
    /// Joins the city with the given id. The answer is a <see cref="CityJoined"/>.
    /// </summary>
    public sealed record JoinRequest(
        long Id,
        [property: JsonPropertyName("city")] string City) : ClientRequest(Id);

    /// <summary>
    /// A command for the city the player is in, as it arrived: the simulation validates it. The server doesn't answer
    /// it: what came of it is a state message.
    /// </summary>
    public sealed record CommandMessage(
        [property: JsonPropertyName("command")] JsonNode? Command) : ClientMessage;

    /// <summary>
    /// A query, as it arrived: the simulation validates it. The answer is a <see cref="QueryAnswer"/>.
    /// </summary>
    public sealed record QueryRequest(
        long Id,
        [property: JsonPropertyName("query")] JsonNode? Query) : ClientRequest(Id);

    /// <summary>
    /// Keeps the city the player is in in the server's store, as it stands. The answer is null, once the store has kept
    /// it.
    /// </summary>
    public sealed record SaveRequest(long Id) : ClientRequest(Id);

    /// <summary>
    /// The saved game's text of the city the player is in, as the game saves one, for the player to keep as a file. It
    /// reaches no store. The answer is the text.
    /// </summary>
    public sealed record DownloadRequest(long Id) : ClientRequest(Id);

    /// <summary>
    /// The city's session log. The answer is a <see cref="SessionLog"/>.
    /// </summary>
    public sealed record CommandLogRequest(long Id) : ClientRequest(Id);

    /// <summary>
    /// The debug channel: holds the city's step driver. The answer is null.
    /// </summary>
    public sealed record HoldRequest(long Id) : ClientRequest(Id);

    /// <summary>
    /// The debug channel: releases the city's step driver. The answer is null.
    /// </summary>
    public sealed record ReleaseRequest(long Id) : ClientRequest(Id);

    /// <summary>
    /// The debug channel: applies the commands sent so far. The answer is null.
    /// </summary>
    public sealed record FlushRequest(long Id) : ClientRequest(Id);

    /// <summary>
    /// The debug channel: applies the commands sent so far, then takes this many steps. The answer is an
    /// <see cref="AdvanceResult"/>.
    /// </summary>
    public sealed record AdvanceRequest(
        long Id,
        [property: JsonPropertyName("steps")] double Steps) : ClientRequest(Id);

    /// <summary>
    /// The debug channel: the city's time. The answer is a number.
    /// </summary>
    public sealed record CityTimeRequest(long Id) : ClientRequest(Id);

    /// <summary>
    /// The debug channel: the saved game's text of the city, as the game saves one, which reaches no store. The answer
    /// is the text.
    /// </summary>
    public sealed record SavedGameRequest(long Id) : ClientRequest(Id);

    /// <summary>
    /// The debug channel: the city's state hash, as <see cref="StateHash"/> computes it. The answer is the hash.
    /// </summary>
    public sealed record StateHashRequest(long Id) : ClientRequest(Id);

    /// <summary>
    /// The debug channel: what a fire station centred at the station tile would give the target tile, without
    /// changing the city. Its tiles are read for their kinds; whether they are on the city's map is the city's to say.
    /// The answer is a <see cref="FireStationReach"/>.
    /// </summary>
    public sealed record FireStationReachRequest(
        long Id,
        [property: JsonPropertyName("station")] TilePosition Station,
        [property: JsonPropertyName("target")] TilePosition Target) : ClientRequest(Id);

    /// <summary>
    /// The debug channel of a server whose cities run on a clock the tests move: moves the clock on by the milliseconds
    /// given, then takes a turn of the city's loop if one is due. The answer is null.
    /// </summary>
    public sealed record TurnRequest(
        long Id,
        [property: JsonPropertyName("milliseconds")] double Milliseconds) : ClientRequest(Id);

    /// <summary>
    /// Reads a message a player sent, strictly, as <c>JSON.parse</c> reads it: a command or a query in it is any JSON,
    /// which the simulation validates, as it does a command in a log.
    /// </summary>
    public static class ClientMessageReader
    {
        // The largest whole number a JavaScript number holds exactly, Number.MAX_SAFE_INTEGER, which a browser counts
        // its requests up to
        private const long MaxId = 9007199254740991;

        // Each message's fields but its type, all required. A type listed among ClientMessage's derived types but not
        // here, or not in Read's switch, fails ProtocolTests: every derived type has an example, and each example is
        // read through these fields and that switch.
        private static readonly IReadOnlyDictionary<string, IReadOnlyDictionary<string, bool>> MessageFields =
            new Dictionary<string, IReadOnlyDictionary<string, bool>>(StringComparer.Ordinal)
            {
                ["cursor"] = Fields(required: ["cursor"]),
                ["start"] = Fields(required: ["id", "name", "seed", "level"]),
                ["upload"] = Fields(required: ["id", "save"]),
                ["join"] = Fields(required: ["id", "city"]),
                ["command"] = Fields(required: ["command"]),
                ["query"] = Fields(required: ["id", "query"]),
                ["save"] = Fields(required: ["id"]),
                ["download"] = Fields(required: ["id"]),
                ["commandLog"] = Fields(required: ["id"]),
                ["hold"] = Fields(required: ["id"]),
                ["release"] = Fields(required: ["id"]),
                ["flush"] = Fields(required: ["id"]),
                ["advance"] = Fields(required: ["id", "steps"]),
                ["cityTime"] = Fields(required: ["id"]),
                ["savedGame"] = Fields(required: ["id"]),
                ["stateHash"] = Fields(required: ["id"]),
                ["fireStationReach"] = Fields(required: ["id", "station", "target"]),
                ["turn"] = Fields(required: ["id", "milliseconds"]),
            };

        /// <summary>
        /// Reads a message.
        /// </summary>
        /// <exception cref="JsonException">The text is not a message a player sends, saying why.</exception>
        public static ClientMessage Read(string text)
        {
            if (JsonText.Parse(text) is not JsonObject message || !TryGetString(message["type"], out string? type) ||
                !MessageFields.TryGetValue(type!, out IReadOnlyDictionary<string, bool>? rules))
            {
                throw new JsonException("A message is an object whose type is one a player sends.");
            }

            if (!HasFields(message, rules, "type"))
            {
                throw new JsonException(FieldsReason($"the {type} message", rules));
            }

            if (type == "command")
            {
                return new CommandMessage(message["command"]?.DeepClone());
            }

            if (type == "cursor")
            {
                return new CursorReport(message["cursor"] is null ? null : ReadCursor(message["cursor"]));
            }

            long id = TryGetWholeNumberIn(message["id"], 0, MaxId, out long whole)
                ? whole
                : throw new JsonException("A request's id is a whole number from 0.");

            return type switch
            {
                "start" => new StartRequest(id, String(message, "name"),
                    TryGetSeed(message["seed"], out uint seed) ? seed : throw new JsonException("The seed is a uint32."),
                    TryGetWholeNumberIn(message["level"], 0, (int)Rules.Level.Hard, out long level) ? (int)level : throw new JsonException($"The level is a whole number from 0 to {(int)Rules.Level.Hard}.")),
                "upload" => new UploadRequest(id, String(message, "save")),
                "join" => new JoinRequest(id, String(message, "city")),
                "query" => new QueryRequest(id, message["query"]?.DeepClone()),
                "save" => new SaveRequest(id),
                "download" => new DownloadRequest(id),
                "commandLog" => new CommandLogRequest(id),
                "hold" => new HoldRequest(id),
                "release" => new ReleaseRequest(id),
                "flush" => new FlushRequest(id),
                "advance" => new AdvanceRequest(id, Number(message, "steps")),
                "cityTime" => new CityTimeRequest(id),
                "savedGame" => new SavedGameRequest(id),
                "stateHash" => new StateHashRequest(id),
                "fireStationReach" => new FireStationReachRequest(id, ReadTile(message["station"], "station"), ReadTile(message["target"], "target")),
                "turn" => new TurnRequest(id, Number(message, "milliseconds")),
                _ => throw new InvalidOperationException($"The {type} message has fields but no reading."),
            };
        }

        // A hover box's fields, all required, in the protocol's order
        private static readonly string[] CursorFieldNames = ["tool", "x", "y", "size"];
        private static readonly IReadOnlyDictionary<string, bool> CursorFields = Fields(required: CursorFieldNames);

        // FieldsReason names a message's type among its fields, which a hover box doesn't have, and can't say a value
        // may be null
        private static Cursor ReadCursor(JsonNode? value)
        {
            if (value is not JsonObject cursor || !HasFields(cursor, CursorFields, null))
            {
                throw new JsonException($"A hover box is null or has exactly the fields {string.Join(", ", CursorFieldNames)}.");
            }

            return new Cursor(
                TryGetName(cursor["tool"], out CursorTool tool) ? tool : throw new JsonException($"A hover box's tool is one of {string.Join(", ", ProtocolJson.Names<CursorTool>())}."),
                CursorNumber(cursor, "x"),
                CursorNumber(cursor, "y"),
                CursorNumber(cursor, "size"));
        }

        private static TilePosition ReadTile(JsonNode? value, string field)
        {
            return value is JsonObject tile && HasFields(tile, TileFields, null) &&
                   TryGetWholeNumberIn(tile["x"], int.MinValue, int.MaxValue, out long x) &&
                   TryGetWholeNumberIn(tile["y"], int.MinValue, int.MaxValue, out long y)
                ? new TilePosition((int)x, (int)y)
                : throw new JsonException($"The {field} is a tile, with exactly the fields x and y, each a whole number.");
        }

        private static int CursorNumber(JsonObject cursor, string field)
        {
            return TryGetWholeNumberIn(cursor[field], int.MinValue, int.MaxValue, out long number)
                ? (int)number
                : throw new JsonException($"A hover box's {field} is a whole number.");
        }

        private static string String(JsonObject message, string field)
        {
            return TryGetString(message[field], out string? text) ? text! : throw new JsonException($"The {field} is a string.");
        }

        private static double Number(JsonObject message, string field)
        {
            return message[field] is JsonValue value && value.GetValueKind() == JsonValueKind.Number &&
                   JsonNumber.TryGetDouble(value, out double number) && double.IsFinite(number)
                ? number
                : throw new JsonException($"The {field} is a number.");
        }
    }
}
