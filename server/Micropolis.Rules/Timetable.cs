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
    /// When trains leave each station: a departure each way every <see cref="DepartureInterval"/> steps of the step
    /// clock (<see cref="Simulation.StepClock"/>), each station's offset from the clock's zero by its place, so the
    /// stations of a city don't all send their trains at once. A ride boards the next departure from the station it
    /// gets on at, after the step it is routed on, and is stamped with it (<see cref="Ride"/>), for the client to hold
    /// the train at the station until then. The rules read no departure: what waiting for one costs a route is
    /// <see cref="TripRouter.BoardingCost"/>, a fixed figure.
    /// </summary>
    public static class Timetable
    {
        /// <summary>
        /// The steps between one departure from a station and the next, each way: four seconds at the server's 60 steps
        /// a second, at every speed, so a busy station shows a train leaving every few seconds.
        /// </summary>
        public const int DepartureInterval = 240;

        /// <summary>
        /// Where in the interval the station at (<paramref name="x"/>, <paramref name="y"/>) has its departures: the
        /// step clock's values that leave the remainder over <see cref="DepartureInterval"/>, which stations beside
        /// each other have some way apart.
        /// </summary>
        public static int Offset(int x, int y)
        {
            return (x * 17 + y * 59) % DepartureInterval;
        }

        /// <summary>
        /// The first departure from the station at (<paramref name="x"/>, <paramref name="y"/>) after the step clock's
        /// value <paramref name="stepClock"/>: a ride routed on that step boards it.
        /// </summary>
        public static long NextDeparture(int x, int y, long stepClock)
        {
            long after = stepClock + 1;
            long wait = ((Offset(x, y) - after) % DepartureInterval + DepartureInterval) % DepartureInterval;

            return after + wait;
        }
    }
}
