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

using System.Net.WebSockets;
using System.Text.Json.Nodes;
using System.Threading.Channels;
using Micropolis.Rules;

namespace Micropolis.Server
{
    /// <summary>
    /// A city the server has loaded, and the connections of the players in it. Everything that touches the city is its
    /// work, which runs one piece at a time, in the order it was given: its loop's turns, every player's commands in the
    /// order the server received them, and the requests. Every player in it receives the same state messages. Work a
    /// player gives it is awaited, so a player has at most one piece of it waiting at a time.
    /// </summary>
    internal sealed class LoadedCity
    {
        private readonly Channel<Work> _work = Channel.CreateUnbounded<Work>(new UnboundedChannelOptions { SingleReader = true });
        private readonly List<CityConnection> _members = new List<CityConnection>();
        private readonly CancellationTokenSource _stopped = new CancellationTokenSource();
        private readonly ManualTicker? _manualTicker;
        private readonly CityHost _host;
        private readonly Task _working;

        /// <param name="failed">Called, once, when the city's work throws: the city is then in no state to save, and
        /// takes no more work.</param>
        public LoadedCity(string id, StartingCity start, CityClock clock, Action<LoadedCity, Exception> failed)
        {
            Id = id;
            MapWidth = start.City.Map.Width;
            MapHeight = start.City.Map.Height;
            ITicker ticker;

            if (clock.Manual)
            {
                _manualTicker = new ManualTicker();
                ticker = _manualTicker;
            }
            else
            {
                ticker = new TimerTicker(clock.Time, callback => Post(_ => callback()), _stopped.Token);
            }

            _host = new CityHost(start, ticker, Publish);
            _working = WorkAsync(failed);
            Post(host => host.Start());
        }

        /// <summary>
        /// The city's id, which any player joins it by.
        /// </summary>
        public string Id { get; }

        /// <summary>
        /// The size of the city's map, which never changes, so it is read outside the city's work.
        /// </summary>
        public int MapWidth { get; }

        public int MapHeight { get; }

        /// <summary>
        /// Whether the city runs on a clock only the debug channel moves.
        /// </summary>
        public bool RunsOnManualClock => _manualTicker is not null;

        /// <summary>
        /// Runs the work as the city's, and gives what it returned. It fails with a <see cref="CityStoppedException"/>
        /// when the city stops first, or fails doing it.
        /// </summary>
        public Task<T> RunAsync<T>(Func<CityHost, T> work)
        {
            TaskCompletionSource<T> result = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
            Work item = new Work(() => result.SetResult(work(_host)), exception => result.TrySetException(exception));

            if (!_work.Writer.TryWrite(item))
            {
                item.Abandon(new CityStoppedException("The city has stopped.", null));
            }

            return result.Task;
        }

        /// <summary>
        /// Runs the work as the city's, and finishes once it is done. It fails as <see cref="RunAsync{T}"/> does.
        /// </summary>
        public Task RunAsync(Action<CityHost> work)
        {
            return RunAsync(host =>
            {
                work(host);
                return true;
            });
        }

        /// <summary>
        /// Adds a player's connection, which is sent the whole state of the city, then the answer to its request.
        /// </summary>
        public Task JoinAsync(Joining joining)
        {
            return RunAsync(host =>
            {
                if (joining.Hold)
                {
                    host.Hold();
                }

                _members.Add(joining.Connection);
                joining.Connection.Send(ProtocolJson.Serialize(Batch(host.FullState())));
                joining.Connection.Answer(joining.RequestId, ProtocolJson.ToNode(Joined(host)));
            });
        }

        /// <summary>
        /// Removes a player's connection, after which nothing more of the city is sent to it.
        /// </summary>
        public Task LeaveAsync(CityConnection connection)
        {
            return RunAsync(_ => _members.Remove(connection));
        }

        /// <summary>
        /// Answers a player's request with what the work gives, after any state the work changed.
        /// </summary>
        public Task AnswerAsync(CityConnection connection, long requestId, Func<CityHost, JsonNode?> work)
        {
            return RunAsync(host => connection.Answer(requestId, work(host)));
        }

        /// <summary>
        /// Moves the debug channel's clock on, then takes a turn of the city's loop if one is due, then answers the
        /// request.
        /// </summary>
        public Task TurnAsync(double milliseconds, CityConnection connection, long requestId)
        {
            ManualTicker ticker = _manualTicker ?? throw new InvalidOperationException("The city runs on the server's clock.");

            return RunAsync(_ =>
            {
                ticker.Run(milliseconds);
                connection.Answer(requestId, null);
            });
        }

        /// <summary>
        /// Takes no more work, once what was given before is done.
        /// </summary>
        public async Task StopAsync()
        {
            _work.Writer.TryComplete();
            await _working;
            _stopped.Cancel();
        }

        // Work the city gives itself, such as its loop's turns, which no one waits on
        private void Post(Action<CityHost> work)
        {
            // Fails only once the city has stopped, when there is nothing left to do the work on
            _work.Writer.TryWrite(new Work(() => work(_host), _ => { }));
        }

        private CityJoined Joined(CityHost host)
        {
            return new CityJoined(Id, host.Name, host.Seed);
        }

        private void Publish(IReadOnlyList<StateMessage> messages)
        {
            string batch = ProtocolJson.Serialize(Batch(messages));
            _members.ForEach(member => member.Send(batch));
        }

        private static StateBatchMessage Batch(IReadOnlyList<StateMessage> messages)
        {
            return new StateBatchMessage(new JsonArray(messages.Select(message => (JsonNode?)ProtocolJson.ToNode(message)).ToArray()));
        }

        // Runs the work one piece at a time, off the thread of whoever gave it, until the city stops or its work throws
        private async Task WorkAsync(Action<LoadedCity, Exception> failed)
        {
            // Off the caller's thread, so the work never runs inside a request
            await Task.Yield();

            await foreach (Work work in _work.Reader.ReadAllAsync())
            {
                try
                {
                    work.Run();
                }
                catch (Exception exception)
                {
                    // What waits on the work that threw, or on the work left undone, hears why it never will be done
                    CityStoppedException stopped = new CityStoppedException("The city failed.", exception);
                    work.Abandon(stopped);
                    _members.ForEach(member => member.Close(WebSocketCloseStatus.InternalServerError, "the city failed"));
                    _members.Clear();
                    _work.Writer.TryComplete();

                    while (_work.Reader.TryRead(out Work? undone))
                    {
                        undone.Abandon(stopped);
                    }

                    failed(this, exception);
                    return;
                }
            }
        }

        // Work on the city, and what becomes of whoever waits on it when the city stops before doing it
        private sealed record Work(Action Run, Action<Exception> Abandon);
    }
}
