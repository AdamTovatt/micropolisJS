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
    /// The ship, which sails in from the map's edge to a seaport, docks there, and sails out by the nearest edge. A
    /// rule change from the original's doShipSprite in sprite.cpp, whose ship wanders the channel at random and wrecks
    /// where it finds no way on.
    /// </summary>
    /// <remarks>
    /// A ship sails from tile to tile of its route, 2 pixels a step, and chooses each tile when it reaches the one
    /// before. Its route isn't kept: each step it checks its mission against the map, its port each step and its route
    /// at each tile, where it searches it again. A route that fails is replaced by the first of: a route to the same
    /// port, one to the nearest other port a ship sails to, and one to the nearest edge. A ship with none of those
    /// leaves the map where it is, with no wreck. A closed bridge on its route opens as it sails through.
    /// </remarks>
    internal static class ShipSprite
    {
        /// <summary>
        /// The steps a ship stays docked: 20 seconds at 60 steps a second, at every speed, since sprites move every step.
        /// </summary>
        public const long DockSteps = 1200;

        // The steps between two of a ship's 45° turns
        private const long TurnSteps = 9;

        // The pixels a ship moves along each axis in a step
        private const long Speed = 2;

        // A ship stands on a tile when its pixel (x + 47, y) is the tile's top-left corner, as the original places a
        // new ship
        private const long TileOffsetX = 47;

        // A ship sails in to no port yet, facing away from the edge it starts by
        public static void Init(SpriteManager manager, Sprite sprite)
        {
            GameMap map = manager.Map;
            sprite.Mission = new ShipMission();

            if (sprite.X < SpriteUtils.WorldToPix(4))
            {
                sprite.Frame = 3;
            }
            else if (sprite.X >= SpriteUtils.WorldToPix(map.Width - 4))
            {
                sprite.Frame = 7;
            }
            else if (sprite.Y < SpriteUtils.WorldToPix(4))
            {
                sprite.Frame = 5;
            }
            else if (sprite.Y >= SpriteUtils.WorldToPix(map.Height - 4))
            {
                sprite.Frame = 1;
            }
            else
            {
                sprite.Frame = 3;
            }
        }

        /// <summary>
        /// The pixel x of a ship standing on a tile of column x.
        /// </summary>
        public static long PixelX(int x)
        {
            return SpriteUtils.WorldToPix(x) - TileOffsetX;
        }

        /// <summary>
        /// The pixel y of a ship standing on a tile of row y.
        /// </summary>
        public static long PixelY(int y)
        {
            return SpriteUtils.WorldToPix(y);
        }

        /// <summary>
        /// Whether the ship stands on a tile, as it does between two of its moves from tile to tile.
        /// </summary>
        public static bool IsOnTile(Sprite sprite)
        {
            return ((sprite.X + TileOffsetX) & 15) == 0 && (sprite.Y & 15) == 0;
        }

        /// <summary>
        /// The tile the ship stands on, or, between two tiles, the one its pixel (x + 47, y) is over.
        /// </summary>
        public static Position TileUnder(Sprite sprite)
        {
            return new Position((int)SpriteUtils.PixToWorld(sprite.X + TileOffsetX), (int)SpriteUtils.PixToWorld(sprite.Y));
        }

        public static void Move(SpriteManager manager, Sprite sprite)
        {
            GameMap map = manager.Map;
            ShipMission mission = sprite.Mission!;

            if (sprite.SoundCount > 0)
            {
                sprite.SoundCount--;
            }

            if (sprite.SoundCount == 0)
            {
                // The draw decides whether the ship sounds its horn
                manager.Random.GetRandom16();
                sprite.SoundCount = 200;
            }

            if (sprite.Count > 0)
            {
                sprite.Count--;
            }

            Position tile = Ahead(sprite);

            if (!IsOnTile(sprite))
            {
                // Between two tiles it sails on to the one ahead, finding a new port if it lost its own
                if (mission.Phase == ShipPhase.SailingIn && !HasValidPort(map, mission))
                {
                    Retarget(manager, mission, tile);
                }

                Advance(sprite, tile);
                return;
            }

            if (!map.IsPositionInBounds(tile))
            {
                // It has sailed off the map
                sprite.Frame = 0;
                return;
            }

            Course course = Plan(manager, sprite, mission, tile);

            if (course.Kind == CourseKind.Vanish)
            {
                sprite.Frame = 0;
                return;
            }

            if (course.Kind == CourseKind.Stay)
            {
                return;
            }

            if (sprite.Frame != course.Frame)
            {
                if (sprite.Count == 0)
                {
                    sprite.Frame = SpriteUtils.TurnTo(sprite.Frame, course.Frame);
                    sprite.Count = TurnSteps;
                }

                return;
            }

            Position next = Step(tile, course.Frame);

            if (map.IsPositionInBounds(next) && !Waterways.IsSailable(map.GetTileValue(next)))
            {
                // The route crosses a closed bridge here, which opens as the ship sails through
                Road.OpenForShip(map, next.X, next.Y);
            }

            Advance(sprite, next);
        }

        // The ship's course from the tile it stands on, its mission checked against the map
        private static Course Plan(SpriteManager manager, Sprite sprite, ShipMission mission, Position tile)
        {
            return mission.Phase switch
            {
                ShipPhase.Docked => StayDocked(manager, sprite, mission, tile),
                ShipPhase.SailingIn => SailIn(manager, sprite, mission, tile),
                _ => SailOut(manager, sprite, tile),
            };
        }

        // A docked ship stays while its port stands and its time there runs, then leaves
        private static Course StayDocked(SpriteManager manager, Sprite sprite, ShipMission mission, Position tile)
        {
            if (HasValidPort(manager.Map, mission) && --mission.DockCount > 0)
            {
                return Course.Stay;
            }

            Leave(mission);
            return SailOut(manager, sprite, tile);
        }

        // A ship sailing in heads for its port, or for the nearest other when its own fails, and docks on reaching it
        private static Course SailIn(SpriteManager manager, Sprite sprite, ShipMission mission, Position tile)
        {
            Course? toPort = HasValidPort(manager.Map, mission) ? RouteToPort(manager, sprite, mission, tile) : null;

            if (toPort is null)
            {
                Retarget(manager, mission, tile);

                if (mission.Phase == ShipPhase.Leaving)
                {
                    return SailOut(manager, sprite, tile);
                }

                // Retarget found the new port by a search from this tile, so a route reaches it
                toPort = RouteToPort(manager, sprite, mission, tile) ??
                    throw new InvalidOperationException("A ship was sent to a port it has no route to.");
            }

            if (toPort == Course.Stay)
            {
                mission.Phase = ShipPhase.Docked;
                mission.DockCount = DockSteps;
            }

            return toPort.Value;
        }

        // A leaving ship heads off the map from an edge tile, or for the nearest edge, and with no way out leaves the
        // map where it is, with no wreck
        private static Course SailOut(SpriteManager manager, Sprite sprite, Position tile)
        {
            if (OutwardFrame(manager.Map, tile) is int outward)
            {
                return Course.Sail(outward);
            }

            return Route(manager.Router, Waterways.SailableEdgeTiles(manager.Map), sprite, tile) ?? Course.Vanish;
        }

        private static Course? RouteToPort(SpriteManager manager, Sprite sprite, ShipMission mission, Position tile)
        {
            return Route(manager.Router, Seaports.DockTiles(manager.Map, mission.Port!.Value), sprite, tile);
        }

        // The ship's move toward the nearest of the goals, staying on one, or null when it reaches none
        private static Course? Route(ShipRouter router, IEnumerable<Position> goals, Sprite sprite, Position tile)
        {
            return router.DistanceToNearest(goals, tile) switch
            {
                < 0 => null,
                0 => Course.Stay,
                _ => Course.Sail(router.NextMove(tile, sprite.Frame)),
            };
        }

        /// <summary>
        /// The ship sails in to the nearest other port a ship sails to, by path length from its tile, or leaves when
        /// it reaches none. A tile by two such ports is the first's of them, row by row from the north-west.
        /// </summary>
        private static void Retarget(SpriteManager manager, ShipMission mission, Position tile)
        {
            GameMap map = manager.Map;
            Dictionary<Position, Position> portByDock = new Dictionary<Position, Position>();

            foreach (Position port in Seaports.ValidPorts(map).Where(port => port != mission.Port))
            {
                foreach (Position dock in Seaports.DockTiles(map, port))
                {
                    portByDock.TryAdd(dock, port);
                }
            }

            Position? found = portByDock.Count == 0
                ? null
                : manager.Router.Nearest([tile], (x, y) => portByDock.ContainsKey(new Position(x, y)));

            if (found is Position dockTile)
            {
                mission.Port = portByDock[dockTile];
            }
            else
            {
                Leave(mission);
            }
        }

        private static void Leave(ShipMission mission)
        {
            mission.Phase = ShipPhase.Leaving;
            mission.Port = null;
            mission.DockCount = 0;
        }

        private static bool HasValidPort(GameMap map, ShipMission mission)
        {
            return mission.Port is Position port && Seaports.IsValid(map, port);
        }

        // The frame that takes a ship on an edge tile off the map, north, east, south then west at a corner, or null
        // for a tile inside the edges
        private static int? OutwardFrame(GameMap map, Position tile)
        {
            if (tile.Y == 0)
            {
                return 1;
            }

            if (tile.X == map.Width - 1)
            {
                return 3;
            }

            if (tile.Y == map.Height - 1)
            {
                return 5;
            }

            if (tile.X == 0)
            {
                return 7;
            }

            return null;
        }

        private static Position Step(Position tile, int frame)
        {
            return new Position(tile.X + ShipRouter.FrameDeltaX[frame], tile.Y + ShipRouter.FrameDeltaY[frame]);
        }

        // The tile the ship stands on, or the one it is sailing to: along each axis, the next tile its frame heads
        // for, or across an axis the frame doesn't move along, the nearest
        private static Position Ahead(Sprite sprite)
        {
            int frame = (int)sprite.Frame;

            return new Position(AheadAlong(sprite.X + TileOffsetX, ShipRouter.FrameDeltaX[frame]),
                                AheadAlong(sprite.Y, ShipRouter.FrameDeltaY[frame]));
        }

        private static int AheadAlong(long pixel, int step)
        {
            int tile = (int)SpriteUtils.PixToWorld(pixel);
            long offset = pixel & 15;

            return offset != 0 && (step > 0 || (step == 0 && offset >= 8)) ? tile + 1 : tile;
        }

        // A step of up to 2 pixels along each axis toward the tile
        private static void Advance(Sprite sprite, Position tile)
        {
            sprite.X += Math.Clamp(PixelX(tile.X) - sprite.X, -Speed, Speed);
            sprite.Y += Math.Clamp(PixelY(tile.Y) - sprite.Y, -Speed, Speed);
        }

        // What a ship does from the tile it stands on
        private enum CourseKind
        {
            // It stays on the tile, docked or arriving
            Stay,

            // It sails on, turning first to the course's frame
            Sail,

            // It leaves the map where it is, with no way out
            Vanish,
        }

        // A ship's course from the tile it stands on, with the frame it sails in
        private readonly record struct Course(CourseKind Kind, int Frame)
        {
            public static Course Stay => new Course(CourseKind.Stay, 0);

            public static Course Vanish => new Course(CourseKind.Vanish, 0);

            public static Course Sail(int frame)
            {
                return new Course(CourseKind.Sail, frame);
            }
        }
    }
}
