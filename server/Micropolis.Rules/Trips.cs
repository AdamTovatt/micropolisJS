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
    /// The trips the traffic rule routes, offered for the client to draw as cars and trains: a picture of what the rules
    /// do, which the rules never read, never save and draw nothing from the stream for. The router says how a route
    /// goes over each tile of it (<see cref="TripRouter"/>), and each run of the route by road, at least
    /// <see cref="ShortestRun"/> tiles long, is offered as a trip of its own, and each ride, from the station it gets on
    /// at to the one it gets off at, as a ride of its own, as the route is routed, so the cars and trains of one route
    /// go together. Where it walks nothing is offered.
    /// </summary>
    /// <remarks>
    /// <see cref="RunOffered"/> and <see cref="RideOffered"/> are plain C# events, not <see cref="RulesEvents"/>: what the
    /// simulation's emitters send, log replay records, and the fixture tool writes into the event goldens, which trips
    /// are no part of.
    /// </remarks>
    public sealed class Trips
    {
        /// <summary>
        /// The fewest tiles a run by road is offered with: a car on a single tile would go nowhere. A ride runs from one
        /// station to another, so always holds two tiles or more.
        /// </summary>
        public const int ShortestRun = 2;

        // The city's step clock, which a ride's departure counts on
        private readonly Func<long> _stepClock;

        /// <param name="stepClock">The city's step clock as it stands (<see cref="Simulation.StepClock"/>).</param>
        public Trips(Func<long> stepClock)
        {
            _stepClock = stepClock;
        }

        /// <summary>
        /// Hears each run by road offered, as it is routed.
        /// </summary>
        public event Action<Trip>? RunOffered;

        /// <summary>
        /// Hears each ride offered, as it is routed: its start is the station it gets on at, its last tile the station it
        /// gets off at, and its departure the station's next (<see cref="Timetable.NextDeparture"/>).
        /// </summary>
        public event Action<Ride>? RideOffered;

        /// <summary>
        /// Offers each run of a trip's route by road at least <see cref="ShortestRun"/> tiles long, and each ride of it,
        /// in the order the route takes them.
        /// </summary>
        internal void Routed(IReadOnlyList<RouteStep> route)
        {
            int start = 0;

            for (int i = 1; i <= route.Count; i++)
            {
                if (i < route.Count && route[i].Mode == route[start].Mode)
                {
                    continue;
                }

                if (route[start].Mode == TravelMode.Road && i - start >= ShortestRun)
                {
                    RunOffered?.Invoke(TripOf(route, start, i));
                }
                else if (route[start].Mode == TravelMode.Rail && RideOffered is not null)
                {
                    Trip path = TripOf(route, start, i);
                    RideOffered(new Ride(path, Timetable.NextDeparture(path.X, path.Y, _stepClock())));
                }

                start = i;
            }
        }

        // The trip that stands on each tile of the route from start up to end in turn, every tile of it beside the one
        // before
        private static Trip TripOf(IReadOnlyList<RouteStep> route, int start, int end)
        {
            char[] steps = new char[end - start - 1];
            for (int i = start + 1; i < end; i++)
            {
                steps[i - start - 1] = StepLetter(route[i - 1].Tile, route[i].Tile);
            }

            return new Trip(route[start].Tile.X, route[start].Tile.Y, new string(steps));
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
