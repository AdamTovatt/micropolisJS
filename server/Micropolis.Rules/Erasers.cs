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
    /// A tool that puts down something its eraser, which the original never had, takes back off: what the player
    /// applies holding Shift with the tool. Every tool but the bulldozer is one. An eraser takes off a tile only what its
    /// tool puts down, at the bulldozer's cost, and fails where the tile holds nothing of the kind, as a tool laying a
    /// line over its own does.
    /// </summary>
    internal interface IErasable
    {
        /// <summary>
        /// The tool's eraser, over the map given.
        /// </summary>
        CityTool Eraser(GameMap map);
    }

    /// <summary>
    /// A tool that puts down something on a tile which its eraser takes off that tile alone (<see cref="TileEraser"/>):
    /// a road, rail or wire, a park or a station.
    /// </summary>
    internal interface IErasedTile : IErasable
    {
        /// <summary>
        /// What a tile of this value, without its flags, is left as once what the tool puts down is erased from it, or
        /// null where it holds none of it.
        /// </summary>
        Piece? PieceLeft(int tileValue);

        CityTool IErasable.Eraser(GameMap map)
        {
            return new TileEraser(map, this);
        }
    }

    /// <summary>
    /// The eraser of a tool that puts something down on a tile (<see cref="IErasedTile"/>): a road, rail or wire leaves
    /// the rest of the tile, a power line or the line it crossed, bare land or the water under it, and the walkway on it
    /// where the tile still takes one; a park leaves bare land and a station its track.
    /// </summary>
    internal sealed class TileEraser : ConnectingTool
    {
        private readonly IErasedTile _erased;

        /// <param name="map">The map it erases from.</param>
        /// <param name="erased">The tool whose work it erases.</param>
        public TileEraser(GameMap map, IErasedTile erased)
            : base(BulldozerCost, map)
        {
            _erased = erased;
        }

        protected override void DoTool(int x, int y, RandomStream random, bool autoBulldoze)
        {
            if (!Map.TestBounds(x, y) || _erased.PieceLeft(WorldEffects.GetTileValue(x, y)) is not Piece left)
            {
                Result = Outcome.Failed;
                return;
            }

            WorldEffects.SetTile(x, y, left.Value, left.Flags);
            AddCost(BulldozerCost);
            CheckZoneConnections(x, y);
            Result = Outcome.Ok;
        }
    }

    /// <summary>
    /// The eraser of a zone or building's tool: it blows up the zone or building under the tile, as the bulldozer does,
    /// only where it is of the tool's kind (<see cref="BuildingTool.Builds"/>).
    /// </summary>
    internal sealed class BuildingEraser : CityTool
    {
        private readonly BuildingTool _erased;

        /// <param name="map">The map it erases from.</param>
        /// <param name="erased">The tool whose zones or buildings it erases.</param>
        public BuildingEraser(GameMap map, BuildingTool erased)
            : base(BulldozerCost, map)
        {
            _erased = erased;
        }

        protected override void DoTool(int x, int y, RandomStream random, bool autoBulldoze)
        {
            if (!Map.TestBounds(x, y) || ZoneUtils.ZoneCentre(Map, x, y) is not Position centre ||
                !_erased.Builds(WorldEffects.GetTileValue(centre.X, centre.Y)))
            {
                Result = Outcome.Failed;
                return;
            }

            // A building of the tool's kind is the tool's size, its centre one tile in from its top left
            AddCost(BulldozerCost);
            PutRubble(centre.X - 1, centre.Y - 1, _erased.Size, random);
            Result = Outcome.Ok;
        }
    }
}
