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
    /// The walkway tool, which the original never had: it lays walkway on a ninth of a tile that takes one
    /// (<see cref="Walkways.Takes"/>), a path for <see cref="PathCost"/>. A ninth already holding the kind laid costs
    /// nothing, so a drag over walkway pays only for what it adds. Water takes none, nor does a zone or any other
    /// building, rubble or a power line on its own, which need the bulldozer first. It erases a ninth's walkway too.
    /// </summary>
    internal sealed class WalkwayTool : StagedTool
    {
        /// <summary>
        /// What a ninth of path costs.
        /// </summary>
        public const long PathCost = 2;

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

            if (!Walkways.Takes(tileValue))
            {
                Result = TileUtils.IsWater(tileValue) ? Outcome.OnWater : Outcome.NeedsBulldoze;
                return;
            }

            int walkway = WorldEffects.GetWalkway(x, y);

            if (Walkways.KindAt(walkway, ninth) != (int)kind)
            {
                WorldEffects.SetWalkway(x, y, Walkways.With(walkway, ninth, (int)kind));
                AddCost(PathCost);
            }

            Result = Outcome.Ok;
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
