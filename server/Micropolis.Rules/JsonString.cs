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
    /// A JSON string as the UTF-16 code units it is in JavaScript, whether parsed from text or written by the state
    /// model.
    /// </summary>
    internal static class JsonString
    {
        // System.Text.Json refuses to read a lone surrogate escape such as "\ud800" as a string, which JSON.parse
        // keeps, so a string parsed from text is decoded from its raw text here
        public static string Get(JsonValue value)
        {
            if (!value.TryGetValue(out JsonElement element))
            {
                return value.GetValue<string>();
            }

            string raw = element.GetRawText();
            StringBuilder decoded = new StringBuilder(raw.Length);

            // The raw text is quoted and well formed: the parser has checked it
            for (int i = 1; i < raw.Length - 1; i++)
            {
                if (raw[i] != '\\')
                {
                    decoded.Append(raw[i]);
                    continue;
                }

                i++;

                switch (raw[i])
                {
                    case 'b':
                        decoded.Append('\b');
                        break;
                    case 'f':
                        decoded.Append('\f');
                        break;
                    case 'n':
                        decoded.Append('\n');
                        break;
                    case 'r':
                        decoded.Append('\r');
                        break;
                    case 't':
                        decoded.Append('\t');
                        break;
                    case 'u':
                        decoded.Append((char)int.Parse(raw.AsSpan(i + 1, 4), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture));
                        i += 4;
                        break;
                    default:
                        // \" \\ \/
                        decoded.Append(raw[i]);
                        break;
                }
            }

            return decoded.ToString();
        }
    }
}
