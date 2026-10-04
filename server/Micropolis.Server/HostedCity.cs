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
    /// A city a host runs: the simulation, the queue and log of its commands, and the budget reviews due, the half of
    /// <c>HostedCity</c> in <c>src/cityHost.ts</c> that runs the city. The other half, which builds the state messages
    /// it sends, is the rules' <see cref="CityStateMessages"/>.
    /// </summary>
    internal sealed class HostedCity
    {
        private readonly CityStateMessages _messages;

        public HostedCity(string name, Simulation city, LogStart logStart)
        {
            Name = name;
            Simulation = city;
            Recorder = new CommandRecorder(city, logStart);
            Queue = new CommandQueue(city, Recorder);
            _messages = new CityStateMessages(city);
            city.Events.AddEventListener(Messages.BUDGET_REVIEW_DUE, _ => BudgetReviewsDue++);
        }

        public string Name { get; }

        public Simulation Simulation { get; }

        public CommandRecorder Recorder { get; }

        public CommandQueue Queue { get; }

        /// <summary>
        /// The year-end budget reviews that have fallen due since the city was loaded.
        /// </summary>
        public int BudgetReviewsDue { get; private set; }

        /// <inheritdoc cref="CityStateMessages.FullState"/>
        public IReadOnlyList<StateMessage> FullState()
        {
            return _messages.FullState();
        }

        /// <inheritdoc cref="CityStateMessages.NewMessages"/>
        public IReadOnlyList<StateMessage> NewMessages()
        {
            return _messages.NewMessages();
        }
    }
}
