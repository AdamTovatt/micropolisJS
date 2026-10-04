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

using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Micropolis.Benchmarks
{
    /// <summary>
    /// What a report's figures were measured on: the commit, the machine, how loaded it was, and the runtime.
    /// </summary>
    internal sealed record RunEnvironment(string Commit, string Machine, string Load, string Runtime)
    {
        /// <summary>
        /// The environment of a report written to <paramref name="reportPath"/>, or to standard output when it is null,
        /// with the machine's load averages as the timing started and as it ended.
        /// </summary>
        public static RunEnvironment Describe(string? reportPath, string? loadBefore, string? loadAfter)
        {
            return new RunEnvironment(DescribeCommit(Git, RepositoryFiles.Root, reportPath), DescribeMachine(),
                                      DescribeLoad(loadBefore, loadAfter), DescribeRuntime());
        }

        /// <summary>
        /// The load averages over 1, 5 and 15 minutes, where Linux gives them, or null elsewhere.
        /// </summary>
        public static string? ReadLoadAverage()
        {
            const string loadAverage = "/proc/loadavg";

            if (!File.Exists(loadAverage))
            {
                return null;
            }

            return string.Join(", ", File.ReadAllText(loadAverage).Split(' ').Take(3));
        }

        internal static string DescribeLoad(string? before, string? after)
        {
            return before is null || after is null
                ? "not known on this platform"
                : $"{before} as the timing started, {after} as it ended";
        }

        /// <summary>
        /// The commit as the game's build ID names it, or unknown outside a git checkout, and whether the tree differs
        /// from it. The report itself, which regenerating it changes, never counts as a difference.
        /// </summary>
        internal static string DescribeCommit(Func<IReadOnlyList<string>, string?> git, string root, string? reportPath)
        {
            string? commit = git(["rev-parse", "--short=12", "HEAD"]);

            if (commit is null)
            {
                return "unknown";
            }

            return git(StatusArguments(root, reportPath)) switch
            {
                null => $"{commit}, whether the tree differs from it unknown",
                "" => commit,
                _ => $"{commit}, with uncommitted changes",
            };
        }

        /// <summary>
        /// The git status of the repository at <paramref name="root"/>, leaving out the report when it is written
        /// inside the repository: git refuses a path outside it.
        /// </summary>
        internal static IReadOnlyList<string> StatusArguments(string root, string? reportPath)
        {
            List<string> arguments = ["status", "--porcelain", "--", "."];

            if (reportPath is not null)
            {
                string relative = Path.GetRelativePath(root, Path.GetFullPath(reportPath));

                if (relative != ".." && !relative.StartsWith($"..{Path.DirectorySeparatorChar}", StringComparison.Ordinal) &&
                    !Path.IsPathRooted(relative))
                {
                    arguments.Add($":(exclude){relative.Replace(Path.DirectorySeparatorChar, '/')}");
                }
            }

            return arguments;
        }

        private static string DescribeMachine()
        {
            string machine = $"{RuntimeInformation.OSDescription}, {RuntimeInformation.OSArchitecture}, " +
                             $"{Environment.ProcessorCount} logical processors";
            string? model = ProcessorModel();

            return model is null ? machine : $"{model}, {machine}";
        }

        private static string DescribeRuntime()
        {
#if DEBUG
            const string configuration = "Debug";
#else
            const string configuration = "Release";
#endif
            return $"{RuntimeInformation.FrameworkDescription}, {configuration} build";
        }

        // The processor's model where Linux names it: x86 does, many Arm processors don't
        private static string? ProcessorModel()
        {
            const string cpuInfo = "/proc/cpuinfo";

            if (!File.Exists(cpuInfo))
            {
                return null;
            }

            string? line = File.ReadLines(cpuInfo).FirstOrDefault(line => line.StartsWith("model name", StringComparison.Ordinal));
            return line?[(line.IndexOf(':') + 1)..].Trim();
        }

        // Git's output in the repository, trimmed, or null when git fails or isn't there
        private static string? Git(IReadOnlyList<string> arguments)
        {
            ProcessStartInfo startInfo = new ProcessStartInfo("git")
            {
                WorkingDirectory = RepositoryFiles.Root,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };

            foreach (string argument in arguments)
            {
                startInfo.ArgumentList.Add(argument);
            }

            try
            {
                using Process git = Process.Start(startInfo)!;
                Task<string> error = git.StandardError.ReadToEndAsync();
                string output = git.StandardOutput.ReadToEnd();
                git.WaitForExit();
                error.Wait();

                return git.ExitCode == 0 ? output.Trim() : null;
            }
            catch (System.ComponentModel.Win32Exception)
            {
                // No git on the path
                return null;
            }
        }
    }
}
