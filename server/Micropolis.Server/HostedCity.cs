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

using System.Text.Json;
using System.Text.Json.Nodes;
using Micropolis.Rules;

namespace Micropolis.Server
{
    /// <summary>
    /// A city a host runs, and what it has sent of it, as <c>HostedCity</c> in <c>src/cityHost.ts</c>: it listens to
    /// the simulation's events and turns what changed into state messages.
    /// </summary>
    internal sealed class HostedCity
    {
        // A sprite's square on the sprite sheet, and where it is drawn from its position, by type, as each sprite's
        // traits in src/*Sprite.js give them to BaseSprite. The rules keep only what moves a sprite (SpriteTraits): how
        // one is drawn is the client's, and this table turns a sprite into the view the protocol sends it.
        private static readonly IReadOnlyDictionary<SpriteType, (int Width, int XOffset, int YOffset)> SpriteGeometry =
            new Dictionary<SpriteType, (int, int, int)>
            {
                [SpriteType.Train] = (32, 32, -16),
                [SpriteType.Helicopter] = (32, 32, -16),
                [SpriteType.Airplane] = (48, 24, 0),
                [SpriteType.Ship] = (48, 32, -16),
                [SpriteType.Monster] = (48, 24, 0),
                [SpriteType.Tornado] = (48, 24, 0),
                [SpriteType.Explosion] = (48, 24, 0),
            };

        // The map's raw values as last sent, row by row
        private int[] _tiles;
        // The messages sent only when they change, as last sent, as their wire text, by type
        private readonly Dictionary<string, string> _sent = new Dictionary<string, string>(StringComparer.Ordinal);
        // The latest status and demand since the last messages, which replace any before them
        private StatusRecord? _status;
        private DemandMessage? _demand;
        // The latest status and demand the city has published, which a player who joins is sent
        private StatusRecord? _lastStatus;
        private DemandMessage? _lastDemand;
        // The events since the last messages, in the order the simulation sent them: one overlay message per layer
        private List<StateMessage> _events = new List<StateMessage>();

        public HostedCity(string name, Simulation city, JsonObject logStart)
        {
            Name = name;
            Simulation = city;
            Recorder = new CommandRecorder(city, logStart);
            Queue = new CommandQueue(city, Recorder);
            _tiles = city.Map.RawValues();

            EventEmitter events = city.Events;
            events.AddEventListener(Messages.FRONT_END_MESSAGE, payload => _events.Add(News(payload)));
            events.AddEventListener(Messages.COMMAND_RESULT, payload => _events.Add(new CommandResultMessage(CommandResult(payload))));
            events.AddEventListener(Messages.BUDGET_REVIEW_DUE, _ =>
            {
                BudgetReviewsDue++;
                _events.Add(new BudgetReviewDueMessage());
            });
            events.AddEventListener(Messages.OVERLAY_UPDATED, payload =>
            {
                string layer = (string)payload!["layer"]!;

                if (!_events.Any(message => message is OverlayUpdatedMessage overlay && overlay.Layer == layer))
                {
                    _events.Add(new OverlayUpdatedMessage(layer));
                }
            });
            events.AddEventListener(Messages.CITY_STATUS_UPDATED, payload => _status = _lastStatus = Status(payload!.AsObject()));
            events.AddEventListener(Messages.VALVES_UPDATED, payload => _demand = _lastDemand = new DemandMessage(
                WholeNumber(payload!["residential"]), WholeNumber(payload["commercial"]), WholeNumber(payload["industrial"])));
        }

        public string Name { get; }

        public Simulation Simulation { get; }

        public CommandRecorder Recorder { get; }

        public CommandQueue Queue { get; }

        /// <summary>
        /// The year-end budget reviews that have fallen due since the city was loaded.
        /// </summary>
        public int BudgetReviewsDue { get; private set; }

        /// <summary>
        /// Takes the city as it stands as sent, so the first messages are what changes from here.
        /// </summary>
        public void MarkSent()
        {
            _tiles = Simulation.Map.RawValues();

            foreach (StateMessage message in Changing())
            {
                _sent[message.Type] = ProtocolJson.Serialize(message);
            }
        }

        /// <summary>
        /// The whole state, as a player who joins needs it: the whole map, the sprites, the date, the population and the
        /// records, then the latest status and demand published, if any has been. It is what was last sent, since the
        /// city changes only in turns, each of which sends what it changed.
        /// </summary>
        public IReadOnlyList<StateMessage> FullState()
        {
            List<StateMessage> messages = [new MapMessage(Simulation.Map.Width, Simulation.Map.Height, Simulation.Map.RawValues()), .. Changing()];

            if (_lastStatus is not null)
            {
                messages.Add(_lastStatus);
            }

            if (_lastDemand is not null)
            {
                messages.Add(_lastDemand);
            }

            return messages;
        }

