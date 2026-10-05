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

using Micropolis.Conformance;

namespace Micropolis.Headless
{
    /// <summary>
    /// The conformance files the fixture tool writes from the fixtures' saves, beside the logs, the saves, the events
    /// and the migrated saves: <c>commands.json</c> (<see cref="CommandCasesFile"/>), <c>queries.json</c>
    /// (<see cref="QueryCasesFile"/>), <c>speedGate.json</c> (<see cref="SpeedGateFile"/>), <c>maps.json</c>
    /// (<see cref="MapsFile"/>), <c>helpers.json</c> (<see cref="HelpersFile"/>), <c>runs.json</c>
    /// (<see cref="RunsFile"/>), <c>ruleConstants.json</c> (<see cref="RuleConstantsFile"/>) and
    /// <c>stationCover.json</c> (<see cref="StationCoverFile"/>).
    /// </summary>
    internal static class ConformanceFiles
    {
        /// <summary>
        /// Every file, by the path in <paramref name="directories"/> it is written to, from the fixtures'
        /// <paramref name="saves"/>.
        /// </summary>
        public static IReadOnlyList<(string Path, string Text)> Files(ConformanceDirectories directories, IReadOnlyList<FixtureSave> saves)
        {
            return
            [
                (directories.File(CommandCasesFile.FileName), CommandCasesFile.Write(saves)),
                (directories.File(QueryCasesFile.FileName), QueryCasesFile.Write(saves)),
                (directories.File(SpeedGateFile.FileName), SpeedGateFile.Write(saves)),
                (directories.File(MapsFile.FileName), MapsFile.Write()),
                (directories.File(HelpersFile.FileName), HelpersFile.Write(saves)),
                (directories.File(RunsFile.FileName), RunsFile.Write(saves)),
                (directories.File(RuleConstantsFile.FileName), RuleConstantsFile.Write()),
                (directories.File(StationCoverFile.FileName), StationCoverFile.Write()),
            ];
        }
    }
}
