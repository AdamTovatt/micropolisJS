/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 * Modified in Adam Tovatt's continuation of micropolisJS. Copyright (C) 2026 Adam Tovatt
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
    /// A tool that puts down a zone or a building of <c>size</c> by <c>size</c> tiles centred on the tile clicked, as
    /// the original's <c>buildBuilding</c> does.
    /// </summary>
    internal sealed class BuildingTool : ConnectingTool
    {
        private readonly int _centreTile;
        private readonly int _size;
        private readonly bool _animated;

        /// <param name="cost">What the building costs.</param>
        /// <param name="centreTile">The building's centre tile, which the others count up to and on from.</param>
        /// <param name="map">The map it builds on.</param>
        /// <param name="size">The building's width and height in tiles.</param>
        /// <param name="animated">Whether the tile below the centre is animated, as a nuclear plant's is.</param>
        public BuildingTool(long cost, int centreTile, GameMap map, int size, bool animated)
            : base(cost, map)
        {
            _centreTile = centreTile;
            _size = size;
            _animated = animated;
        }

        protected override void DoTool(int x, int y, RandomStream random, bool autoBulldoze)
        {
            Result = BuildBuilding(x, y, autoBulldoze);
        }

        private Outcome BuildBuilding(int x, int y, bool autoBulldoze)
        {
            // Correct to top left
            int left = x - 1;
            int top = y - 1;

            Outcome prepareResult = PrepareBuildingSite(left, top, autoBulldoze);

            if (prepareResult != Outcome.Ok)
            {
                return prepareResult;
            }

            AddCost(ToolCost);
            PutBuilding(left, top);
            CheckBorder(left, top, _size);

            return Outcome.Ok;
        }

        // Checks the whole site is on the map and clear, clearing for a cost what auto-bulldoze can. Open water anywhere
        // on the site is reported as such whatever the scan would reach first, since no bulldozing clears it.
        private Outcome PrepareBuildingSite(int left, int top, bool autoBulldoze)
        {
            if (left < 0 || left + _size > Map.Width)
            {
                return Outcome.Failed;
            }

            if (top < 0 || top + _size > Map.Height)
            {
                return Outcome.Failed;
            }

            if (HasOpenWater(left, top))
            {
                return Outcome.OnWater;
            }

            for (int dy = 0; dy < _size; dy++)
            {
                int posY = top + dy;

                for (int dx = 0; dx < _size; dx++)
                {
                    int posX = left + dx;
                    int tileValue = WorldEffects.GetTileValue(posX, posY);

                    if (tileValue == TileValues.DIRT)
                    {
                        continue;
                    }

                    if (!autoBulldoze || !TileUtils.CanBulldoze(tileValue))
                    {
                        return Outcome.NeedsBulldoze;
                    }

                    WorldEffects.SetTile(posX, posY, TileValues.DIRT);
                    AddCost(BulldozerCost);
                }
            }

            return Outcome.Ok;
        }

        private bool HasOpenWater(int left, int top)
        {
            for (int dy = 0; dy < _size; dy++)
            {
                for (int dx = 0; dx < _size; dx++)
                {
                    if (TileUtils.IsOpenWater(WorldEffects.GetTileValue(left + dx, top + dy)))
                    {
                        return true;
                    }
                }
            }

            return false;
        }

        // Lays the building's tiles row by row, counting up from its top left tile, each burnable and conductive: the
        // centre is the zone's centre, and the tile below it animated for an animated building
        private void PutBuilding(int left, int top)
        {
            int baseTile = _centreTile - _size - 1;

            for (int dy = 0; dy < _size; dy++)
            {
                int posY = top + dy;

                for (int dx = 0; dx < _size; dx++)
                {
                    int posX = left + dx;
                    int tileFlags = TileFlags.BNCNBIT;

                    if (dx == 1)
                    {
                        if (dy == 1)
                        {
                            tileFlags |= TileFlags.ZONEBIT;
                        }
                        else if (dy == 2 && _animated)
                        {
                            tileFlags |= TileFlags.ANIMBIT;
                        }
                    }

                    WorldEffects.SetTile(posX, posY, baseTile, tileFlags);
                    baseTile++;
                }
            }
        }
    }
}
