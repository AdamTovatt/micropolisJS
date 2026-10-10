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

using System.Diagnostics.CodeAnalysis;

namespace Micropolis.Rules
{
    /// <summary>
    /// The state messages a city sends, and what it has sent: the diffing half of a hosted city, which listens to the
    /// simulation's events and turns what changed into state messages.
    /// Every player in a city is sent the same messages, so a city has one. Building them never changes the city.
    /// </summary>
    public sealed class CityStateMessages
    {
        // A sprite's square on the sprite sheet, and where it is drawn from its position, by type, as the original's
        // initSprite gives them: the protocol's view of a sprite, which goes with the messages. The simulation keeps
        // only what moves a sprite (SpriteTraits).
        private static readonly IReadOnlyDictionary<SpriteType, (int Width, int XOffset, int YOffset)> SpriteGeometry =
            new Dictionary<SpriteType, (int, int, int)>
            {
                [SpriteType.Helicopter] = (32, 32, -16),
                [SpriteType.Airplane] = (48, 24, 0),
                [SpriteType.Ship] = (48, 32, -16),
                [SpriteType.Monster] = (48, 24, 0),
                [SpriteType.Tornado] = (48, 24, 0),
                [SpriteType.Explosion] = (48, 24, 0),
            };

        private readonly Simulation _city;
        // The map's raw values as last sent, row by row
        private int[] _tiles;
        // Each tile's walkway as last sent, row by row
        private int[] _walkways;
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
        // The runs by road, the rides and the walks offered since the last messages, each in the order they were offered
        private List<Trip> _runs = new List<Trip>();
        private List<Ride> _rides = new List<Ride>();
        private List<Trip> _walks = new List<Trip>();

        /// <summary>
        /// Takes the city as it stands as sent, so the first new messages are what changes from here: a player who
        /// joins is sent the whole city.
        /// </summary>
        public CityStateMessages(Simulation city)
        {
            _city = city;
            MarkSent();

            EventEmitter events = city.Events;
            // The news, the overlays, the status and the demand are the messages the client is sent, as the rules emit them
            events.AddEventListener(RulesEvents.FrontEndMessage, news => _events.Add(news));
            events.AddEventListener(RulesEvents.CommandResult, result => _events.Add(new CommandResultMessage(result)));
            events.AddEventListener(RulesEvents.BudgetReviewDue, () => _events.Add(new BudgetReviewDueMessage()));
            events.AddEventListener(RulesEvents.OverlayUpdated, updated =>
            {
                if (!_events.Any(message => message is OverlayUpdatedMessage overlay && overlay.Layer == updated.Layer))
                {
                    _events.Add(updated);
                }
            });
            events.AddEventListener(RulesEvents.CityStatusUpdated, status => _status = _lastStatus = status);
            events.AddEventListener(RulesEvents.ValvesUpdated, demand => _demand = _lastDemand = demand);
            // The trips the client draws as cars, trains and walkers, which no player who joins is sent
            city.Trips.RunOffered += run => _runs.Add(run);
            city.Trips.RideOffered += ride => _rides.Add(ride);
            city.Trips.WalkOffered += walk => _walks.Add(walk);
        }

        [MemberNotNull(nameof(_tiles), nameof(_walkways))]
        private void MarkSent()
        {
            _tiles = _city.Map.RawValues();
            _walkways = _city.Map.WalkwayValues();

            foreach (StateMessage message in Changing())
            {
                _sent[message.Type] = ProtocolJson.Serialize(message);
            }
        }

        /// <summary>
        /// The whole state, as a player who joins needs it: the whole map, the walkway of every tile that holds any, if
        /// one does, the sprites, the date, the population and the records, then the latest status and demand published,
        /// if any has been, and the step clock. It is what was last sent, as long as the city changes only between calls
        /// of <see cref="NewMessages"/>, each of which sends what it changed.
        /// </summary>
        public IReadOnlyList<StateMessage> FullState()
        {
            GameMap map = _city.Map;
            List<StateMessage> messages = [new MapMessage(map.Width, map.Height, map.RawValues())];
            if (WalkwaysMessage(new int[map.Width * map.Height]) is WalkwaysMessage walkways)
            {
                messages.Add(walkways);
            }

            messages.AddRange(Changing());

            if (_lastStatus is not null)
            {
                messages.Add(_lastStatus);
            }

            if (_lastDemand is not null)
            {
                messages.Add(_lastDemand);
            }

            messages.Add(new ClockMessage(_city.StepClock));
            return messages;
        }

        /// <summary>
        /// The state messages since the last call: the tiles that changed, and the tiles whose walkway changed; the
        /// sprites, date, population and records that differ from those sent last; then the status and demand published
        /// since, the events in the order they came, the step clock if the batch carries any of these or trips, and the
        /// trips offered since, if any was.
        /// </summary>
        public IReadOnlyList<StateMessage> NewMessages()
        {
            List<StateMessage> messages = new List<StateMessage>();

            if (TilesMessage() is TilesMessage tiles)
            {
                messages.Add(tiles);
            }

            if (WalkwaysMessage(_walkways) is WalkwaysMessage walkways)
            {
                _walkways = _city.Map.WalkwayValues();
                messages.Add(walkways);
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
            bool trips = _runs.Count > 0 || _rides.Count > 0 || _walks.Count > 0;

            // The step clock goes with a batch that carries anything, and makes none of its own: it moves every step
            if (trips || messages.Count > 0)
            {
                messages.Add(new ClockMessage(_city.StepClock));
            }

            if (trips)
            {
                messages.Add(new TripsMessage(_runs, _rides, _walks));
                _runs = new List<Trip>();
                _rides = new List<Ride>();
                _walks = new List<Trip>();
            }

            return messages;
        }

        // The messages sent only when they change, in the order they go
        private IEnumerable<StateMessage> Changing()
        {
            (long month, long year) = _city.Date;

            yield return new SpritesMessage(_city.SpriteManager.GetLiveSprites().Select(View).ToList());
            yield return new DateMessage(month, year);
            yield return new PopulationMessage(_city.CityPopLast);
            yield return _city.EvaluationRecord();
            yield return _city.BudgetRecord();
            yield return _city.SettingsRecord();
        }

        // The tiles whose raw values changed since last sent, or null for none
        private TilesMessage? TilesMessage()
        {
            int[] values = _city.Map.RawValues();
            int width = _city.Map.Width;
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

        // The tiles whose walkway differs from what the values given hold for each, row by row, with its walkway now, or
        // null for none
        private WalkwaysMessage? WalkwaysMessage(int[] before)
        {
            int[] values = _city.Map.WalkwayValues();
            int width = _city.Map.Width;
            List<WalkwayChange> changes = new List<WalkwayChange>();

            for (int i = 0; i < values.Length; i++)
            {
                if (values[i] != before[i])
                {
                    changes.Add(new WalkwayChange(i % width, i / width, values[i]));
                }
            }

            return changes.Count == 0 ? null : new WalkwaysMessage(changes);
        }

        // A sprite as the client draws it: its position plus its type's drawing offset
        private static SpriteView View(Sprite sprite)
        {
            (int width, int xOffset, int yOffset) = SpriteGeometry[sprite.Type];
            return new SpriteView((int)sprite.Type, sprite.Frame, sprite.X + xOffset, sprite.Y + yOffset, width);
        }
    }
}