        /// <summary>
        /// The state messages since the last call: the tiles that changed; the sprites, date, population and records
        /// that differ from those sent last; then the status and demand published since, and the events in the order
        /// they came.
        /// </summary>
        public IReadOnlyList<StateMessage> NewMessages()
        {
            List<StateMessage> messages = new List<StateMessage>();

            if (TilesMessage() is TilesMessage tiles)
            {
                messages.Add(tiles);
            }

            foreach (StateMessage message in Changing())
            {
                string text = ProtocolJson.Serialize(message);

                if (!_sent.TryGetValue(message.Type, out string? sent) || sent != text)
                {
                    _sent[message.Type] = text;
                    messages.Add(message);
                }
            }

            if (_status is not null)
            {
                messages.Add(_status);
                _status = null;
            }

            if (_demand is not null)
            {
                messages.Add(_demand);
                _demand = null;
            }

            messages.AddRange(_events);
            _events = new List<StateMessage>();
            return messages;
        }

        // The messages sent only when they change, in the order they go
        private IEnumerable<StateMessage> Changing()
        {
            (long month, long year) = Simulation.Date;

            yield return new SpritesMessage(Simulation.SpriteManager.GetLiveSprites().Select(View).ToList());
            yield return new DateMessage(month, year);
            yield return new PopulationMessage(Simulation.CityPopLast);
            yield return Simulation.EvaluationRecord();
            yield return Simulation.BudgetRecord();
            yield return Simulation.SettingsRecord();
        }

        // The tiles whose raw values changed since last sent, or null for none
        private TilesMessage? TilesMessage()
        {
            int[] values = Simulation.Map.RawValues();
            int width = Simulation.Map.Width;
            List<TileChange> changes = new List<TileChange>();

            for (int i = 0; i < values.Length; i++)
            {
                if (values[i] != _tiles[i])
                {
                    changes.Add(new TileChange(i % width, i / width, values[i]));
                }
            }

            _tiles = values;
            return changes.Count == 0 ? null : new TilesMessage(changes);
        }

        // A sprite as the client draws it: its position plus its type's drawing offset
        private static SpriteView View(Sprite sprite)
        {
            (int width, int xOffset, int yOffset) = SpriteGeometry[sprite.Type];
            return new SpriteView((int)sprite.Type, sprite.Frame, sprite.X + xOffset, sprite.Y + yOffset, width);
        }

        // The news as the client reads it, as newsMessage in src/cityHost.ts: a sprite to follow is named by its type,
        // of which the map holds at most one
        private static NewsMessage News(JsonNode? payload)
        {
            string subject = (string)payload!["subject"]!;

            if (payload["data"] is not JsonObject data)
            {
                return new NewsMessage(subject, null);
            }

            long x = WholeNumber(data["x"]);
            long y = WholeNumber(data["y"]);

            if (IsTrue(data["trackable"]))
            {
                return new NewsMessage(subject, new NewsPlace(x, y, null, true, (int)WholeNumber(data["sprite"])));
            }

            if (IsTrue(data["showable"]))
            {
                return new NewsMessage(subject, new NewsPlace(x, y, true, null, null));
            }

            return new NewsMessage(subject, new NewsPlace(x, y, null, null, null));
        }

        // A number an event carries, whatever type the rules built it from: a JsonValue converts only to the type it
        // holds, and the rules write a place's x as an int in one event and a long in another
        private static long WholeNumber(JsonNode? value)
        {
            return value is JsonValue number && number.GetValueKind() == JsonValueKind.Number
                ? number.Deserialize<long>()
                : throw new InvalidOperationException($"An event carries a whole number here, not {value?.ToJsonString() ?? "nothing"}.");
        }

        private static bool IsTrue(JsonNode? value)
        {
            return value is JsonValue flag && flag.GetValueKind() == JsonValueKind.True;
        }

        private static CommandResult CommandResult(JsonNode? payload)
        {
            JsonObject result = payload!.AsObject();
            Outcome outcome = ProtocolJson.TryParseName((string)result["outcome"]!, out Outcome named)
                ? named
                : throw new InvalidOperationException($"A command result's outcome is one of the protocol's, not {result["outcome"]}.");

            return new CommandResult((string)result["player"]!, result["command"]?.DeepClone(), outcome, (string?)result["reason"]);
        }

        private static StatusRecord Status(JsonObject status)
        {
            return new StatusRecord(
                WholeNumber(status["powerCapacity"]),
                WholeNumber(status["powerLoad"]),
                (bool)status["residentialCapped"]!,
                (bool)status["commercialCapped"]!,
                (bool)status["industrialCapped"]!,
                status["conditions"]!.AsArray().Select(condition => (string)condition!).ToList());
        }
    }
}
