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
using System.Text.RegularExpressions;
using Micropolis.Rules;

namespace Micropolis.Headless
{
    /// <summary>
    /// What a run starts from: a map generated from a seed, or the named fixture, exactly one. A fixture's saved stream
    /// is authoritative unless <paramref name="Reseed"/> replaces it with the simulation stream of that seed, and its
    /// saved speed unless <paramref name="Speed"/> overrides it; a new city from a seed starts at medium, as in the
    /// browser.
    /// </summary>
    internal sealed record RunStart(uint? Seed, string? Fixture, uint? Reseed, Speed? Speed);

    internal abstract record HeadlessCommand;

    /// <summary>
    /// Runs a city for a number of steps.
    /// </summary>
    internal sealed record RunCity(RunStart Start, long Steps) : HeadlessCommand;

    /// <summary>
    /// Replays the command log in a file, checking its checkpoints.
    /// </summary>
    internal sealed record ReplayLog(string Path) : HeadlessCommand;

    /// <summary>
    /// Writes every fixture's log, with the checkpoints its replay reaches.
    /// </summary>
    internal sealed record WriteFixtures : HeadlessCommand;

    /// <summary>
    /// The headless runner's arguments, as <c>headless/commandLine.ts</c> takes them: <c>(--seed &lt;n&gt; | --fixture
    /// &lt;name&gt; [--reseed &lt;n&gt;]) [--speed &lt;speed&gt;] --steps &lt;n&gt;</c>, or <c>--log &lt;file&gt;</c>
    /// alone; and <c>--write-fixtures</c> alone.
    /// </summary>
    internal static partial class HeadlessCommandLine
    {
        public const string Usage =
            "Usage: Micropolis.Headless (--seed <n> | --fixture <name> [--reseed <n>]) [--speed slow|medium|fast] --steps <n>\n" +
            "       Micropolis.Headless --log <file>\n" +
            "       Micropolis.Headless --write-fixtures";

        private const string WriteFixturesOption = "--write-fixtures";

        private static readonly string[] ValueOptions = ["--seed", "--fixture", "--reseed", "--speed", "--steps", "--log"];

        // The speeds a run may be set to, by the names the command line takes
        private static readonly IReadOnlyDictionary<string, Speed> RunningSpeeds = new Dictionary<string, Speed>
        {
            ["slow"] = Speed.Slow,
            ["medium"] = Speed.Medium,
            ["fast"] = Speed.Fast,
        };

        /// <summary>
        /// The arguments parsed, or an <see cref="ArgumentException"/> naming what is wrong with them.
        /// </summary>
        public static HeadlessCommand Parse(IReadOnlyList<string> args)
        {
            Dictionary<string, string?> options = new Dictionary<string, string?>();

            for (int i = 0; i < args.Count; i++)
            {
                string name = args[i];
                string? value = null;

                if (ValueOptions.Contains(name))
                {
                    if (i + 1 == args.Count)
                    {
                        throw new ArgumentException($"{name} needs a value.");
                    }

                    value = args[++i];
                }
                else if (name != WriteFixturesOption)
                {
                    throw new ArgumentException($"No option {name}.");
                }

                if (!options.TryAdd(name, value))
                {
                    throw new ArgumentException($"{name} is given twice.");
                }
            }

            foreach (string alone in new[] { "--log", WriteFixturesOption })
            {
                if (options.ContainsKey(alone) && options.Count > 1)
                {
                    string others = string.Join(", ", options.Keys.Where(name => name != alone));
                    throw new ArgumentException($"{alone} takes no other option, got {others}.");
                }
            }

            if (options.ContainsKey(WriteFixturesOption))
            {
                return new WriteFixtures();
            }

            if (options.TryGetValue("--log", out string? log))
            {
                return new ReplayLog(log!);
            }

            Speed? speed = null;

            if (options.TryGetValue("--speed", out string? speedName))
            {
                speed = RunningSpeeds.TryGetValue(speedName!, out Speed running)
                    ? running
                    : throw new ArgumentException($"--speed is one of {string.Join(", ", RunningSpeeds.Keys)}, got {speedName}.");
            }

            long steps = WholeNumber(options, "--steps", long.MaxValue) ?? throw new ArgumentException("--steps is required.");

            return new RunCity(new RunStart((uint?)WholeNumber(options, "--seed", uint.MaxValue), options.GetValueOrDefault("--fixture"),
                                            (uint?)WholeNumber(options, "--reseed", uint.MaxValue), speed), steps);
        }

        // A whole number from 0 to max, which a cast to the option's own type then holds
        private static long? WholeNumber(IReadOnlyDictionary<string, string?> options, string name, long max)
        {
            if (!options.TryGetValue(name, out string? value))
            {
                return null;
            }

            if (!Digits().IsMatch(value!))
            {
                throw new ArgumentException($"{name} takes a whole number, got {value}.");
            }

            if (!long.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out long number) || number > max)
            {
                throw new ArgumentException($"{name} takes a whole number up to {max}, got {value}.");
            }

            return number;
        }

        [GeneratedRegex("^[0-9]+$")]
        private static partial Regex Digits();
    }
}
