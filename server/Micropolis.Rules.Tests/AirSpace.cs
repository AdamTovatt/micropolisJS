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

using static Micropolis.Rules.TileFlags;
using static Micropolis.Rules.TileValues;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// A city on a blank map of dirt for the aircraft's tests, with powered airports where a test builds them. Its
    /// sprites move only when a test steps them, and no scan runs unless a test runs one, so the map and the traffic stay
    /// as the test leaves them.
    /// </summary>
    internal sealed class AirSpace
    {
        private AirSpace(Simulation city)
        {
            City = city;
        }

        public Simulation City { get; }

        public GameMap Map => City.Map;

        public SpriteManager Sprites => City.SpriteManager;

        public BlockMap Traffic => City.BlockMaps.TrafficDensityMap;

        /// <summary>
        /// The live plane, or <see langword="null"/>.
        /// </summary>
        public Sprite? Plane => Sprites.GetSprite(SpriteType.Airplane);

        /// <summary>
        /// The live helicopter, or <see langword="null"/>.
        /// </summary>
        public Sprite? Copter => Sprites.GetSprite(SpriteType.Helicopter);

        public static AirSpace Of(int width = 120, int height = 100)
        {
            return new AirSpace(Simulation.NewCity(new GameMap(width, height), 1, Level.Easy, Speed.Medium));
        }

        /// <summary>
        /// An airport centred on the tile, powered in its tiles and in the power grid a scan reads, and its centre.
        /// </summary>
        public Position BuildAirport(int x, int y)
        {
            Map.PutZone(x, y, AIRPORT, 6);

            for (int tileY = y - 1; tileY <= y + 4; tileY++)
            {
                for (int tileX = x - 1; tileX <= x + 4; tileX++)
                {
                    Map.AddTileFlags(tileX, tileY, POWERBIT);
                    City.PowerManager.PowerGridMap.WorldSet(tileX, tileY, 1);
                }
            }

            return new Position(x, y);
        }

        /// <summary>
        /// Bulldozes the airport centred on the tile to dirt.
        /// </summary>
        public void Bulldoze(Position airport)
        {
            for (int y = airport.Y - 1; y <= airport.Y + 4; y++)
            {
                for (int x = airport.X - 1; x <= airport.X + 4; x++)
                {
                    Map.SetTile(x, y, DIRT, NOFLAGS);
                }
            }
        }

        /// <summary>
        /// Runs every tile's handler over the whole map, as the scan phases do between them.
        /// </summary>
        public void Scan()
        {
            City.MapScanner.MapScan(0, Map.Width, City.ConstructSimData());
        }

        public void Step()
        {
            Sprites.MoveObjects(City.ConstructSimData());
        }

        /// <summary>
        /// Steps the sprites until the condition holds, and the steps that took, failing after the most given.
        /// </summary>
        public int StepUntil(Func<bool> condition, int most = 5000)
        {
            for (int steps = 0; steps <= most; steps++)
            {
                if (condition())
                {
                    return steps;
                }

                Step();
            }

            Assert.Fail($"The condition didn't hold within {most} steps.");
            return most;
        }

        /// <summary>
        /// The pixel of the sprite's hot spot.
        /// </summary>
        public static (long X, long Y) HotSpot(Sprite sprite)
        {
            return (sprite.X + sprite.XHot, sprite.Y + sprite.YHot);
        }
    }
}
