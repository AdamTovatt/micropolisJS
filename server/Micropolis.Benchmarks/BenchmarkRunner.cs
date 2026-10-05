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

namespace Micropolis.Benchmarks
{
    /// <summary>
    /// Carries out a command line: times every case and measures its message bytes, then writes the report, naming
    /// each case on the progress writer as it starts.
    /// </summary>
    internal static class BenchmarkRunner
    {
        public static void Run(BenchmarkCommandLine commandLine, TextWriter output, TextWriter progress)
        {
            IReadOnlyList<BenchmarkCase> cases = BenchmarkCases.All();
            BenchmarkSettings settings = commandLine.Settings;
            List<BenchmarkRow> rows = new List<BenchmarkRow>();
            string? loadBefore = RunEnvironment.ReadLoadAverage();

            foreach (BenchmarkCase benchmarkCase in cases)
            {
                progress.WriteLine($"Timing {benchmarkCase.Name} at {benchmarkCase.SpeedName}");
                CaseMeasurement measurement = StepTimer.Measure(benchmarkCase, settings);
                CaseBytes bytes = MessageBytes.Measure(benchmarkCase, settings);
                CheckOneCity(benchmarkCase, measurement, bytes);
                rows.Add(new BenchmarkRow(benchmarkCase, measurement.Timing, bytes.BytesPerStep));
            }

            RunEnvironment environment = RunEnvironment.Describe(commandLine.OutputPath, loadBefore, RunEnvironment.ReadLoadAverage());
            string report = BenchmarkReport.Write(environment, settings, rows);

            if (commandLine.OutputPath is null)
            {
                output.Write(report);
            }
            else
            {
                File.WriteAllText(commandLine.OutputPath, report);
            }
        }

        /// <summary>
        /// Fails unless both figures are of one city: the city whose messages were measured must end where the timed
        /// city does, or building the messages changed the city.
        /// </summary>
        // Kept although CityStateMessagesTests also holds that building the messages leaves the city alone: issue #61
        // asks that the report's two figures be checked as of one city, on every case the report tables.
        internal static void CheckOneCity(BenchmarkCase benchmarkCase, CaseMeasurement measurement, CaseBytes bytes)
        {
            if (bytes.StateHash != measurement.StateHash)
            {
                throw new InvalidDataException(
                    $"{benchmarkCase.Name} at {benchmarkCase.SpeedName} ends at the state hash {measurement.StateHash} where it was timed, " +
                    $"but at {bytes.StateHash} where its message bytes were measured.");
            }
        }
    }
}
