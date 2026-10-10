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
    /// The walkway tool, which the original never had: it lays walkway of a kind on a ninth of a tile that takes it
    /// (<see cref="Walkways.Takes"/>), a path for <see cref="PathCost"/> a ninth, and a footbridge or an underpass for
    /// <see cref="FootbridgeCost"/> or <see cref="UnderpassCost"/> a tile, paid as its first ninth goes on a tile
    /// holding none of it. A ninth already holding the kind laid costs nothing, so a drag over walkway pays only for what
    /// it adds. Water takes only a footbridge, a bridge no underpass, and a zone or any other building, rubble or a power
    /// line on its own none, which need the bulldozer first. It erases a ninth's walkway too.
    /// </summary>
    internal sealed class WalkwayTool : StagedTool
    {
        /// <summary>
        /// What a ninth of path costs.
        /// </summary>
        public const long PathCost = 2;

        /// <summary>
        /// What a footbridge costs a tile, however many of its ninths it takes.
        /// </summary>
        public const long FootbridgeCost = 40;

        /// <summary>
        /// What an underpass costs a tile, however many of its ninths it takes: dearer than a footbridge.
        /// </summary>
        public const long UnderpassCost = 80;

        public WalkwayTool(GameMap map)
            : base(map)
        {
        }

        /// <summary>
        /// Stages walkway of the kind given on the ninth at (<paramref name="ninthX"/>, <paramref name="ninthY"/>) of the
        /// grid of ninths (<see cref="NinthPosition"/>), and sets <see cref="StagedTool.Result"/>.
        /// </summary>
        public void Lay(int ninthX, int ninthY, WalkwayKind kind)
        {
            (int x, int y, int ninth) = Walkways.Locate(ninthX, ninthY);
            int tileValue = WorldEffects.GetTileValue(x, y);

            if (!Walkways.Takes(tileValue, kind))
            {
                // Water, or an underpass on a bridge, which would go under the water
                Result = TileUtils.IsWater(tileValue) || TileUtils.IsBridge(tileValue) ? Outcome.OnWater : Outcome.NeedsBulldoze;
                return;
            }

            int walkway = WorldEffects.GetWalkway(x, y);

            if (Walkways.KindAt(walkway, ninth) != (int)kind)
            {
                WorldEffects.SetWalkway(x, y, Walkways.With(walkway, ninth, (int)kind));
                AddCost(kind == WalkwayKind.Path || Walkways.NinthsOf(walkway, kind) == 0 ? CostOf(kind) : 0);
            }

            Result = Outcome.Ok;
        }

        /// <summary>
        /// What laying the kind given costs, as the tool charges it: a path a ninth, a footbridge or an underpass a tile.
        /// </summary>
        public static long CostOf(WalkwayKind kind)
        {
            return kind switch
            {
                WalkwayKind.Path => PathCost,
                WalkwayKind.Footbridge => FootbridgeCost,
                _ => UnderpassCost,
            };
        }

        /// <summary>
        /// Stages the walkway on the ninth at (<paramref name="ninthX"/>, <paramref name="ninthY"/>) erased, whatever its
        /// kind, at the bulldozer's cost, and sets <see cref="StagedTool.Result"/>: it fails on a ninth holding none, as
        /// an eraser does where there is nothing of its kind (<see cref="IErasable"/>).
        /// </summary>
        public void Erase(int ninthX, int ninthY)
        {
            (int x, int y, int ninth) = Walkways.Locate(ninthX, ninthY);
            int walkway = WorldEffects.GetWalkway(x, y);

            if (Walkways.KindAt(walkway, ninth) == 0)
            {
                Result = Outcome.Failed;
                return;
            }

            WorldEffects.SetWalkway(x, y, Walkways.With(walkway, ninth, 0));
            AddCost(BulldozerCost);
            Result = Outcome.Ok;
        }
    }
}
