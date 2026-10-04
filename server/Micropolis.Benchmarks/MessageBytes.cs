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

namespace Micropolis.Benchmarks
{
    /// <summary>
    /// One case's state-message bytes per step, and the state hash the measured city ended at, which the timed city
    /// must end at too, so both figures are of one city.
    /// </summary>
    internal sealed record CaseBytes(double BytesPerStep, string StateHash);

    /// <summary>
    /// The state-message bytes per step of each case, as <c>headless/messageBytes.ts</c> measures them on the
    /// TypeScript city host. They must cover every case of the case list and nothing else, over the steps the timing
    /// measures.
    /// </summary>
    internal sealed class MessageBytes
    {
        /// <summary>
        /// What the figures measure, as the report says.
        /// </summary>
        public const string Source =
            "the TypeScript city host's state messages (`src/cityHost.ts`), run headless with one batch after each " +
            "step, each message counted as the UTF-8 bytes of its JSON text, the payload of one WebSocket text frame";

        private readonly Dictionary<(string Name, string Speed), CaseBytes> _cases;

        private MessageBytes(Dictionary<(string Name, string Speed), CaseBytes> cases)
        {
            _cases = cases;
        }

        public static MessageBytes Parse(string json, IReadOnlyList<BenchmarkCase> cases, BenchmarkSettings settings)
        {
            JsonSerializerOptions options = new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
                RespectNullableAnnotations = true,
                RespectRequiredConstructorParameters = true,
            };

            Measured measured = JsonSerializer.Deserialize<Measured>(json, options)
                ?? throw new InvalidDataException("The message bytes are null.");

            if (measured.Warmup != settings.Warmup || measured.Steps != settings.Steps)
            {
                throw new InvalidDataException(
                    $"The message bytes were measured over {measured.Steps} steps after {measured.Warmup} to warm up, " +
                    $"but the timing measures {settings.Steps} after {settings.Warmup}.");
            }

            Dictionary<(string Name, string Speed), CaseBytes> measuredCases = new Dictionary<(string Name, string Speed), CaseBytes>();

            foreach (MeasuredCase measuredCase in measured.Cases)
            {
                if (!measuredCases.TryAdd((measuredCase.Name, measuredCase.Speed), new CaseBytes(measuredCase.BytesPerStep, measuredCase.Hash)))
                {
                    throw new InvalidDataException($"The message bytes measure {measuredCase.Name} at {measuredCase.Speed} twice.");
                }
            }

            foreach (BenchmarkCase benchmarkCase in cases)
            {
                if (!measuredCases.ContainsKey((benchmarkCase.Name, benchmarkCase.SpeedName)))
                {
                    throw new InvalidDataException(
                        $"The message bytes don't measure {benchmarkCase.Name} at {benchmarkCase.SpeedName}.");
                }
            }

            if (measuredCases.Count != cases.Count)
            {
                throw new InvalidDataException("The message bytes measure a case the case list doesn't hold.");
            }

            return new MessageBytes(measuredCases);
        }

        public CaseBytes For(BenchmarkCase benchmarkCase)
        {
            return _cases[(benchmarkCase.Name, benchmarkCase.SpeedName)];
        }

        private sealed record Measured(int Warmup, int Steps, IReadOnlyList<MeasuredCase> Cases);

        private sealed record MeasuredCase(string Name, string Speed, double BytesPerStep, string Hash);
    }
}
