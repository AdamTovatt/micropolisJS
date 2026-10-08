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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The trains' timetable: each station's departures, every interval of the step clock at its own offset.
    /// </summary>
    [TestClass]
    public sealed class TimetableTests
    {
        // From every step of two intervals, the next departure is the first of the station's after it, so a ride waits
        // a step at least and an interval at most
        [TestMethod]
        [DataRow(25, 15)]
        [DataRow(44, 15)]
        [DataRow(0, 0)]
        [DataRow(119, 99)]
        public void NextDeparture_FromEachStep_IsTheFirstOfTheStationsAfterIt(int x, int y)
        {
            for (long clock = 0; clock < 2 * Timetable.DepartureInterval; clock++)
            {
                long departure = Timetable.NextDeparture(x, y, clock);
                long first = clock + 1;

                while (first % Timetable.DepartureInterval != Timetable.Offset(x, y))
                {
                    first++;
                }

                Assert.AreEqual(first, departure, $"From step {clock}.");
            }
        }

        // Stations beside each other, along a row or a column, have their departures some steps apart, so a line of
        // them doesn't send every train at once
        [TestMethod]
        public void Offset_StationsBesideEachOther_Differ()
        {
            for (int y = 0; y < 100; y++)
            {
                for (int x = 0; x < 120; x++)
                {
                    if (x + 1 < 120)
                    {
                        Assert.AreNotEqual(Timetable.Offset(x, y), Timetable.Offset(x + 1, y), $"At ({x}, {y}) along the row.");
                    }

                    if (y + 1 < 100)
                    {
                        Assert.AreNotEqual(Timetable.Offset(x, y), Timetable.Offset(x, y + 1), $"At ({x}, {y}) down the column.");
                    }
                }
            }
        }

        [TestMethod]
        public void Offset_AnyTile_IsWithinTheInterval()
        {
            for (int y = 0; y < 100; y++)
            {
                for (int x = 0; x < 120; x++)
                {
                    Assert.IsInRange(0, Timetable.DepartureInterval - 1, Timetable.Offset(x, y), $"At ({x}, {y}).");
                }
            }
        }
    }
}
