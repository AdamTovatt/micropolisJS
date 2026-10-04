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

namespace Micropolis.Rules
{
    /// <summary>
    /// The command log's format, which <c>docs/command-log.md</c> specifies and <c>src/commandLog.ts</c> writes and
    /// reads in the browser: what every C# writer and reader of a log shares.
    /// </summary>
    public static class CommandLogFormat
    {
        /// <summary>
        /// The format's version, a log's <c>formatVersion</c>.
        /// </summary>
        public const int Version = 1;

        /// <summary>
        /// A recorder's checkpoint every this many steps, a minute of play, as <c>CHECKPOINT_INTERVAL</c>.
        /// </summary>
        public const int CheckpointInterval = 3600;
    }
}
