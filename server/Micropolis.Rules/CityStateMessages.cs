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

using System.Diagnostics.CodeAnalysis;

namespace Micropolis.Rules
{
    /// <summary>
    /// The state messages a city sends, and what it has sent: the diffing half of <c>HostedCity</c> in
    /// <c>src/cityHost.ts</c>, which listens to the simulation's events and turns what changed into state messages.
    /// Every player in a city is sent the same messages, so a city has one. Building them never changes the city.
    /// </summary>
    public sealed class CityStateMessages
    {
        // A sprite's square on the sprite sheet, and where it is drawn from its position, by type, as each sprite's
        // traits in src/*Sprite.js give them to BaseSprite: the protocol's view of a sprite, which goes with the
        // messages. The simulation keeps only what moves a sprite (SpriteTraits).
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

        private readonly Simulation _city;
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

        /// <summary>
        /// Takes the city as it stands as sent, so the first new messages are what changes from here: a player who
        /// joins is sent the whole city.
        /// </summary>
        public CityStateMessages(Simulation city)
        {
            _city = city;
            MarkSent();

            EventEmitter events = city.Events;
            // The rules write each of these payloads with the fields of the message or record the client is sent, as
            // newsMessage in src/cityHost.ts reads the news
            events.AddEventListener(Messages.FRONT_END_MESSAGE, payload => _events.Add(ProtocolJson.FromNode<NewsMessage>(payload!)));
            events.AddEventListener(Messages.COMMAND_RESULT, payload => _events.Add(new CommandResultMessage(CommandResult.FromPayload(payload!))));
            events.AddEventListener(Messages.BUDGET_REVIEW_DUE, _ => _events.Add(new BudgetReviewDueMessage()));
            events.AddEventListener(Messages.OVERLAY_UPDATED, payload =>
            {
                string layer = (string)payload!["layer"]!;

                if (!_events.Any(message => message is OverlayUpdatedMessage overlay && overlay.Layer == layer))
                {
                    _events.Add(new OverlayUpdatedMessage(layer));
                }
            });
            events.AddEventListener(Messages.CITY_STATUS_UPDATED, payload => _status = _lastStatus = ProtocolJson.FromNode<StatusRecord>(payload!));
            events.AddEventListener(Messages.VALVES_UPDATED, payload => _demand = _lastDemand = ProtocolJson.FromNode<DemandMessage>(payload!));
        }

        [MemberNotNull(nameof(_tiles))]
        private void MarkSent()
        {
            _tiles = _city.Map.RawValues();

            foreach (StateMessage message in Changing())
            {
                _sent[message.Type] = ProtocolJson.Serialize(message);
            }
        }

        /// <summary>
        /// The whole state, as a player who joins needs it: the whole map, the sprites, the date, the population and the
        /// records, then the latest status and demand published, if any has been. It is what was last sent, as long as
        /// the city changes only between calls of <see cref="NewMessages"/>, each of which sends what it changed.
        /// </summary>
        public IReadOnlyList<StateMessage> FullState()
        {
            List<StateMessage> messages = [new MapMessage(_city.Map.Width, _city.Map.Height, _city.Map.RawValues()), .. Changing()];

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

        // A sprite as the client draws it: its position plus its type's drawing offset
        private static SpriteView View(Sprite sprite)
        {
            (int width, int xOffset, int yOffset) = SpriteGeometry[sprite.Type];
            return new SpriteView((int)sprite.Type, sprite.Frame, sprite.X + xOffset, sprite.Y + yOffset, width);
        }
    }
}
