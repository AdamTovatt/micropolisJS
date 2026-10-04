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
    /// Drives a city with commands and steps, as <c>src/commandQueue.ts</c> does in the browser: commands queue as they
    /// arrive, from every player in the city, and apply in arrival order between steps, whenever
    /// <see cref="ApplyCommands"/> is called, whether or not the city is stepping. Each is stamped with the index of the
    /// step it precedes, and handed to the recorder in the order applied.
    /// </summary>
    internal sealed class CommandQueue
    {
        private readonly Simulation _city;
        private readonly CommandRecorder _recorder;
        private readonly Queue<ReceivedCommand> _received = new Queue<ReceivedCommand>();

        public CommandQueue(Simulation city, CommandRecorder recorder)
        {
            _city = city;
            _recorder = recorder;
        }

        /// <summary>
        /// The steps taken since the queue began, which is the index the next step has.
        /// </summary>
        public long StepIndex { get; private set; }

        public void Send(ReceivedCommand command)
        {
            _received.Enqueue(command);
        }

        /// <summary>
        /// One command at a time, each stamped as it applies, so a command that throws leaves those after it queued.
        /// </summary>
        public int ApplyCommands()
        {
            int applied = 0;

            while (_received.TryDequeue(out ReceivedCommand? next))
            {
                _recorder.Applied(StepIndex, next);
                _city.ApplyCommands([next]);
                applied++;
            }

            return applied;
        }

        public void Step()
        {
            _recorder.BeforeStep(StepIndex);
            _city.Step();
            StepIndex++;
        }
    }
}
