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
    /// arrived, every tile it stood on in order, and every trip a car drives on all of is offered as it arrives
    /// (<see cref="TileUtils.CarriesCars(int)"/>), since a drive may run on rail.
    /// </summary>
    /// <remarks>
    /// <see cref="Offered"/> is a plain C# event, not one of <see cref="RulesEvents"/>: what the simulation's emitters
    /// send, log replay records, and the fixture tool writes into the event goldens, which trips are no part of.
    /// </remarks>
    public sealed class Trips
    {
        private readonly GameMap _map;

        public Trips(GameMap map)
        {
            _map = map;
        }

        /// <summary>
        /// Hears each trip offered, as it arrives.
        /// </summary>
        public event Action<Trip>? Offered;

        /// <summary>
        /// Offers the route of a drive that arrived if a car drives on every tile of it.
        /// </summary>
        internal void Arrived(IReadOnlyList<Position> route)
        {
            if (Offered is not null && CarriesCars(route))
            {
                Offered(TripOf(route));
            }
        }

        // The trip that stands on each tile of the route in turn, every tile of it beside the one before
        private static Trip TripOf(IReadOnlyList<Position> route)
        {
            char[] steps = new char[route.Count - 1];
            for (int i = 1; i < route.Count; i++)
            {
                steps[i - 1] = StepLetter(route[i - 1], route[i]);
            }

            return new Trip(route[0].X, route[0].Y, new string(steps));
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
