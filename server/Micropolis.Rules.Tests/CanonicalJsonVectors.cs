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

using System.Globalization;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The canonical text of numbers, strings and documents (<c>docs/state-hash.md</c>), from
    /// <c>conformance/canonicalJson.json</c>.
    /// </summary>
    public sealed record CanonicalJsonVectors(
        IReadOnlyList<NumberVector> Numbers,
        IReadOnlyList<StringVector> Strings,
        IReadOnlyList<DocumentVector> Documents)
    {
        public static CanonicalJsonVectors Load()
        {
            return Parse(ConformanceFile.Read("canonicalJson.json"));
        }

        public static CanonicalJsonVectors Parse(string json)
        {
            CanonicalJsonVectors vectors = ConformanceFile.Parse<CanonicalJsonVectors>(json);

            ConformanceFile.NonEmpty("numbers", vectors.Numbers);
            ConformanceFile.NonEmpty("strings", vectors.Strings);
            ConformanceFile.NonEmpty("documents", vectors.Documents);

            return vectors;
        }
    }

    /// <summary>
    /// A double, given by its IEEE 754 bits so that every double, negative zero included, is written exactly.
    /// </summary>
    public sealed record NumberVector(string Bits, string Text)
    {
        public double Value
        {
            get
            {
                if (Bits.Length != 18 || !Bits.StartsWith("0x", StringComparison.Ordinal))
                {
                    throw new InvalidDataException($"A double's bits must be 0x and sixteen hex digits, got {Bits}.");
                }

                return BitConverter.Int64BitsToDouble(long.Parse(Bits.AsSpan(2), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture));
            }
        }

        public override string ToString()
        {
            return $"{Bits} ({Text})";
        }
    }

    /// <summary>
    /// A string given by its UTF-16 code units, so that a lone surrogate can be written.
    /// </summary>
    public sealed record StringVector(int[] CodeUnits, string Text)
    {
        public string Value => new string(CodeUnits.Select(unit => checked((char)unit)).ToArray());

        public override string ToString()
        {
            return $"[{string.Join(", ", CodeUnits.Select(unit => $"0x{unit:x4}"))}]";
        }
    }

    /// <summary>
    /// A JSON document and its canonical text.
    /// </summary>
    public sealed record DocumentVector(string Json, string Text)
    {
        public override string ToString()
        {
            return Json;
        }
    }
}
