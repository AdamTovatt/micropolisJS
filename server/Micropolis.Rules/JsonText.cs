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

using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Micropolis.Rules
{
    /// <summary>
    /// Untrusted JSON text, such as a command a player sends, read as ECMAScript's <c>JSON.parse</c> reads it, so the
    /// simulation takes it as the TypeScript does: every string and key as the UTF-16 code units it escapes, a lone
    /// surrogate included, which System.Text.Json refuses to read as a key; a key written twice as its last value; and
    /// every number as a double, one too large for a double as infinite.
    /// </summary>
    public static class JsonText
    {
        // As deep as a value may nest, which the reader needs a bound for. JSON.parse has none, and this one is far
        // deeper than CommandReader.MaxCommandDepth, so a command too deep is read and rejected with the reason.
        internal const int MaxDepth = 1000;

        /// <exception cref="JsonException">The text is not JSON.</exception>
        public static JsonNode? Parse(string text)
        {
            Utf8JsonReader reader = new Utf8JsonReader(Encoding.UTF8.GetBytes(text), new JsonReaderOptions { MaxDepth = MaxDepth });

            // The containers open, innermost last, and the key each object is waiting to give a value
            Stack<(JsonNode Container, string? Key)> open = new Stack<(JsonNode Container, string? Key)>();
            JsonNode? root = null;
            bool read = false;

            while (reader.Read())
            {
                JsonNode? value;

                switch (reader.TokenType)
                {
                    case JsonTokenType.StartObject:
                        open.Push((new JsonObject(), null));
                        continue;

                    case JsonTokenType.StartArray:
                        open.Push((new JsonArray(), null));
                        continue;

                    case JsonTokenType.PropertyName:
                        open.Push((open.Pop().Container, Decode(reader.ValueSpan, reader.ValueIsEscaped)));
                        continue;

                    case JsonTokenType.EndObject:
                    case JsonTokenType.EndArray:
                        value = open.Pop().Container;
                        break;

                    case JsonTokenType.String:
                        value = JsonValue.Create(Decode(reader.ValueSpan, reader.ValueIsEscaped));
                        break;

                    case JsonTokenType.Number:
                        value = JsonValue.Create(double.Parse(Encoding.UTF8.GetString(reader.ValueSpan), NumberStyles.Float, CultureInfo.InvariantCulture));
                        break;

                    case JsonTokenType.True:
                        value = JsonValue.Create(true);
                        break;

                    case JsonTokenType.False:
                        value = JsonValue.Create(false);
                        break;

                    default:
                        value = null;
                        break;
                }

                if (open.Count == 0)
                {
                    root = value;
                    read = true;
                    continue;
                }

                (JsonNode container, string? key) = open.Pop();

                if (container is JsonObject jsonObject)
                {
                    // A key written twice keeps its last value, in the place of its first
                    jsonObject[key!] = value;
                    open.Push((container, null));
                }
                else
                {
                    container.AsArray().Add(value);
                    open.Push((container, null));
                }
            }

            return read ? root : throw new JsonException("The text holds no JSON value.");
        }

        // A string's or key's raw text, its escapes decoded into the UTF-16 code units they stand for
        private static string Decode(ReadOnlySpan<byte> raw, bool escaped)
        {
            string text = Encoding.UTF8.GetString(raw);
            return escaped ? JsonString.Unescape(text) : text;
        }
    }
}
