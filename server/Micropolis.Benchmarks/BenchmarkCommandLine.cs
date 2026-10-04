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

namespace Micropolis.Benchmarks
{
    /// <summary>
    /// What the benchmark is asked to do: write the case list, which the TypeScript measurement reads, or time the
    /// cases and write the report.
    /// </summary>
    internal enum BenchmarkCommand
    {
        Cases,
        Report,
    }

    /// <summary>
    /// The benchmark's arguments. <c>--message-bytes</c> names the file of the TypeScript measurement's figures, or
    /// <c>-</c> for standard input; without it the report has no bytes. Without <c>--output</c> the report goes to
    /// standard output.
    /// </summary>
    internal sealed record BenchmarkCommandLine(BenchmarkCommand Command, BenchmarkSettings Settings, string? MessageBytesPath,
                                                string? OutputPath)
    {
        public const string Usage =
            "Usage: Micropolis.Benchmarks cases [--warmup <steps>] [--steps <steps>]\n" +
            "       Micropolis.Benchmarks report [--warmup <steps>] [--steps <steps>] [--repeats <n>] " +
            "[--message-bytes <file> | -] [--output <file>]";

        /// <summary>
        /// The arguments parsed, or an <see cref="ArgumentException"/> naming what is wrong with them.
        /// </summary>
        public static BenchmarkCommandLine Parse(IReadOnlyList<string> args)
        {
            if (args.Count == 0)
            {
                throw new ArgumentException("No command given.");
            }

            BenchmarkCommand command = args[0] switch
            {
                "cases" => BenchmarkCommand.Cases,
                "report" => BenchmarkCommand.Report,
                _ => throw new ArgumentException($"No command named {args[0]}."),
            };

            Dictionary<string, string> options = new Dictionary<string, string>();

            for (int i = 1; i < args.Count; i += 2)
            {
                string name = args[i];
                bool allowed = name is "--warmup" or "--steps" ||
                               (command == BenchmarkCommand.Report && name is "--repeats" or "--message-bytes" or "--output");

                if (!allowed)
                {
                    throw new ArgumentException($"{args[0]} takes no option {name}.");
                }

                if (i + 1 == args.Count)
                {
                    throw new ArgumentException($"{name} needs a value.");
                }

                if (!options.TryAdd(name, args[i + 1]))
                {
                    throw new ArgumentException($"{name} is given twice.");
                }
            }

            BenchmarkSettings defaults = BenchmarkSettings.Default;
            BenchmarkSettings settings = new BenchmarkSettings(
                Warmup: Count(options, "--warmup", defaults.Warmup, minimum: 0),
                Steps: Count(options, "--steps", defaults.Steps, minimum: 1),
                Repeats: Count(options, "--repeats", defaults.Repeats, minimum: 1));

            return new BenchmarkCommandLine(command, settings, options.GetValueOrDefault("--message-bytes"),
                                            options.GetValueOrDefault("--output"));
        }

        private static int Count(Dictionary<string, string> options, string name, int defaultValue, int minimum)
        {
            if (!options.TryGetValue(name, out string? text))
            {
                return defaultValue;
            }

            if (!int.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out int value) || value < minimum)
            {
                throw new ArgumentException($"{name} takes a whole number of at least {minimum}, got {text}.");
            }

            return value;
        }
    }
}
