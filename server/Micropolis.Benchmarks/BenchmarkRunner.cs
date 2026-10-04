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

namespace Micropolis.Benchmarks
{
    /// <summary>
    /// Carries out a command line: writes the case list, or times every case and writes the report, naming each case
    /// on the progress writer as it starts.
    /// </summary>
    internal static class BenchmarkRunner
    {
        public static void Run(BenchmarkCommandLine commandLine, TextReader input, TextWriter output, TextWriter progress)
        {
            IReadOnlyList<BenchmarkCase> cases = BenchmarkCases.All();
            BenchmarkSettings settings = commandLine.Settings;

            if (commandLine.Command == BenchmarkCommand.Cases)
            {
                output.WriteLine(BenchmarkCases.ToJson(cases, settings));
                return;
            }

            MessageBytes? messageBytes = commandLine.MessageBytesPath switch
            {
                null => null,
                "-" => MessageBytes.Parse(input.ReadToEnd(), cases, settings),
                string path => MessageBytes.Parse(File.ReadAllText(path), cases, settings),
            };

            List<BenchmarkRow> rows = new List<BenchmarkRow>();
            string? loadBefore = RunEnvironment.ReadLoadAverage();

            foreach (BenchmarkCase benchmarkCase in cases)
            {
                progress.WriteLine($"Timing {benchmarkCase.Name} at {benchmarkCase.SpeedName}");
                CaseMeasurement measurement = StepTimer.Measure(benchmarkCase, settings);
                CaseBytes? bytes = messageBytes?.For(benchmarkCase);

                // Both figures must be of one city: a city that diverged from the TypeScript's would also be a port
                // defect
                if (bytes is not null && bytes.StateHash != measurement.StateHash)
                {
                    throw new InvalidDataException(
                        $"{benchmarkCase.Name} at {benchmarkCase.SpeedName} ends at the state hash {measurement.StateHash} in C#, " +
                        $"but at {bytes.StateHash} where its message bytes were measured.");
                }

                rows.Add(new BenchmarkRow(benchmarkCase, measurement.Timing, bytes?.BytesPerStep));
            }

            RunEnvironment environment = RunEnvironment.Describe(commandLine.OutputPath, loadBefore, RunEnvironment.ReadLoadAverage());
            string report = BenchmarkReport.Write(environment, settings, rows, messageBytes is not null);

            if (commandLine.OutputPath is null)
            {
                output.Write(report);
            }
            else
            {
                File.WriteAllText(commandLine.OutputPath, report);
            }
        }
    }
}
