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

using Micropolis.Rules;

namespace Micropolis.Headless
{
    /// <summary>
    /// The headless runner's command line, as <c>headless/cli.ts</c> runs it: runs a city from a seed or a fixture and
    /// prints its state hash, then the year, population and funds; replays a command log, counting its commands'
    /// outcomes and verifying its checkpoints; or writes every fixture's log (<see cref="FixtureLogs"/>).
    /// </summary>
    internal static class HeadlessProgram
    {
        public const int Passed = 0;

        // A run that failed, or a file or start it refused, which the message names
        public const int Failed = 1;

        // Arguments it can't run, shown with the usage
        public const int Misused = 2;

        public static int Run(IReadOnlyList<string> args, TextWriter output, TextWriter error, Func<string, string> readFile)
        {
            HeadlessCommand command;

            try
            {
                command = HeadlessCommandLine.Parse(args);
            }
            catch (ArgumentException exception)
            {
                error.WriteLine(exception.Message);
                error.WriteLine(HeadlessCommandLine.Usage);
                return Misused;
            }

            RunReport report;

            try
            {
                report = command is WriteFixtures
                    ? new RunReport(FixtureLogs.WriteAll(Fixtures.CommittedLogs).Select(path => $"wrote {path}").ToList(), null)
                    : HeadlessRunner.Run(command, readFile);
            }
            catch (Exception exception) when (exception is ArgumentException or InvalidDataException or StepsFailedException or
                                                  SaveFormatException or IOException or UnauthorizedAccessException)
            {
                // A start the run refuses, a file it can't read, a log or save that is malformed or doesn't match, or a
                // city that stalls: not a defect to trace
                error.WriteLine(exception.Message);
                return Failed;
            }

            foreach (string line in report.Lines)
            {
                output.WriteLine(line);
            }

            if (report.Failure != null)
            {
                error.WriteLine(report.Failure);
                return Failed;
            }

            return Passed;
        }
    }
}
