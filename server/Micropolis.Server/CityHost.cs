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
    /// One city on the server, as <c>src/cityHost.ts</c> hosts one in the browser: the simulation, the queue every
    /// player's commands apply through, the city's command log, and the step driver that steps it in real time. It runs
    /// its own loop, and hands the state messages each turn produced to publish, after the turn's steps. It is not
    /// thread-safe: everything it does is its city's work, which runs one piece at a time.
    /// </summary>
    internal sealed class CityHost
    {
        private readonly Action<IReadOnlyList<StateMessage>> _publish;
        private readonly ITicker _ticker;
        private readonly StepDriver _driver = new StepDriver();
        private readonly HostedCity _city;
        // Whether a turn of the loop is due, rather than the loop waiting to be woken
        private bool _turnDue;

        /// <param name="publish">Takes each non-empty list of state messages, in the order the host produced them.</param>
        public CityHost(StartingCity start, ITicker ticker, Action<IReadOnlyList<StateMessage>> publish)
        {
            _city = new HostedCity(start.Name, start.City, start.LogStart);
            _ticker = ticker;
            _publish = publish;
        }

        public string Name => _city.Name;

        public uint Seed => _city.Simulation.Seed;

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
            return _city.FullState();
        }

        /// <summary>
        /// Queues the command, from any player, to apply at the next turn.
        /// </summary>
        public void Send(string player, JsonNode? command)
        {
            _city.Queue.Send(new ReceivedCommand(player, command));
            Wake();
        }

        public QueryAnswer Ask(JsonNode? query)
        {
            return _city.Simulation.AnswerQuery(query);
        }

        /// <summary>
        /// The saved game's text: the city's name beside what the simulation saves, stamped with the save's version.
        /// </summary>
        public string Save()
        {
            return SavedGame.Write(_city.Name, _city.Simulation);
        }

        public SessionLog CommandLog()
        {
            return new SessionLog(_city.Recorder.Log(), _city.Queue.StepIndex, null);
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
            _city.Queue.ApplyCommands();
            SendState();
        }

        /// <summary>
        /// Applies the commands sent so far, then takes this many steps at the city's own speed, as <c>advance</c> in
        /// <c>src/cityHost.ts</c>. It fails, saying why, when the steps are not a whole number, the driver is not held,
        /// the city doesn't step, or city time doesn't advance as far as the steps imply. What else the rules throw on
        /// the way fails the city, as it would on the server's clock.
        /// </summary>
        public AdvanceResult Advance(double steps)
        {
            long taken = 0;
            bool budgetReviewDue = false;

            try
            {
                // Before anything is applied, so a call refused changes nothing
                CityTimeModel.CheckStepCount(steps);

                if (!_driver.IsHeld)
                {
                    throw new StepsFailedException("Advance needs the driver held, or the driver's steps would land at times of its own");
                }

                // Before the check that the city steps: the commands may be the Pause button's
                _city.Queue.ApplyCommands();

                if (NotSteppingReason() is string notStepping)
                {
                    throw new StepsFailedException($"The city is not stepping: {notStepping}");
                }

                int reviewsBefore = _city.BudgetReviewsDue;

                try
                {
                    CityTimeModel.TakeSteps(_city.Simulation, steps, () =>
                    {
                        _city.Queue.Step();
                        taken++;
                    });
                }
                finally
                {
                    budgetReviewDue = _city.BudgetReviewsDue > reviewsBefore;
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
            return _city.Simulation.CityTime;
        }

        // One turn of the host's loop, which runs for as long as the ticker calls back: the commands sent since the
        // last turn, then the steps due by now, then the state they changed. A held driver leaves the commands and the
        // steps to the debug channel. While the city isn't stepping, the loop waits rather than turn for nothing: a
        // command or a release wakes it.
        private void Loop()
        {
            _turnDue = false;
            Turn(_ticker.Now());

            if (!_driver.IsHeld && NotSteppingReason() is null)
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
                changed = _city.Queue.ApplyCommands() > 0;
            }

            _driver.Run(now, () => NotSteppingReason() is null, () =>
            {
                _city.Queue.Step();
                changed = true;
            });

            if (changed)
            {
                SendState();
            }
        }

        // Why the city isn't stepping, or null when it is. A shared city steps unless it is paused: no one player's view
        // of it holds it.
        private string? NotSteppingReason()
        {
            return _city.Simulation.IsPaused ? "it is paused" : null;
        }

        private void SendState()
        {
            IReadOnlyList<StateMessage> messages = _city.NewMessages();

            if (messages.Count > 0)
            {
                _publish(messages);
            }
        }
    }
}
