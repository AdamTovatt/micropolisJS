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
using System.Text.Json;
using System.Text.Json.Nodes;
using Micropolis.Rules;

namespace Micropolis.Server
{
    /// <summary>
    /// What one connection does in the cities, as protocol/README.md describes it: the city it is in, at most one, and
    /// its messages, handled in the order they came, each done before the next is read. So what follows a request that
    /// starts or joins a city reaches that city, and a connection has at most one piece of a city's work waiting.
    /// <see cref="CityLimits"/> bounds the cities, commands, saves and downloads of the client address it comes from.
    /// </summary>
    internal sealed class CitySession
    {
        private const string StoreFailed = "The server couldn't reach the store it keeps its cities in";

        // A save or a download is allowed again within seconds, at CityLimits.CopyInterval
        private const string TooManyCopies ="Too many saves and downloads were made from here. Try again in a few seconds.";

        private readonly CityConnection _connection;
        private readonly CityRegistry _registry;
        private readonly CityLimits _limits;
        // The client address the connection comes from, as the limits count it
        private readonly string _address;
        private readonly CursorLimit _cursorLimit;
        private readonly ILogger _logger;
        private LoadedCity? _city;
        // Whether the debug channel holds the cities the connection is in, as of its last hold or release: a hold before
        // a city starts applies from its first step
        private bool _held;

        public CitySession(CityConnection connection, CityRegistry registry, CityLimits limits, string address, TimeProvider time,
            ILogger logger)
        {
            _connection = connection;
            _registry = registry;
            _limits = limits;
            _address = address;
            _cursorLimit = new CursorLimit(time);
            _logger = logger;
        }

        /// <summary>
        /// Handles a message as it came. Text that is no message of the protocol's closes the connection.
        /// </summary>
        public async Task ReceiveAsync(string text)
        {
            ClientMessage message;

            try
            {
                message = ClientMessageReader.Read(text);
            }
            catch (JsonException exception)
            {
                Close($"not a message: {exception.Message}");
                return;
            }

            switch (message)
            {
                case CursorReport cursor:
                    await PassOnCursorAsync(cursor.Cursor);
                    break;

                case StartRequest start:
                    await StartAsync(start.Id, () => StartingCity.New(start.Name, start.Seed, (Level)start.Level));
                    break;

                case UploadRequest upload:
                    await StartAsync(upload.Id, () => StartingCity.FromSave(upload.Save));
                    break;

                case JoinRequest join:
                    await JoinAsync(join);
                    break;

                case CommandMessage command:
                    await SendAsync(command.Command, text.Length);
                    break;

                case QueryRequest query:
                    // A map preview is answered before any city has started, and in a city off its work, which generating a
                    // whole map would hold up for every player in it
                    if (_city is null || Queries.NeedsNoCity(query.Query))
                    {
                        _connection.Answer(query.Id, ProtocolJson.ToNode(Queries.AnswerWithoutCity(query.Query)));
                    }
                    else
                    {
                        await WaitForCityAsync(_city.AnswerAsync(_connection, query.Id, host => ProtocolJson.ToNode(host.Ask(query.Query))));
                    }

                    break;

                case SaveRequest save:
                    await SaveAsync(save.Id);
                    break;

                case DownloadRequest download:
                    await DownloadAsync(download.Id);
                    break;

                case CommandLogRequest commandLog:
                    await InCityAsync(commandLog.Id, host => ProtocolJson.ToNode(host.CommandLog()));
                    break;

                case ClientRequest debug:
                    await DebugAsync(debug);
                    break;

                default:
                    throw new InvalidOperationException($"No handling for {message.GetType().Name}.");
            }
        }

        /// <summary>
        /// Takes the connection out of the city it is in, as it closes.
        /// </summary>
        public async Task LeaveAsync()
        {
            if (_city is LoadedCity city)
            {
                _city = null;
                await _registry.LeaveAsync(_connection, city);
            }
        }

