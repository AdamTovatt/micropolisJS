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
    /// A city on a small map drawn in text, a character a tile, for the ships' tests: <c>.</c> dirt, <c>~</c> river,
    /// <c>c</c> channel, <c>s</c> shore, <c>=</c> a horizontal road bridge, <c>|</c> a vertical one, <c>-</c> a
    /// horizontal road on land, <c>w</c> wire over
    /// water, <c>r</c> rail over water, and a capital letter the centre of a powered seaport, whose footprint the
    /// letter's surroundings give way to. Its sprites move only when a test steps them, and no scan runs, so a port
    /// stays as the test leaves it.
    /// </summary>
    internal sealed class ShipWaters
    {
        private readonly Dictionary<char, Position> _ports = new Dictionary<char, Position>();

        private ShipWaters(Simulation city)
        {
            City = city;
        }

        public Simulation City { get; }

        public GameMap Map => City.Map;

        public SpriteManager Sprites => City.SpriteManager;

        /// <summary>
        /// The live ship, or <see langword="null"/>.
        /// </summary>
        public Sprite? Ship => Sprites.GetSprite(SpriteType.Ship);

        public static ShipWaters Of(params string[] rows)
        {
            GameMap blank = new GameMap(rows[0].Length, rows.Length);
            ShipWaters waters = new ShipWaters(Simulation.NewCity(blank, 1, Level.Easy, Speed.Medium));

            // The scan of the new city has run: what is drawn now stays as drawn
            for (int y = 0; y < rows.Length; y++)
            {
                for (int x = 0; x < rows[y].Length; x++)
                {
                    waters.Draw(x, y, rows[y][x]);
                }
            }

            foreach (Position port in waters._ports.Values)
            {
                waters.Map.PutZone(port.X, port.Y, PORT, 4);
                waters.SetPower(port, true);
            }

            return waters;
        }

        public Position Port(char label)
        {
            return _ports[label];
        }

        /// <summary>
        /// Powers the port's footprint, or cuts its power, in its tiles and in the power grid a scan reads.
        /// </summary>
        public void SetPower(Position port, bool powered)
        {
            for (int y = port.Y - 1; y <= port.Y + 2; y++)
            {
                for (int x = port.X - 1; x <= port.X + 2; x++)
                {
                    City.PowerManager.PowerGridMap.WorldSet(x, y, powered ? 1 : 0);

                    if (powered)
                    {
                        Map.AddTileFlags(x, y, POWERBIT);
                    }
                    else
                    {
                        Map.RemoveTileFlags(x, y, POWERBIT);
                    }
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

        /// <summary>
        /// The tile a ship stands on, which it has to be on one, between moves.
        /// </summary>
        public static Position TileOf(Sprite ship)
        {
            Assert.IsTrue(ShipSprite.IsOnTile(ship), $"The ship at ({ship.X}, {ship.Y}) is between tiles.");

            return ShipSprite.TileUnder(ship);
        }

        /// <summary>
        /// A ship standing on the tile, its phase and port as given.
        /// </summary>
        public Sprite PlaceShip(int x, int y, ShipPhase phase, Position? port)
        {
            Sprite ship = Sprites.MakeShipHere(x, y);
            ship.Mission!.Phase = phase;
            ship.Mission!.Port = port;
            return ship;
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
        /// Every tile's raw value, value and flags.
        /// </summary>
        public int[] RawTiles()
        {
            return Map.RawValues();
        }

        private void Draw(int x, int y, char c)
        {
            if (char.IsUpper(c))
            {
                _ports[c] = new Position(x, y);
                return;
            }

            int raw = c switch
            {
                '.' => DIRT,
                '~' => RIVER,
                'c' => CHANNEL,
                's' => FIRSTRIVEDGE | BULLBIT,
                '=' => HBRIDGE | BULLBIT,
                '|' => VBRIDGE | BULLBIT,
                '-' => ROADS | BULLBIT | BURNBIT,
                'w' => HPOWER | CONDBIT,
                'r' => HRAIL | BULLBIT,
                _ => throw new ArgumentException($"No tile is drawn as '{c}'."),
            };

            Map.GetTile(x, y).SetRawValue(raw);
        }
    }
}
