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

using System.Text.RegularExpressions;
using System.Text.Json.Nodes;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// Where a saved state first differs from what a test expects, said so a person can find it: the key path, in
    /// the canonical text's key order, and for a tile or a block, its position.
    /// </summary>
    internal static partial class StateComparison
    {
        /// <summary>
        /// The first difference between the states, or <see langword="null"/> when they are the same.
        /// <paramref name="city"/> is the city that saved <paramref name="actual"/>, whose block maps give the size of a
        /// block map's rows.
        /// </summary>
        public static string? StateDifference(JsonNode expected, JsonNode actual, Simulation city)
        {
            if (FirstDifference(expected, actual, "") is not { } difference)
            {
                return null;
            }

            int mapWidth = (int)expected["map"]!["width"]!;
            return $"The state after differs first at {Locate(difference.Path, mapWidth, city)}: expected {difference.Expected}, was {difference.Actual}.";
        }

        // The path of the first difference, and each side's value there, described
        private static (string Path, string Expected, string Actual)? FirstDifference(JsonNode? expected, JsonNode? actual, string path)
        {
            if (CanonicalJson.Write(expected) == CanonicalJson.Write(actual))
            {
                return null;
            }

            if (expected is JsonObject expectedObject && actual is JsonObject actualObject)
            {
                // The canonical text's order: keys sorted by UTF-16 code unit
                IEnumerable<string> keys = expectedObject.Select(member => member.Key)
                    .Union(actualObject.Select(member => member.Key))
                    .OrderBy(key => key, StringComparer.Ordinal);

                foreach (string key in keys)
                {
                    string keyPath = path.Length == 0 ? key : $"{path}.{key}";

                    if (!expectedObject.ContainsKey(key) || !actualObject.ContainsKey(key))
                    {
                        string Present(JsonObject parent) => parent.ContainsKey(key) ? Describe(keyPath, parent[key]) : "no such key";
                        return (keyPath, Present(expectedObject), Present(actualObject));
                    }

                    if (FirstDifference(expectedObject[key], actualObject[key], keyPath) is { } difference)
                    {
                        return difference;
                    }
                }
            }

            if (expected is JsonArray expectedArray && actual is JsonArray actualArray && expectedArray.Count == actualArray.Count)
            {
                for (int i = 0; i < expectedArray.Count; i++)
                {
                    if (FirstDifference(expectedArray[i], actualArray[i], $"{path}[{i}]") is { } difference)
                    {
                        return difference;
                    }
                }
            }

            return (path, Describe(path, expected), Describe(path, actual));
        }

        // A tile's or a block's position for an entry of the tiles, a block map or the power grid
        private static string Locate(string path, int mapWidth, Simulation city)
        {
            Match entry = ListEntry().Match(path);

            if (!entry.Success)
            {
                return path;
            }

            string list = entry.Groups["list"].Value;
            int index = int.Parse(entry.Groups["index"].Value);

            if (list == "map.tiles" || list == "scannedState.power.powerGrid")
            {
                return $"{list}, the tile at ({index % mapWidth}, {index / mapWidth})";
            }

            const string blockMaps = "scannedState.blockMaps.";
            if (list.StartsWith(blockMaps, StringComparison.Ordinal) && city.BlockMaps.Saved(list[blockMaps.Length..]) is { } map)
            {
                return $"{list}, the block at ({index % map.Width}, {index / map.Width}) of {map.BlockSize}×{map.BlockSize} tiles";
            }

            return path;
        }

        // A value, and for a tile its value and flags apart
        private static string Describe(string path, JsonNode? value)
        {
            string text = CanonicalJson.Write(value);

            if (path.StartsWith("map.tiles[", StringComparison.Ordinal) && value is JsonValue tile && tile.TryGetValue(out int raw))
            {
                return $"{text} (tile {raw & TileFlags.BIT_MASK}, flags 0x{raw & TileFlags.ALLBITS:x4})";
            }

            return text;
        }

        [GeneratedRegex(@"^(?<list>[A-Za-z.]+)\[(?<index>\d+)\]$")]
        private static partial Regex ListEntry();
    }
}