        // A new city or an upload: the city is built, and its name checked, before the city the connection is in is
        // left, so a start that fails leaves it there
        private async Task StartAsync(long requestId, Func<StartingCity> build)
        {
            // Counted before the save is read, which a start that fails costs as much as one that doesn't
            if (!_limits.TryStartCity(_address))
            {
                _connection.Fail(requestId, "Too many cities were started from here. Try again in a few minutes.");
                return;
            }

            StartingCity start;

            try
            {
                start = build();
            }
            catch (SaveFormatException exception)
            {
                _connection.Fail(requestId, exception.Message);
                return;
            }

            if (CityName.Rejection(start.Name) is string badName)
            {
                _connection.Fail(requestId, badName);
                return;
            }

            LoadedCity city;

            try
            {
                city = await _registry.StartCityAsync(start, _held);
            }
            catch (CityStoreException exception)
            {
                _logger.LogError(exception, "A city couldn't start");
                _connection.Fail(requestId, StoreFailed);
                return;
            }

            await MoveToAsync(city, requestId);
        }

        // The city is found or loaded before the city the connection is in is left, so a join that fails leaves it there
        private async Task JoinAsync(JoinRequest join)
        {
            // An id is checked to be one before it is quoted, so a hostile one can't make the reason long
            if (!CityId.IsOne(join.City))
            {
                _connection.Fail(join.Id, "That is not a city's id");
                return;
            }

            LoadedCity? city;

            try
            {
                city = await _registry.EnterAsync(join.City, _held);
            }
            catch (SaveFormatException exception)
            {
                _connection.Fail(join.Id, $"The city with the id {join.City} won't load: {exception.Message}");
                return;
            }
            catch (CityStoreException exception)
            {
                _logger.LogError(exception, "City {City} couldn't be read", join.City);
                _connection.Fail(join.Id, StoreFailed);
                return;
            }

            if (city is null)
            {
                _connection.Fail(join.Id, $"No city has the id {join.City}");
                return;
            }

            await MoveToAsync(city, join.Id);
        }

        // Leaves the city the connection is in, so nothing more of it is sent, then joins the city it has entered
        private async Task MoveToAsync(LoadedCity city, long requestId)
        {
            await LeaveAsync();

            try
            {
                await city.JoinAsync(new Joining(_connection, requestId, _held));
                _city = city;
            }
            catch (CityStoppedException)
            {
                // The city failed before the connection joined it
                await _registry.LeaveAsync(_connection, city);
                _connection.Fail(requestId, "The city failed");
            }
        }

        // A command message of this many characters. A command bigger than any the game sends is no command of a
        // player's, and commands faster than a player sends them are no player's either: neither reaches the city,
        // which would keep them in its log for as long as it is loaded and echo them to every player in their results.
        private async Task SendAsync(JsonNode? command, int characters)
        {
            if (_city is null)
            {
                Close("a command before joining a city");
                return;
            }

            if (CommandReader.BoundsRejection(command, _city.MapWidth, _city.MapHeight) is string tooBig)
            {
                Close(tooBig);
                return;
            }

            if (!_limits.TrySendCommand(_address, characters))
            {
                Close("commands faster than a player sends them");
                return;
            }

            string player = _connection.Player.Id;
            await WaitForCityAsync(_city.RunAsync(host => host.Send(player, command)));
        }

        // Keeps the city in the store, answering once it is kept. A save the store can't keep fails, and the city stays
        // loaded, so a later save keeps it.
        private Task SaveAsync(long requestId)
        {
            return CopyCityAsync(requestId, async city =>
            {
                try
                {
                    await _registry.SaveAsync(city);
                }
                catch (CityStoreException)
                {
                    // The registry logged it
                    _connection.Fail(requestId, StoreFailed);
                    return;
                }

                _connection.Answer(requestId, null);
            });
        }

        // Answers the city's saved game's text, for the player to keep as a file, and keeps it nowhere
        private Task DownloadAsync(long requestId)
        {
            return CopyCityAsync(requestId,
                                 city => city.AnswerAsync(_connection, requestId, host => JsonValue.Create(host.Save())));
        }

