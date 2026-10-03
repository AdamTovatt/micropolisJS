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

using System.Text.Json;
using System.Text.Json.Serialization;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// Reads a file under <c>conformance/</c> in place, strictly: a member the record lacks, or one the file lacks,
    /// fails the read rather than leaving a test to pass over nothing.
    /// </summary>
    internal static class ConformanceFile
    {
        public static string Read(string name)
        {
            return File.ReadAllText(RepositoryFiles.GetPath($"conformance/{name}"));
        }

        public static T Load<T>(string name)
        {
            return Parse<T>(Read(name));
        }

        public static T Parse<T>(string json, params JsonConverter[] converters)
        {
            JsonSerializerOptions options = new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
                RespectNullableAnnotations = true,
                RespectRequiredConstructorParameters = true,
            };

            foreach (JsonConverter converter in converters)
            {
                options.Converters.Add(converter);
            }

            return JsonSerializer.Deserialize<T>(json, options)
                ?? throw new InvalidDataException("A conformance file cannot be null.");
        }

        public static void NonEmpty<TItem>(string name, IReadOnlyCollection<TItem> values)
        {
            if (values.Count == 0)
            {
                throw new InvalidDataException($"The conformance list {name} is empty.");
            }
        }
    }
}
