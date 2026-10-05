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

namespace Micropolis.Rules
{
    /// <summary>
    /// The trips the traffic rule completes, offered for the client to draw as cars: a picture of what the rules do,
    /// which the rules never read, never save and draw nothing from the stream for. A trip is the route of a drive that
    /// arrived, every tile it stood on in order, and only a trip a car drives on all of is kept
    /// (<see cref="TileUtils.CarriesCars(int)"/>), since a drive may run on rail. At most one trip is offered every
    /// <see cref="StepsPerOffer"/> steps: at the end of each step whose index is a multiple of it, the latest trip kept
    /// since the last one offered, if a car still drives on all of it, and the others are dropped. A step's index is
    /// counted from 0 since the city was started or loaded, among the steps it took while not paused.
    /// </summary>
    /// <remarks>
    /// <see cref="Offered"/> is a plain C# event, not one of <see cref="RulesEvents"/>: what the simulation's emitters
    /// send, log replay records, and the fixture tool writes into the event goldens, which trips are no part of.
    /// </remarks>
    public sealed class Trips
    {
        /// <summary>
        /// The steps between one trip offered and the next at the soonest: about ten trips a second at 60 steps a
        /// second.
        /// </summary>
        public const int StepsPerOffer = 6;

        private readonly GameMap _map;
        // The index of the step under way
        private long _stepIndex;
        // The latest trip kept since the last one offered, one list for every trip, and whether it holds one
        private readonly List<Position> _latest = new List<Position>();
        private bool _kept;

        public Trips(GameMap map)
        {
            _map = map;
        }

        /// <summary>
        /// Hears each trip offered, as the step that offers it ends. With nothing listening, no trip is kept.
        /// </summary>
        public event Action<IReadOnlyList<TilePosition>>? Offered;

        /// <summary>
        /// Keeps the route of a drive that arrived if a car drives on every tile of it, as the map has it now.
        /// </summary>
        internal void Arrived(IReadOnlyList<Position> route)
        {
            if (Offered is null || !CarriesCars(route))
            {
                return;
            }

            _latest.Clear();
            _latest.AddRange(route);
            _kept = true;
        }

        /// <summary>
        /// Ends the step under way, offering the latest trip kept if its index is a multiple of
        /// <see cref="StepsPerOffer"/>. A command may have changed the map since the trip arrived, such as a bulldozer
        /// taking up its road, so the trip is offered only if a car still drives on all of it.
        /// </summary>
        internal void Stepped()
        {
            if (_stepIndex % StepsPerOffer == 0 && _kept)
            {
                _kept = false;

                if (CarriesCars(_latest))
                {
                    Offered?.Invoke(_latest.Select(position => new TilePosition(position.X, position.Y)).ToList());
                }
            }

            _stepIndex++;
        }

        private bool CarriesCars(IReadOnlyList<Position> route)
        {
            for (int i = 0; i < route.Count; i++)
            {
                if (!TileUtils.CarriesCars(_map.GetTileValue(route[i].X, route[i].Y)))
                {
                    return false;
                }
            }

            return true;
        }
    }
}
