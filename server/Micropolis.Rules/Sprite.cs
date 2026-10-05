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

using System.Text.Json.Nodes;

namespace Micropolis.Rules
{
    /// <summary>
    /// A sprite's kind, as the original's <c>SPRITE_TRAIN</c> and its siblings number them.
    /// </summary>
    public enum SpriteType
    {
        Train = 1,
        Helicopter = 2,
        Airplane = 3,
        Ship = 4,
        Monster = 5,
        Tornado = 6,
        Explosion = 7,
    }

    /// <summary>
    /// What a type fixes for every sprite of it: its hot spot, where it collides, crashes and leaves the map, in pixels
    /// from the sprite's position, as the original's initSprite gives it; the event that reports its crash, for a
    /// type that can crash; and its last frame, the frames counting from 1. The size and drawing offset the original
    /// also gives are the client's, which draws it.
    /// </summary>
    public readonly record struct SpriteTraits(int XHot, int YHot, EventName<NewsPlace>? Crash, int LastFrame);

    /// <summary>
    /// A sprite's saved state, at its position in the original's frame. Its traits are its type's, and not saved.
    /// </summary>
    /// <remarks>
    /// The positions and counters have no range the simulation keeps them within, such as a sprite's pixels while it
    /// flies off the map, so they are <see langword="long"/>.
    /// </remarks>
    public sealed class Sprite
    {
        internal Sprite(SpriteType type)
        {
            Type = type;
        }

        public SpriteType Type { get; }

        /// <summary>
        /// The frame drawn, 0 for a sprite that has died this pass.
        /// </summary>
        public long Frame { get; internal set; }

        // Pixels
        public long X { get; internal set; }

        public long Y { get; internal set; }

        public long OrigX { get; internal set; }

        public long OrigY { get; internal set; }

        public long DestX { get; internal set; }

        public long DestY { get; internal set; }

        public long Count { get; internal set; }

        public long SoundCount { get; internal set; }

        public long Dir { get; internal set; }

        public long NewDir { get; internal set; }

        public long Step { get; internal set; }

        public long Flag { get; internal set; }

        /// <summary>
        /// Whether a monster's hot spot has been on land, a tile <see cref="SpriteUtils.IsWater"/> doesn't take as water,
        /// since it rose, or it was saved before the game kept this. Every other type leaves it false.
        /// </summary>
        public bool ReachedLand { get; internal set; }

        /// <summary>
        /// A ship's mission, and <see langword="null"/> for every other type.
        /// </summary>
        public ShipMission? Mission { get; internal set; }

        /// <summary>
        /// A plane's flight, and <see langword="null"/> for every other type.
        /// </summary>
        public PlaneFlight? PlaneFlight { get; internal set; }

        /// <summary>
        /// A helicopter's flight, and <see langword="null"/> for every other type.
        /// </summary>
        public CopterFlight? CopterFlight { get; internal set; }

        public SpriteTraits Traits => TraitsOf(Type);

        /// <summary>
        /// The pixels across from <see cref="X"/> to the point where the sprite collides, crashes and leaves the map.
        /// </summary>
        public long XHot => Traits.XHot;

        /// <summary>
        /// The pixels down from <see cref="Y"/> to the sprite's hot spot.
        /// </summary>
        public long YHot => Traits.YHot;

        public static SpriteTraits TraitsOf(SpriteType type)
        {
            return type switch
            {
                SpriteType.Train => new SpriteTraits(40, -8, RulesEvents.TrainCrashed, 5),
                SpriteType.Helicopter => new SpriteTraits(40, -8, RulesEvents.HelicopterCrashed, 8),
                SpriteType.Airplane => new SpriteTraits(48, 16, RulesEvents.PlaneCrashed, 11),
                SpriteType.Ship => new SpriteTraits(48, 0, RulesEvents.ShipCrashed, 8),
                SpriteType.Monster => new SpriteTraits(40, 16, null, 16),
                SpriteType.Tornado => new SpriteTraits(40, 36, null, 3),
                SpriteType.Explosion => new SpriteTraits(40, 16, null, 6),
                _ => throw new ArgumentOutOfRangeException(nameof(type), type, "No such sprite type."),
            };
        }

        internal JsonObject Save()
        {
            return new JsonObject
            {
                ["type"] = (int)Type,
                ["frame"] = Frame,
                ["x"] = X,
                ["y"] = Y,
                ["origX"] = OrigX,
                ["origY"] = OrigY,
                ["destX"] = DestX,
                ["destY"] = DestY,
                ["count"] = Count,
                ["soundCount"] = SoundCount,
                ["dir"] = Dir,
                ["newDir"] = NewDir,
                ["step"] = Step,
                ["flag"] = Flag,
                ["reachedLand"] = ReachedLand,
                ["mission"] = Mission?.Save(),
                ["planeFlight"] = PlaneFlight?.Save(),
                ["copterFlight"] = CopterFlight?.Save(),
            };
        }

        // The frame, 0 for a sprite that died, and a train's direction index the tables its moves read, so a value
        // outside them is refused here rather than failing the step that moves the sprite. Only a monster reaches land,
        // only a ship has a mission, whose port is a tile of the map, and only a plane or a helicopter its flight.
        internal static Sprite Load(SavedObject data, GameMap map)
        {
            SpriteType type = data.ReadEnum<SpriteType>("type");

            return new Sprite(type)
            {
                Frame = data.ReadInt("frame", 0, TraitsOf(type).LastFrame),
                X = data.ReadSafeInteger("x"),
                Y = data.ReadSafeInteger("y"),
                OrigX = data.ReadSafeInteger("origX"),
                OrigY = data.ReadSafeInteger("origY"),
                DestX = data.ReadSafeInteger("destX"),
                DestY = data.ReadSafeInteger("destY"),
                Count = data.ReadSafeInteger("count"),
                SoundCount = data.ReadSafeInteger("soundCount"),
                Dir = type == SpriteType.Train ? data.ReadInt("dir", 0, TrainSprite.CantMove) : data.ReadSafeInteger("dir"),
                NewDir = data.ReadSafeInteger("newDir"),
                Step = data.ReadSafeInteger("step"),
                Flag = data.ReadSafeInteger("flag"),
                ReachedLand = data.ReadBool("reachedLand", type == SpriteType.Monster ? [false, true] : [false]),
                Mission = ReadMission(data, type, map),
                PlaneFlight = ReadPlaneFlight(data, type, map),
                CopterFlight = ReadCopterFlight(data, type, map),
            };
        }

        private static ShipMission? ReadMission(SavedObject data, SpriteType type, GameMap map)
        {
            if (type == SpriteType.Ship)
            {
                return data.ReadObject("mission", saved => ShipMission.Load(saved, map));
            }

            data.ReadNull("mission", "must be null for every type but a ship");
            return null;
        }

        private static PlaneFlight? ReadPlaneFlight(SavedObject data, SpriteType type, GameMap map)
        {
            if (type == SpriteType.Airplane)
            {
                return data.ReadObject("planeFlight", saved => PlaneFlight.Load(saved, map));
            }

            data.ReadNull("planeFlight", "must be null for every type but a plane");
            return null;
        }

        private static CopterFlight? ReadCopterFlight(SavedObject data, SpriteType type, GameMap map)
        {
            if (type == SpriteType.Helicopter)
            {
                return data.ReadObject("copterFlight", saved => CopterFlight.Load(saved, map));
            }

            data.ReadNull("copterFlight", "must be null for every type but a helicopter");
            return null;
        }
    }
}
