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
    /// The trips the traffic rule routes, offered for the client to draw as cars: a picture of what the rules do,
    /// which the rules never read, never save and draw nothing from the stream for. A trip is a run of the route the
    /// router found, every tile of it in order: a route may run on rail, so each run of it that a car drives on every
    /// tile of (<see cref="TileUtils.CarriesCars(int)"/>), at least <see cref="ShortestRun"/> tiles long, is offered as
    /// a trip of its own, as the route is routed, so the cars of one route drive its road parts together.
    /// </summary>
    /// <remarks>
    /// <see cref="Offered"/> is a plain C# event, not one of <see cref="RulesEvents"/>: what the simulation's emitters
    /// send, log replay records, and the fixture tool writes into the event goldens, which trips are no part of.
    /// </remarks>
    public sealed class Trips
    {
        /// <summary>
        /// The fewest tiles a run is offered with: a car on a single tile would go nowhere.
        /// </summary>
        public const int ShortestRun = 2;

        private readonly GameMap _map;

        public Trips(GameMap map)
        {
            _map = map;
        }

        /// <summary>
        /// Hears each trip offered, as it is routed.
        /// </summary>
        public event Action<Trip>? Offered;

        /// <summary>
        /// Offers each run of a trip's route that a car drives on every tile of, and that is at least
        /// <see cref="ShortestRun"/> tiles long, in the order the route takes them.
        /// </summary>
        internal void Routed(IReadOnlyList<Position> route)
        {
            if (Offered is null)
            {
                return;
            }

            int start = 0;
            for (int i = 0; i <= route.Count; i++)
            {
                if (i < route.Count && TileUtils.CarriesCars(_map.GetTileValue(route[i].X, route[i].Y)))
                {
                    continue;
                }

                if (i - start >= ShortestRun)
                {
                    Offered(TripOf(route, start, i));
                }

                start = i + 1;
            }
        }

        // The trip that stands on each tile of the route from start up to end in turn, every tile of it beside the one
        // before
        private static Trip TripOf(IReadOnlyList<Position> route, int start, int end)
        {
            char[] steps = new char[end - start - 1];
            for (int i = start + 1; i < end; i++)
            {
                steps[i - start - 1] = StepLetter(route[i - 1], route[i]);
            }

            return new Trip(route[start].X, route[start].Y, new string(steps));
        }

        private static char StepLetter(Position from, Position to)
        {
            for (int i = 0; i < Direction.CardinalDirections.Count; i++)
            {
                if (Position.Move(from, Direction.CardinalDirections[i]) == to)
                {
                    return Trip.StepLetters[i];
                }
            }

            throw new InvalidOperationException($"A route steps from {from} to {to}, which is not beside it.");
        }
    }
}
