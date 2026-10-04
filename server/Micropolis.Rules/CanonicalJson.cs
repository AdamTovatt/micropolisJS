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
        // 2^53: a double holds every integer up to it exactly. JavaScript's safe integers stop one below.
        private const long ExactIntegerLimit = 1L << 53;

        public static string Write(JsonNode? value)
        {
            return WriteText(value, "the state", false);
        }

        /// <summary>
        /// The text ECMAScript's <c>JSON.stringify</c> writes for a value read from JSON text, as a command log or a
        /// message carries a command as it arrived: the canonical text, but with each object's keys in their order,
        /// and a number JSON can't hold written as <c>null</c>. A JSON number too large for a double parses as
        /// infinite, as in JavaScript.
        /// </summary>
        internal static string Stringify(JsonNode? value)
        {
            return WriteText(value, "the value", true);
        }

        /// <summary>
        /// ECMAScript's Number::toString in radix 10, of a finite number, as a template literal or <c>String()</c>
        /// writes it. .NET's shortest round-trip formatting gives the same digits, which are laid out here by the
        /// specification's rules rather than .NET's.
        /// </summary>
        public static string FormatNumber(double value)
        {
            // Negative zero is written "0"
            if (value == 0)
            {
                return "0";
            }

            // An integer a double holds exactly is written as its digits, as ECMAScript writes every integer below 10^21
            if (Math.Abs(value) <= ExactIntegerLimit && Math.Floor(value) == value)
            {
                return ((long)value).ToString(CultureInfo.InvariantCulture);
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

        // The canonical text, or JSON.stringify's when stringify is true, of a value the root names in a failure
        private static string WriteText(JsonNode? value, string root, bool stringify)
        {
            StringBuilder output = new StringBuilder();

            try
            {
                Write(value, stringify, output);
            }
            catch (CanonicalFailure failure)
            {
                throw new InvalidOperationException($"Cannot canonicalize {root}{failure.Path}: {failure.Reason}.", failure);
            }

            return output.ToString();
        }

        private static void Write(JsonNode? value, bool stringify, StringBuilder output)
        {
            switch (value)
            {
                case null:
                    output.Append("null");
                    break;

                case JsonObject jsonObject:
                    WriteObject(jsonObject, stringify, output);
                    break;

                case JsonArray jsonArray:
                    WriteArray(jsonArray, stringify, output);
                    break;

                case JsonValue jsonValue:
                    WriteValue(jsonValue, stringify, output);
                    break;

                default:
                    throw new CanonicalFailure($"a {value.GetType().Name} has no canonical form");
            }
        }

        private static void WriteObject(JsonObject value, bool stringify, StringBuilder output)
        {
            List<KeyValuePair<string, JsonNode?>> members = value.ToList();

            if (!stringify)
            {
                // Ordinal comparison compares UTF-16 code units, which the format specifies
                members.Sort((first, second) => string.CompareOrdinal(first.Key, second.Key));
            }

            output.Append('{');

            for (int i = 0; i < members.Count; i++)
            {
                if (i > 0)
                {
                    output.Append(',');
                }

                WriteString(members[i].Key, output);
                output.Append(':');
                WriteChild(members[i].Value, members[i].Key, 0, stringify, output);
            }

            output.Append('}');
        }

        private static void WriteArray(JsonArray value, bool stringify, StringBuilder output)
        {
            output.Append('[');

            for (int i = 0; i < value.Count; i++)
            {
                if (i > 0)
                {
                    output.Append(',');
                }

                WriteChild(value[i], null, i, stringify, output);
            }

            output.Append(']');
        }

        // A member's value, under its key, or an element, at its index: a failure inside it gains the key or index at
        // the front of its path
        private static void WriteChild(JsonNode? child, string? key, int index, bool stringify, StringBuilder output)
        {
            try
            {
                Write(child, stringify, output);
            }
            catch (CanonicalFailure failure)
            {
                failure.Path = (key is null ? $"[{index}]" : $".{key}") + failure.Path;
                throw;
            }
        }

        private static void WriteValue(JsonValue value, bool stringify, StringBuilder output)
        {
            // A number first, which most values are, without asking the value its kind
            if (JsonNumber.TryGetDouble(value, out double number))
            {
                if (Math.Abs(number) >= ExactIntegerLimit)
                {
                    RefuseInexactInteger(value);
                }

                output.Append(stringify && !double.IsFinite(number) ? "null" : FormatFiniteNumber(number));
                return;
            }

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
                    throw new CanonicalFailure("a number of this type has no canonical form");

                default:
                    throw new CanonicalFailure($"a {value.GetValueKind()} value has no canonical form");
            }
        }

        // An integer the model holds beyond 2^53, which no double is exactly: the C# has worked out a value the
        // TypeScript's numbers can't hold, and writing it would round it. A number parsed from text is the double
        // JSON.parse reads, and passes.
        private static void RefuseInexactInteger(JsonValue value)
        {
            if (!value.TryGetValue(out JsonElement _) && value.TryGetValue(out long integer) &&
                (integer > ExactIntegerLimit || integer < -ExactIntegerLimit))
            {
                throw new CanonicalFailure($"the integer {integer} is beyond 2^53, so no double holds it exactly");
            }
        }

        private static string FormatFiniteNumber(double value)
        {
            if (!double.IsFinite(value))
            {
                throw new CanonicalFailure($"{value} is not a finite number");
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

        // A value with no canonical form, named by its path, which each object and array prepends its key or index to
        // as the failure passes out through it: the path is built only for a failure, not for every value written
        private sealed class CanonicalFailure : Exception
        {
            public CanonicalFailure(string reason)
            {
                Reason = reason;
            }

            public string Reason { get; }

            public string Path { get; set; } = string.Empty;
        }
    }
}
