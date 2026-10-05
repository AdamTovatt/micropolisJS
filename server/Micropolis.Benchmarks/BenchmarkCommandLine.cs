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

namespace Micropolis.Benchmarks
{
    /// <summary>
    /// The benchmark's arguments. Without <c>--output</c> the report goes to standard output.
    /// </summary>
    internal sealed record BenchmarkCommandLine(BenchmarkSettings Settings, string? OutputPath)
    {
        public const string Usage =
            "Usage: Micropolis.Benchmarks [--warmup <steps>] [--steps <steps>] [--repeats <n>] [--output <file>]";

        /// <summary>
        /// The arguments parsed, or an <see cref="ArgumentException"/> naming what is wrong with them.
        /// </summary>
        public static BenchmarkCommandLine Parse(IReadOnlyList<string> args)
        {
            Dictionary<string, string> options = new Dictionary<string, string>();

            for (int i = 0; i < args.Count; i += 2)
            {
                string name = args[i];

                if (name is not ("--warmup" or "--steps" or "--repeats" or "--output"))
                {
                    throw new ArgumentException($"No option named {name}.");
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

            return new BenchmarkCommandLine(settings, options.GetValueOrDefault("--output"));
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
