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

namespace Micropolis.Server
{
    /// <summary>
    /// Records a city's session log as its command queue drives it, as <c>CommandRecorder</c> in
    /// <c>src/commandLog.ts</c> does in the browser, as a <see cref="CommandLog"/>: each command as it applies, and a
    /// checkpoint of the state hash just before each step that is a whole number of intervals in, step 0 included.
    /// </summary>
    internal sealed class CommandRecorder
    {
        private readonly Simulation _city;
        private readonly LogStart _start;
        private readonly List<LoggedCommand> _entries = new List<LoggedCommand>();
        private readonly List<Checkpoint> _checkpoints = new List<Checkpoint>();

        // The step the city has reached: the one after the last it took
        private long _reached;

        public CommandRecorder(Simulation city, LogStart start)
        {
            _city = city;
            _start = start;
        }

        public void Applied(long step, ReceivedCommand command)
        {
            _entries.Add(new LoggedCommand(step, command.Player, command.Command));
        }

        public void BeforeStep(long step)
        {
            if (step % CommandLog.CheckpointInterval == 0)
            {
                _checkpoints.Add(new Checkpoint(step, Hash()));
            }

            _reached = step + 1;
        }

        /// <summary>
        /// The log so far, ending with a checkpoint of the city now, at the step it has reached, which no step has yet
        /// been taken from.
        /// </summary>
        public CommandLog Log()
        {
            return new CommandLog(null, _start, [.. _entries], [.. _checkpoints, new Checkpoint(_reached, Hash())]);
        }

        private string Hash()
        {
            return StateHash.HashSavedState(_city.Save());
        }
    }
}