        // A hover box goes to the city's other players. One from a connection in no city, one no tool makes on the city's
        // map, and one past the connection's limit are dropped, and the connection kept: a box is worth no more than the
        // next one, which comes within seconds. A box dropped for not fitting isn't counted.
        private async Task PassOnCursorAsync(Cursor? cursor)
        {
            if (_city is null || (cursor is not null && !CursorBounds.Fits(cursor, _city.MapWidth, _city.MapHeight)) ||
                !_cursorLimit.TryCount())
            {
                return;
            }

            await WaitForCityAsync(_city.PassOnCursorAsync(_connection, cursor));
        }

        // The work, done in the city and answered with what it gives
        private Task InCityAsync(long requestId, Func<CityHost, JsonNode?> work)
        {
            return WithCityAsync(requestId, city => city.AnswerAsync(_connection, requestId, work));
        }

        // Does what the request asks of the city the connection is in, or fails it before any city has started
        private async Task WithCityAsync(long requestId, Func<LoadedCity, Task> request)
        {
            if (_city is null)
            {
                _connection.Fail(requestId, "No city has started");
                return;
            }

            await WaitForCityAsync(request(_city));
        }

        // Copies the whole city out, as a save or a download does, within the client address's limit on copies. One past
        // it fails and the connection stays: unlike a command, a copy comes from a player pressing a button.
        private Task CopyCityAsync(long requestId, Func<LoadedCity, Task> copy)
        {
            return WithCityAsync(requestId, city =>
            {
                if (!_limits.TryCopyCity(_address))
                {
                    _connection.Fail(requestId, TooManyCopies);
                    return Task.CompletedTask;
                }

                return copy(city);
            });
        }

        // The debug channel, which only a build with it answers. A hold or release before any city has started applies
        // to each the connection starts or joins: a held connection holds the city it joins, and a released one leaves
        // the city as others hold it or not.
        private async Task DebugAsync(ClientRequest request)
        {
            if (!DebugChannel.IsBuiltIn)
            {
                _connection.Fail(request.Id, "This server has no debug channel");
                return;
            }

            switch (request)
            {
                case HoldRequest or ReleaseRequest when _city is null:
                    _held = request is HoldRequest;
                    _connection.Answer(request.Id, null);
                    break;

                case HoldRequest hold:
                    _held = true;
                    await InCityAsync(hold.Id, host => Done(host.Hold));
                    break;

                case ReleaseRequest release:
                    _held = false;
                    await InCityAsync(release.Id, host => Done(host.Release));
                    break;

                case FlushRequest flush:
                    await InCityAsync(flush.Id, host => Done(host.Flush));
                    break;

                case AdvanceRequest advance:
                    await InCityAsync(advance.Id, host => ProtocolJson.ToNode(host.Advance(advance.Steps)));
                    break;

                case CityTimeRequest cityTime:
                    await InCityAsync(cityTime.Id, host => JsonValue.Create(host.CityTime()));
                    break;

                // The text alone, which reaches no store, so the end-to-end runner reads it as often as it checks the city
                case SavedGameRequest savedGame:
                    await InCityAsync(savedGame.Id, host => JsonValue.Create(host.Save()));
                    break;

                case TurnRequest turn:
                    await TurnAsync(turn);
                    break;

                default:
                    throw new InvalidOperationException($"No handling for {request.GetType().Name}.");
            }
        }

        private Task TurnAsync(TurnRequest turn)
        {
            return WithCityAsync(turn.Id, city =>
            {
                if (!city.RunsOnManualClock)
                {
                    _connection.Fail(turn.Id, "The city runs on the server's clock");
                    return Task.CompletedTask;
                }

                return city.TurnAsync(turn.Milliseconds, _connection, turn.Id);
            });
        }

        // A request whose answer is null, once it is done
        private static JsonNode? Done(Action work)
        {
            work();
            return null;
        }

        private static async Task WaitForCityAsync(Task work)
        {
            try
            {
                await work;
            }
            catch (CityStoppedException)
            {
                // A city that fails closes every connection in it, so its work left undone needs no answer
            }
        }

        private void Close(string reason)
        {
            _connection.Close(WebSocketCloseStatus.PolicyViolation, reason);
        }
    }
}
