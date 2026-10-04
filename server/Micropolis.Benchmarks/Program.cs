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
using Micropolis.Benchmarks;

BenchmarkCommandLine commandLine;

try
{
    commandLine = BenchmarkCommandLine.Parse(args);
}
catch (ArgumentException exception)
{
    Console.Error.WriteLine(exception.Message);
    Console.Error.WriteLine(BenchmarkCommandLine.Usage);
    return 2;
}

try
{
    BenchmarkRunner.Run(commandLine, Console.Out, Console.Error);
}
catch (Exception exception) when (exception is InvalidDataException or JsonException or IOException)
{
    // A file the run reads or writes is missing or malformed, which its message names: not a defect to trace
    Console.Error.WriteLine(exception.Message);
    return 1;
}

return 0;
