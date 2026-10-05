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
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The random stream's reference vectors, from <c>conformance/random.json</c>.
    /// Every list is checked non-empty, so a vector the file lost fails here rather than passing over nothing.
    /// </summary>
    public sealed record RandomVectors(
        IReadOnlyList<SeedVector> Seeds,
        GetRandomVector GetRandom,
        MaximumVector GetRandomAtTheBoundary,
        DrawVector GetRandom16Signed,
        MaximumVector GetERandom,
        ChanceVector GetChance)
    {
        public static RandomVectors Load()
        {
            return Parse(ConformanceFile.Read("random.json"));
        }

        public static RandomVectors Parse(string json)
        {
            RandomVectors vectors = ConformanceFile.Parse<RandomVectors>(json, new HexWordConverter());

            ConformanceFile.NonEmpty("seeds", vectors.Seeds);

            foreach (SeedVector vector in vectors.Seeds)
            {
                FourWords("seeded", vector.Seeded);
                ConformanceFile.NonEmpty("outputs", vector.Outputs);
                FourWords("jumped", vector.Jumped);
            }

            ConformanceFile.NonEmpty("getRandom.maxima", vectors.GetRandom.Maxima);
            ConformanceFile.NonEmpty("getRandom.outputs", vectors.GetRandom.Outputs);
            ConformanceFile.NonEmpty("getRandomAtTheBoundary.outputs", vectors.GetRandomAtTheBoundary.Outputs);
            ConformanceFile.NonEmpty("getRandom16Signed.outputs", vectors.GetRandom16Signed.Outputs);
            ConformanceFile.NonEmpty("getERandom.outputs", vectors.GetERandom.Outputs);
            ConformanceFile.NonEmpty("getChance.outputs", vectors.GetChance.Outputs);

            return vectors;
        }

        private static void FourWords(string name, IReadOnlyCollection<uint> words)
        {
            if (words.Count != 4)
            {
                throw new InvalidDataException($"Expected 4 reference words in {name}, got {words.Count}.");
            }
        }

        // Seeds and 32-bit words are written as the C reference prints them: 0x and eight lowercase hex digits
        private sealed class HexWordConverter : JsonConverter<uint>
        {
            public override uint Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
            {
                string? text = reader.TokenType == JsonTokenType.String ? reader.GetString() : null;

                if (text == null || text.Length != 10 || !text.StartsWith("0x", StringComparison.Ordinal)
                    || text.Skip(2).Any(digit => !char.IsAsciiHexDigitLower(digit)))
                {
                    throw new JsonException($"A reference word must be 0x and eight lowercase hex digits, got {text ?? reader.TokenType.ToString()}.");
                }

                return uint.Parse(text.AsSpan(2), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture);
            }

            public override void Write(Utf8JsonWriter writer, uint value, JsonSerializerOptions options)
            {
                writer.WriteStringValue($"0x{value:x8}");
            }
        }
    }

    /// <summary>
    /// A seed's reference vector: the state SplitMix64 fills, the first raw draws, and the state after one jump.
    /// </summary>
    public sealed record SeedVector(uint Seed, uint[] Seeded, uint[] Outputs, uint[] Jumped)
    {
        public override string ToString()
        {
            return $"seed 0x{Seed:x8}";
        }
    }

    /// <summary>
    /// From the seed, <see cref="CallsPerMaximum"/> calls to getRandom with each maximum in turn.
    /// </summary>
    public sealed record GetRandomVector(uint Seed, int CallsPerMaximum, int[] Maxima, int[] Outputs);

    /// <summary>
    /// Consecutive calls with one maximum, from the seed.
    /// </summary>
    public sealed record MaximumVector(uint Seed, int Maximum, int[] Outputs);

    /// <summary>
    /// Consecutive calls, from the seed.
    /// </summary>
    public sealed record DrawVector(uint Seed, int[] Outputs);

    /// <summary>
    /// Consecutive calls to getChance with one mask, from the seed.
    /// </summary>
    public sealed record ChanceVector(uint Seed, int Mask, bool[] Outputs);
}
