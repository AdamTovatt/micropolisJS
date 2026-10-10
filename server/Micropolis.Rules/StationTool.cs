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
    /// The station tool, which the original never had: a station on a straight piece of rail, through which the track
    /// runs on, the only place a trip gets on or off a train (<see cref="TripRouter"/>). Not on a curve, a junction, a
    /// crossing of road or a power line, or a bridge, and needing no power. The bulldozer takes it back to the rail it
    /// stood on.
    /// </summary>
    internal sealed class StationTool : ConnectingTool
    {
        public StationTool(GameMap map)
            : base(500, map)
        {
        }

        protected override void DoTool(int x, int y, RandomStream random, bool autoBulldoze)
        {
            if (!Map.TestBounds(x, y))
            {
                Result = Outcome.Failed;
                return;
            }

            int station = TileUtils.StationOn(WorldEffects.GetTile(x, y).GetValue());

            if (station == TileValues.TILE_INVALID)
            {
                Result = Outcome.Failed;
                return;
            }

            WorldEffects.SetTile(x, y, station, TileFlags.BLBNBIT);
            AddCost(ToolCost);

            // The rail beside it joins the station only along its track
            CheckZoneConnections(x, y);
            Result = Outcome.Ok;
        }
    }
}
