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
        // The last hover box each connection passed on, while it was one and not null
        private readonly Dictionary<CityConnection, Cursor> _showingCursors = new Dictionary<CityConnection, Cursor>();
        // The box last passed on for each player whose box shows, by their id, which a connection that joins is sent
        private readonly Dictionary<string, Cursor> _passedOnCursors = new Dictionary<string, Cursor>();
        private readonly CancellationTokenSource _stopped = new CancellationTokenSource();
        private readonly ManualTicker? _manualTicker;
        private readonly CityHost _host;
        private readonly Task _working;
        // The keeping of the last save taken, which the next waits for. Only the city's work touches it.
        private Task _keeping = Task.CompletedTask;
        // The host's change count as of the last save kept, or of its loading, when the store held the city as it loaded.
        // Only the city's work touches it.
        private long _keptChangeCount;

        /// <param name="held">Whether the debug channel of the connection the city loads for holds it: it is then held
        /// from before its first turn, so it takes no step before that connection joins it.</param>
        /// <param name="failed">Called, once, when the city's work throws: the city is then in no state to save, and
        /// takes no more work.</param>
        public LoadedCity(string id, StartingCity start, ServerClock clock, bool held, Action<LoadedCity, Exception> failed)
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
            // Before the city's work runs, so before any turn of its loop can
            if (held)
            {
                _host.Hold();
            }

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
        /// Takes the city's save as its work, and hands it to keep once every save taken before has been kept or has
        /// failed to be, so the saves are kept in the order they were taken. The city's work only takes the save, and
        /// never waits on its keeping. It finishes once keep has, and fails as keep does, or as <see cref="RunAsync{T}"/>
        /// does when the city stops before taking the save.
        /// </summary>
        /// <param name="keep">Keeps the save in the store: once it has, the city counts as unchanged until it changes
        /// again.</param>
        public async Task SaveAsync(Func<string, Task> keep)
        {
            Task kept = await RunAsync(host => TakeSave(host, keep));
            await kept;
        }

        /// <summary>
        /// Saves the city as <see cref="SaveAsync"/> does, but only when it has taken a step or applied a command since
        /// the last save kept, or since it loaded if none has been, and no save taken before is still being kept. A save
        /// still being kept leaves the store behind until it is, and taking another behind it would only queue up saves
        /// while the store is slow, so the next save brings the store up to date instead.
        /// </summary>
        public async Task SaveIfChangedAsync(Func<string, Task> keep)
        {
            Task? kept = await RunAsync<Task?>(host => _keeping.IsCompleted && host.ChangeCount != _keptChangeCount ? TakeSave(host, keep) : null);

            if (kept is not null)
            {
                await kept;
            }
        }

        /// <summary>
        /// Adds a player's connection, which is sent the whole state of the city and the other players' hover boxes
        /// showing in it, then the answer to its request.
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
                joining.Connection.Send(ProtocolJson.Serialize(StateBatchMessage.Of(host.FullState())));

                foreach ((string player, Cursor cursor) in _passedOnCursors)
                {
                    if (player != joining.Connection.Player.Id)
                    {
                        joining.Connection.Send(ProtocolJson.Serialize(new CursorMessage(player, cursor)));
                    }
                }

                joining.Connection.Answer(joining.RequestId, ProtocolJson.ToNode(Joined(host)));
            });
        }

        /// <summary>
        /// Removes a player's connection, after which nothing more of the city is sent to it, and takes its hover box
        /// away, as a null from it would.
        /// </summary>
        public Task LeaveAsync(CityConnection connection)
        {
            return RunAsync(_ =>
            {
                _members.Remove(connection);
                PassOnCursor(connection, null);
            });
        }

        /// <summary>
        /// Passes the hover box a player's connection sent on to the city's other players, and to nothing else: the city's
        /// host never sees it. It is the city's work only so that it reaches the players in the city as it is then.
        /// </summary>
        public Task PassOnCursorAsync(CityConnection from, Cursor? cursor)
        {
            return RunAsync(_ => PassOnCursor(from, cursor));
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

        // Takes the save, as the city's work, to keep after the one taken before it
        private Task TakeSave(CityHost host, Func<string, Task> keep)
        {
            _keeping = KeepAfterAsync(_keeping, host.Save(), host.ChangeCount, keep);
            return _keeping;
        }

        // Keeps the save after the one taken before it, off the city's work: a store's asynchronous calls may run as
        // they are made, as SQLite's do. One taken before that failed to be kept doesn't hold this newer one back. Once
        // kept, the city counts as unchanged since the save's change count, which the city's work learns before any
        // later save's keeping can finish, so in the order the saves were taken.
        private async Task KeepAfterAsync(Task before, string savedGame, long changeCount, Func<string, Task> keep)
        {
            await Task.Yield();
            await before.ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
            await keep(savedGame);
            Post(_ => _keptChangeCount = changeCount);
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

        // A player has one box on the wire, however many connections they have in the city. A null for a connection whose
        // box isn't showing passes on nothing, so only a box that showed is taken away, and a null for one while another
        // of the player's connections shows a box passes on that box instead. A player's own connections aren't sent
        // their box, which a browser shows only for the others.
        private void PassOnCursor(CityConnection from, Cursor? cursor)
        {
            if (cursor is not null)
            {
                _showingCursors[from] = cursor;
            }
            else if (!_showingCursors.Remove(from))
            {
                return;
            }
            else
            {
                cursor = _showingCursors.Where(showing => showing.Key.Player.Id == from.Player.Id)
                    .Select(showing => (Cursor?)showing.Value).FirstOrDefault();
            }

            if (cursor is null)
            {
                _passedOnCursors.Remove(from.Player.Id);
            }
            else
            {
                _passedOnCursors[from.Player.Id] = cursor;
            }

            string message = ProtocolJson.Serialize(new CursorMessage(from.Player.Id, cursor));

            foreach (CityConnection member in _members)
            {
                if (member.Player.Id != from.Player.Id)
                {
                    member.Send(message);
                }
            }
        }

        private void Publish(IReadOnlyList<StateMessage> messages)
        {
            string batch = ProtocolJson.Serialize(StateBatchMessage.Of(messages));
            _members.ForEach(member => member.Send(batch));
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
