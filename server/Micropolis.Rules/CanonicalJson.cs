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
    /// The canonical text of a saved state, which the state hash is computed over, specified in
    /// <c>docs/state-hash.md</c>: JSON without whitespace, with each
    /// object's keys sorted by UTF-16 code unit, strings escaped as ECMAScript's <c>JSON.stringify</c> escapes them,
    /// and numbers in ECMAScript's <c>Number::toString</c> form. A value the format doesn't define is an error.
    /// </summary>
    public static class CanonicalJson
    {
        public static string Write(JsonNode? value)
        {
            StringBuilder output = new StringBuilder();
            Write(value, "the state", output);
            return output.ToString();
        }

        // ECMAScript's Number::toString in radix 10, of a finite number. .NET's shortest round-trip formatting gives the
        // same digits, which are laid out here by the specification's rules rather than .NET's.
        private static string FormatNumber(double value)
        {
            // Negative zero is written "0"
            if (value == 0)
            {
                return "0";
            }

            if (value < 0)
            {
                return "-" + FormatNumber(-value);
            }

            (string digits, int n) = ShortestDigits(value);
            int k = digits.Length;

            if (k <= n && n <= 21)
            {
                return digits + new string('0', n - k);
            }

            if (0 < n && n <= 21)
            {
                return digits[..n] + "." + digits[n..];
            }

            if (-6 < n && n <= 0)
            {
                return "0." + new string('0', -n) + digits;
            }

            string exponent = (n - 1 < 0 ? "-" : "+") + Math.Abs(n - 1).ToString(CultureInfo.InvariantCulture);

            if (k == 1)
            {
                return digits + "e" + exponent;
            }

            return digits[..1] + "." + digits[1..] + "e" + exponent;
        }

        // The shortest digits s, without leading or trailing zeros, and the n for which the value is s × 10^(n − k).
        // A positive finite double's round-trip form is "d.ddd", "dddd" or either followed by "E+x" or "E-x".
        private static (string Digits, int N) ShortestDigits(double value)
        {
            string text = value.ToString("R", CultureInfo.InvariantCulture);

            int exponentIndex = text.IndexOf('E');
            string mantissa = exponentIndex < 0 ? text : text[..exponentIndex];
            int exponent = exponentIndex < 0 ? 0 : int.Parse(text[(exponentIndex + 1)..], NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture);

            int pointIndex = mantissa.IndexOf('.');
            string integerPart = pointIndex < 0 ? mantissa : mantissa[..pointIndex];
            string fractionPart = pointIndex < 0 ? string.Empty : mantissa[(pointIndex + 1)..];

            // The value is 0.(integerPart fractionPart) × 10^n
            string digits = integerPart + fractionPart;
            int n = integerPart.Length + exponent;

            int leadingZeros = 0;

            while (digits[leadingZeros] == '0')
            {
                leadingZeros++;
            }

            return (digits[leadingZeros..].TrimEnd('0'), n - leadingZeros);
        }

        private static void Write(JsonNode? value, string path, StringBuilder output)
        {
            switch (value)
            {
                case null:
                    output.Append("null");
                    break;

                case JsonObject jsonObject:
                    WriteObject(jsonObject, path, output);
                    break;

                case JsonArray jsonArray:
                    WriteArray(jsonArray, path, output);
                    break;

                case JsonValue jsonValue:
                    WriteValue(jsonValue, path, output);
                    break;

                default:
                    throw Fail(path, $"a {value.GetType().Name} has no canonical form");
            }
        }

        private static void WriteObject(JsonObject value, string path, StringBuilder output)
        {
            // Ordinal comparison compares UTF-16 code units, which the format specifies
            List<KeyValuePair<string, JsonNode?>> members = value.ToList();
            members.Sort((first, second) => string.CompareOrdinal(first.Key, second.Key));

            output.Append('{');

            for (int i = 0; i < members.Count; i++)
            {
                if (i > 0)
                {
                    output.Append(',');
                }

                WriteString(members[i].Key, output);
                output.Append(':');
                Write(members[i].Value, $"{path}.{members[i].Key}", output);
            }

            output.Append('}');
        }

        private static void WriteArray(JsonArray value, string path, StringBuilder output)
        {
            output.Append('[');

            for (int i = 0; i < value.Count; i++)
            {
                if (i > 0)
                {
                    output.Append(',');
                }

                Write(value[i], $"{path}[{i}]", output);
            }

            output.Append(']');
        }

        private static void WriteValue(JsonValue value, string path, StringBuilder output)
        {
            switch (value.GetValueKind())
            {
                case JsonValueKind.True:
                    output.Append("true");
                    break;

                case JsonValueKind.False:
                    output.Append("false");
                    break;

                case JsonValueKind.String:
                    WriteString(JsonString.Get(value), output);
                    break;

                case JsonValueKind.Number:
                    output.Append(FormatNumberAt(GetNumber(value, path), path));
                    break;

                default:
                    throw Fail(path, $"a {value.GetValueKind()} value has no canonical form");
            }
        }

        private static double GetNumber(JsonValue value, string path)
        {
            if (!JsonNumber.TryGetDouble(value, out double number))
            {
                throw Fail(path, "a number of this type has no canonical form");
            }

            return number;
        }

        private static string FormatNumberAt(double value, string path)
        {
            if (!double.IsFinite(value))
            {
                throw Fail(path, $"{value} is not a finite number");
            }

            return FormatNumber(value);
        }

        private static void WriteString(string value, StringBuilder output)
        {
            output.Append('"');

            for (int i = 0; i < value.Length; i++)
            {
                char c = value[i];

                switch (c)
                {
                    case '"':
                        output.Append("\\\"");
                        break;
                    case '\\':
                        output.Append("\\\\");
                        break;
                    case '\b':
                        output.Append("\\b");
                        break;
                    case '\f':
                        output.Append("\\f");
                        break;
                    case '\n':
                        output.Append("\\n");
                        break;
                    case '\r':
                        output.Append("\\r");
                        break;
                    case '\t':
                        output.Append("\\t");
                        break;
                    default:
                        if (c < 0x20)
                        {
                            AppendEscape(c, output);
                        }
                        else if (char.IsHighSurrogate(c) && i + 1 < value.Length && char.IsLowSurrogate(value[i + 1]))
                        {
                            // A surrogate pair is a character, written as itself
                            output.Append(c).Append(value[i + 1]);
                            i++;
                        }
                        else if (char.IsSurrogate(c))
                        {
                            AppendEscape(c, output);
                        }
                        else
                        {
                            output.Append(c);
                        }

                        break;
                }
            }

            output.Append('"');
        }

        private static void AppendEscape(char c, StringBuilder output)
        {
            output.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
        }

        private static InvalidOperationException Fail(string path, string message)
        {
            return new InvalidOperationException($"Cannot canonicalize {path}: {message}.");
        }
    }
}
