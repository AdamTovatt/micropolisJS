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

using System.Text.Json.Nodes;
using Micropolis.Rules;

namespace Micropolis.Server
{
    /// <summary>
    /// One city on the server: the simulation, the queue every player's commands apply through, the city's command log,
    /// and the step driver that steps it in real time. It runs its own loop, and hands the state messages each turn
    /// produced to publish, after the turn's steps, as the rules' <see cref="CityStateMessages"/> builds them. It is not
    /// thread-safe: everything it does is its city's work, which runs one piece at a time.
    /// </summary>
    internal sealed class CityHost
    {
        private readonly Action<IReadOnlyList<StateMessage>> _publish;
        private readonly ITicker _ticker;
        private readonly StepDriver _driver = new StepDriver();
        private readonly Simulation _city;
        private readonly CommandRecorder _recorder;
        private readonly CommandQueue _queue;
        private readonly CityStateMessages _messages;
        // The year-end budget reviews that have fallen due since the city was loaded
        private int _budgetReviewsDue;
        // Whether a turn of the loop is due, rather than the loop waiting to be woken
        private bool _turnDue;

        /// <param name="publish">Takes each non-empty list of state messages, in the order the host produced them.</param>
        public CityHost(StartingCity start, ITicker ticker, Action<IReadOnlyList<StateMessage>> publish)
        {
            Name = start.Name;
            _city = start.City;
            _recorder = new CommandRecorder(_city, start.LogStart);
            _queue = new CommandQueue(_city, _recorder);
            _messages = new CityStateMessages(_city);
            _city.Events.AddEventListener(RulesEvents.BudgetReviewDue, () => _budgetReviewsDue++);
            _ticker = ticker;
            _publish = publish;
        }

        public string Name { get; }

        public uint Seed => _city.Seed;

        /// <summary>
        /// How many steps the city has taken and commands it has applied, which only grows: a save taken at one count
        /// holds every change up to it, and a city whose count still stands there hasn't changed since. A command the
        /// rules reject counts too, though it changes nothing: the count says the city may have changed, and an extra
        /// save of one that hasn't is harmless.
        /// </summary>
        public long ChangeCount { get; private set; }

        /// <summary>
        /// Starts the loop.
        /// </summary>
        public void Start()
        {
            Wake();
        }

        /// <summary>
        /// The whole state for a player who joins: the whole map, the sprites, the date, the population and the records,
        /// then the latest status and demand the city has published, if it has.
        /// </summary>
        public IReadOnlyList<StateMessage> FullState()
        {
            return _messages.FullState();
        }

        /// <summary>
        /// Queues the command, from any player, to apply at the next turn.
        /// </summary>
        public void Send(string player, JsonNode? command)
        {
            _queue.Send(new ReceivedCommand(player, command));
            Wake();
        }

        public QueryAnswer Ask(JsonNode? query)
        {
            return _city.AnswerQuery(query);
        }

        /// <summary>
        /// The saved game's text: the city's name beside what the simulation saves, stamped with the save's version.
        /// </summary>
        public string Save()
        {
            return SavedGame.Write(Name, _city);
        }

        public SessionLog CommandLog()
        {
            return new SessionLog(_recorder.Log().ToJson(), _queue.StepIndex);
        }

        // The debug channel (CityDriver in src/citySource.ts)

        public void Hold()
        {
            _driver.Hold();
        }

        public void Release()
        {
            _driver.Release();
            Wake();
        }

        public void Flush()
        {
            ApplyCommands();
            SendState();
        }

        /// <summary>
        /// Applies the commands sent so far, then takes this many steps at the city's own speed. It fails, saying why,
        /// when the steps are not a whole number, the driver is not held, the city doesn't step, or city time doesn't
        /// advance as far as the steps imply. What else the rules throw on the way fails the city, as it would on the
        /// server's clock.
        /// </summary>
        public AdvanceResult Advance(double steps)
        {
            long taken = 0;
            bool budgetReviewDue = false;

            try
            {
                // Before anything is applied, so a call refused changes nothing
                long count = WholeSteps(steps);

                if (!_driver.IsHeld)
                {
                    throw new StepsFailedException("Advance needs the driver held, or the driver's steps would land at times of its own");
                }

                // Before the check that the city steps: the commands may be the Pause button's
                ApplyCommands();

                if (_city.IsPaused)
                {
                    throw new StepsFailedException("The city is not stepping: it is paused");
                }

                int reviewsBefore = _budgetReviewsDue;

                try
                {
                    CityTimeModel.TakeSteps(_city, count, () =>
                    {
                        Step();
                        taken++;
                    });
                }
                finally
                {
                    budgetReviewDue = _budgetReviewsDue > reviewsBefore;
                }

                return new AdvanceResult(taken, budgetReviewDue, null);
            }
            catch (StepsFailedException exception)
            {
                return new AdvanceResult(taken, budgetReviewDue, exception.Message);
            }
            finally
            {
                SendState();
            }
        }

        public long CityTime()
        {
            return _city.CityTime;
        }

        // One turn of the host's loop, which runs for as long as the ticker calls back: the commands sent since the
        // last turn, then the steps due by now, then the state they changed. A held driver leaves the commands and the
        // steps to the debug channel. While the city is paused, the loop waits rather than turn for nothing: a
        // command or a release wakes it.
        private void Loop()
        {
            _turnDue = false;
            Turn(_ticker.Now());

            if (!_driver.IsHeld && !_city.IsPaused)
            {
                Wake();
            }
        }

        // Has the loop take a turn soon, unless one is already due
        private void Wake()
        {
            if (!_turnDue)
            {
                _turnDue = true;
                _ticker.Later(Loop);
            }
        }

        private void Turn(double now)
        {
            bool changed = false;

            if (!_driver.IsHeld)
            {
                changed = ApplyCommands() > 0;
            }

            _driver.Run(now, () => !_city.IsPaused, () =>
            {
                Step();
                changed = true;
            });

            if (changed)
            {
                SendState();
            }
        }

        // The commands sent since they last applied, each counted among the city's changes
        private int ApplyCommands()
        {
            int applied = _queue.ApplyCommands();
            ChangeCount += applied;
            return applied;
        }

        private void Step()
        {
            _queue.Step();
            ChangeCount++;
        }

        // The steps a request asks for, which arrive as any JSON number, as a count to take
        private static long WholeSteps(double steps)
        {
            if (!double.IsInteger(steps) || steps < 0)
            {
                throw new StepsFailedException($"Steps are taken in whole numbers from 0, got {CanonicalJson.FormatNumber(steps)}");
            }

            return (long)steps;
        }

        private void SendState()
        {
            IReadOnlyList<StateMessage> messages = _messages.NewMessages();

            if (messages.Count > 0)
            {
                _publish(messages);
            }
        }
    }
}
