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

using static Micropolis.Rules.TileValues;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The ship that sails in from the map's edge to a seaport, docks, and sails out by the nearest edge, on small maps
    /// drawn in text (<see cref="ShipWaters"/>).
    /// </summary>
    [TestClass]
    public sealed class ShipSpriteTests
    {
        // A river of plain water, no channel, from the west edge to the dock tiles of the port P south of it: its
        // footprint's top row is y 3, so the river's rows 1 and 2 are within two tiles of it, from x 12 to 19
        private static readonly string[] WestRiver =
        [
            "........................",
            "~~~~~~~~~~~~~~~~~~~~....",
            "~~~~~~~~~~~~~~~~~~~~....",
            "........................",
            "...............P........",
            "........................",
            "........................",
            "........................",
        ];

        // A river across the map, edge to edge, with three ports south of it: F's dock tiles from x 0 to 7, P's from
        // 11 to 18 and N's from 22 to 29
        private static readonly string[] ThreePorts =
        [
            "................................",
            "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~",
            "................................",
            "................................",
            "...F..........P..........N......",
            "................................",
            "................................",
            "................................",
        ];

        // A sea along the west edge, and two rivers from it that a channel at x 22 joins, the port's dock tiles on both:
        // from x 13 to 20 on rows 1 and 7. The port Q's dock tiles are on row 1 from x 1 to 8.
        private static readonly string[] TwoWays =
        [
            "~...............................",
            "~~~~~~~~~~~~~~~~~~~~~~~.........",
            "~.....................~.........",
            "~.....................~.........",
            "~...Q...........P.....~.........",
            "~.....................~.........",
            "~.....................~.........",
            "~~~~~~~~~~~~~~~~~~~~~~~.........",
            "~...............................",
            "~...............................",
            "~...............................",
            "~...............................",
            "~...............................",
            "~...............................",
            "~...............................",
            "~...............................",
        ];

        // A river five tiles wide from the west edge to the dock tiles of the port P east of it, at x 16, under a road
        // on a bridge at x 10, between roads along both banks. The bridge's middle tile, (10, 4), is the only one that
        // opens, so it is the river's only way through.
        private static readonly string[] Drawbridge =
        [
            "-----------------.......",
            "-----------------.......",
            "~~~~~~~~~~|~~~~~~.......",
            "~~~~~~~~~~|~~~~~~.......",
            "~~~~~~~~~~|~~~~~~..P....",
            "~~~~~~~~~~|~~~~~~.......",
            "~~~~~~~~~~|~~~~~~.......",
            "-----------------.......",
            "-----------------.......",
            "........................",
            "........................",
            "........................",
            "........................",
            "........................",
            "........................",
            "........................",
        ];

        // A lake that no water joins to the map's edge, and below it, room for a port
        private static readonly string[] Lake =
        [
            "................",
            ".~~~~~~~........",
            ".~~~~~~~........",
            "................",
            "................",
            "................",
            "................",
            "................",
        ];

        // The lake with a port P south of it, whose dock tiles are the lake's row 2
        private static readonly string[] LakePort = [.. Lake[..5], "....P...........", .. Lake[6..]];

        [TestMethod]
        public void GenerateShip_PoweredPortByARiver_StartsOnTheEdgeTileNearestItBoundForIt()
        {
            ShipWaters waters = ShipWaters.Of(WestRiver);

            waters.Sprites.GenerateShip(waters.Port('P').X, waters.Port('P').Y);

            // (0, 1) and (0, 2) are both 12 tiles from a dock tile: the search from the dock tiles, which looks south-west
            // before west, reaches (0, 2) first
            Sprite ship = waters.Ship!;
            Assert.AreEqual(new Position(0, 2), ShipWaters.TileOf(ship));
            Assert.AreEqual(waters.Port('P'), ship.Mission!.Port);
            Assert.AreEqual(ShipPhase.SailingIn, ship.Mission!.Phase);
        }

        [TestMethod]
        public void GenerateShip_UnpoweredPort_SendsNone()
        {
            ShipWaters waters = ShipWaters.Of(WestRiver);
            waters.SetPower(waters.Port('P'), false);

            waters.Sprites.GenerateShip(waters.Port('P').X, waters.Port('P').Y);

            Assert.IsNull(waters.Ship);
        }

        // A port's centre two rows below its footprint's top row: water two tiles from the footprint, past one ring of
        // shore, is within reach, and water three tiles from it is not
        [TestMethod]
        [DataRow(4, true)]
        [DataRow(5, false)]
        public void GenerateShip_WaterAtADistanceFromTheFootprint_SendsAShipOnlyWithinTwoTiles(int portY, bool sends)
        {
            string[] rows =
            [
                "........................",
                "~~~~~~~~~~~~~~~~~~~~....",
                "ssssssssssssssssssss....",
                "........................",
                "........................",
                "........................",
                "........................",
                "........................",
            ];
            rows[portY] = "...............P........";
            ShipWaters waters = ShipWaters.Of(rows);

            waters.Sprites.GenerateShip(waters.Port('P').X, waters.Port('P').Y);

            Assert.AreEqual(sends, waters.Ship is not null);
        }

        // Shore is not water a ship sails, so a river that only shore joins to the edge has no way in
        [TestMethod]
        public void GenerateShip_ShoreBetweenTheRiverAndTheEdge_SendsNone()
        {
            ShipWaters waters = ShipWaters.Of(WestRiver.Select(row => row[0] == '~' ? "s" + row[1..] : row).ToArray());

            waters.Sprites.GenerateShip(waters.Port('P').X, waters.Port('P').Y);

            Assert.IsNull(waters.Ship);
        }

        [TestMethod]
        public void GenerateShip_PortOnALake_SendsNone()
        {
            ShipWaters waters = ShipWaters.Of(LakePort);

            waters.Sprites.GenerateShip(waters.Port('P').X, waters.Port('P').Y);

            Assert.IsNull(waters.Ship);
        }

        // Wire and rail over the river, and a bridge's open gap, are water a ship sails under
        [TestMethod]
        public void Move_WireRailAndOpenBridgeAcrossTheRiver_SailsUnderThemToThePort()
        {
            ShipWaters waters = ShipWaters.Of(WestRiver.Select(row => row[0] == '~' ? row[..4] + "w" + row[5..6] + "r" + row[7..] : row).ToArray());
            waters.Map.SetTile(9, 1, BRWH, TileFlags.BULLBIT);
            waters.Map.SetTile(9, 2, BRWH, TileFlags.BULLBIT);
            waters.Sprites.GenerateShip(waters.Port('P').X, waters.Port('P').Y);

            waters.StepUntil(() => waters.Ship!.Mission!.Phase == ShipPhase.Docked);

            Assert.AreEqual(new Position(12, 2), ShipWaters.TileOf(waters.Ship!));
        }

        // The ship enters on row 2, whose dock tiles from x 14 to 17 lie nearest the port, but it docks at the first it
        // reaches, the nearest by path length
        [TestMethod]
        public void Move_SailingIn_DocksAtTheDockTileNearestByPathLength()
        {
            ShipWaters waters = ShipWaters.Of(WestRiver);
            waters.Sprites.GenerateShip(waters.Port('P').X, waters.Port('P').Y);

            waters.StepUntil(() => waters.Ship!.Mission!.Phase == ShipPhase.Docked);

            Assert.AreEqual(new Position(12, 2), ShipWaters.TileOf(waters.Ship!));
            Assert.AreEqual(waters.Port('P'), waters.Ship!.Mission!.Port);
        }

        [TestMethod]
        public void Move_Docked_StaysDockStepsThenLeaves()
        {
            ShipWaters waters = ShipWaters.Of(WestRiver);
            waters.Sprites.GenerateShip(waters.Port('P').X, waters.Port('P').Y);
            waters.StepUntil(() => waters.Ship!.Mission!.Phase == ShipPhase.Docked);
            Sprite ship = waters.Ship!;
            (long x, long y) = (ship.X, ship.Y);

            int docked = waters.StepUntil(() => ship.Mission!.Phase != ShipPhase.Docked);

            Assert.AreEqual(1200, docked);
            Assert.AreEqual(ShipPhase.Leaving, ship.Mission!.Phase);
            Assert.AreEqual((x, y), (ship.X, ship.Y));
        }

        // A leaving ship sails off the map by its nearest edge, the east, 11 tiles off rather than the west's 20, and is
        // gone with no wreck: no explosion, no news of one, and no tile changed
        [TestMethod]
        public void Move_Leaving_SailsOffTheNearestEdgeWithNoWreck()
        {
            ShipWaters waters = ShipWaters.Of(ThreePorts);
            Sprite ship = waters.PlaceShip(20, 1, ShipPhase.Leaving, null);
            int[] tiles = waters.RawTiles();
            List<NewsPlace> crashes = [];
            waters.Sprites.Events.AddEventListener(RulesEvents.ShipCrashed, crashes.Add);

            Assert.AreEqual(new Position(32, 1), LastTileBeforeGone(waters, ship));
            Assert.IsEmpty(waters.Sprites.GetLiveSprites());
            Assert.IsEmpty(crashes);
            CollectionAssert.AreEqual(tiles, waters.RawTiles());
        }

        // Its way along row 1 blocked, the ship turns back and takes the river along row 7 to the same port, though the
        // port Q has a dock tile a step away
        [TestMethod]
        public void Move_RouteBlocked_ReroutesToTheSamePort()
        {
            ShipWaters waters = ShipWaters.Of(TwoWays);
            Sprite ship = waters.PlaceShip(0, 1, ShipPhase.SailingIn, waters.Port('P'));
            waters.StepUntil(() => ShipAt(ship, 3, 1));

            waters.Map.SetTile(10, 1, DIRT, TileFlags.NOFLAGS);
            waters.StepUntil(() => ship.Mission!.Phase == ShipPhase.Docked);

            Assert.AreEqual(waters.Port('P'), ship.Mission!.Port);
            Assert.AreEqual(new Position(13, 7), ShipWaters.TileOf(ship));
        }

        // P loses its power: of the other ports, N's dock tiles are 2 tiles away and F's 13, though F comes first on
        // the map
        [TestMethod]
        public void Move_PortLosesPower_SailsToTheNearestOtherPort()
        {
            ShipWaters waters = ShipWaters.Of(ThreePorts);
            Sprite ship = waters.PlaceShip(20, 1, ShipPhase.SailingIn, waters.Port('P'));
            waters.SetPower(waters.Port('P'), false);

            waters.StepUntil(() => ship.Mission!.Phase == ShipPhase.Docked);

            Assert.AreEqual(waters.Port('N'), ship.Mission!.Port);
            Assert.AreEqual(new Position(22, 1), ShipWaters.TileOf(ship));
        }

        // A ship that never had a port, as a ship in an older save loads, sails to the nearest port it can: P's dock
        // tiles a tile away, F's three
        [TestMethod]
        public void Move_SailingInToNoPort_SailsToTheNearestValidPort()
        {
            ShipWaters waters = ShipWaters.Of(ThreePorts);
            Sprite ship = waters.PlaceShip(10, 1, ShipPhase.SailingIn, null);

            waters.StepUntil(() => ship.Mission!.Phase == ShipPhase.Docked);

            Assert.AreEqual(waters.Port('P'), ship.Mission!.Port);
            Assert.AreEqual(new Position(11, 1), ShipWaters.TileOf(ship));
        }

        [TestMethod]
        public void Move_NoValidPort_LeavesByTheNearestEdge()
        {
            ShipWaters waters = ShipWaters.Of(ThreePorts);
            Sprite ship = waters.PlaceShip(20, 1, ShipPhase.SailingIn, waters.Port('P'));
            foreach (char port in "FPN")
            {
                waters.SetPower(waters.Port(port), false);
            }

            waters.Step();

            Assert.AreEqual(ShipPhase.Leaving, ship.Mission!.Phase);
            Assert.IsNull(ship.Mission!.Port);
            Assert.AreEqual(new Position(32, 1), LastTileBeforeGone(waters, ship));
        }

        [TestMethod]
        public void Move_DockedAndThePortLosesPower_Leaves()
        {
            ShipWaters waters = ShipWaters.Of(WestRiver);
            waters.Sprites.GenerateShip(waters.Port('P').X, waters.Port('P').Y);
            waters.StepUntil(() => waters.Ship!.Mission!.Phase == ShipPhase.Docked);
            waters.Step();

            waters.SetPower(waters.Port('P'), false);
            waters.Step();

            Assert.AreEqual(ShipPhase.Leaving, waters.Ship!.Mission!.Phase);
        }

        // A ship on a lake with no port to sail to and no edge to leave by leaves the map where it is, with no wreck
        [TestMethod]
        public void Move_NoPortAndNoEdgeReachable_IsGoneWithNoWreck()
        {
            ShipWaters waters = ShipWaters.Of(Lake);
            Sprite ship = waters.PlaceShip(3, 1, ShipPhase.SailingIn, null);
            int[] tiles = waters.RawTiles();
            List<NewsPlace> crashes = [];
            waters.Sprites.Events.AddEventListener(RulesEvents.ShipCrashed, crashes.Add);

            waters.Step();

            Assert.AreEqual(0, ship.Frame);
            Assert.IsEmpty(waters.Sprites.GetLiveSprites());
            Assert.IsEmpty(crashes);
            CollectionAssert.AreEqual(tiles, waters.RawTiles());
        }

        // The original's ship wrecks where it finds no way on; this one, docked by a lake's port, waits its time and
        // goes, with no wreck
        [TestMethod]
        public void Move_DockedOnALake_NeverWrecks()
        {
            ShipWaters waters = ShipWaters.Of(LakePort);
            Sprite ship = waters.PlaceShip(7, 1, ShipPhase.SailingIn, waters.Port('P'));
            int[] tiles = waters.RawTiles();

            waters.StepUntil(() => ship.Frame == 0, 2000);

            Assert.IsEmpty(waters.Sprites.SpriteList.Where(sprite => sprite.Type == SpriteType.Explosion));
            CollectionAssert.AreEqual(tiles, waters.RawTiles());
        }

        // The bridge opens as the ship sails through, centred on the tile it sails through, writing only the bridge's
        // seven tiles, whatever the roads along the banks are; once the ship has docked, four tiles off, the scans close
        // it again, as they would not for a channel's bridge, which waits for a ship to be 340 pixels away
        [TestMethod]
        public void Move_ClosedBridgeOnTheRoute_OpensForTheShipAndClosesBehindIt()
        {
            ShipWaters waters = ShipWaters.Of(Drawbridge);
            int[] closed = waters.RawTiles();
            Sprite ship = waters.PlaceShip(0, 4, ShipPhase.SailingIn, waters.Port('P'));

            waters.StepUntil(() => ShipAt(ship, 11, 4));

            int[] open = (int[])closed.Clone();
            foreach ((int x, int y, int raw) in new[]
            {
                (10, 2, VBRDG0 | TileFlags.BULLBIT), (11, 2, VBRDG1 | TileFlags.BULLBIT), (10, 3, RIVER),
                (10, 4, BRWV | TileFlags.BULLBIT), (10, 5, RIVER), (10, 6, VBRDG2 | TileFlags.BULLBIT),
                (11, 6, VBRDG3 | TileFlags.BULLBIT),
            })
            {
                open[x + y * waters.Map.Width] = raw;
            }
            CollectionAssert.AreEqual(open, waters.RawTiles());

            waters.StepUntil(() => ship.Mission!.Phase == ShipPhase.Docked);
            for (int scan = 0; scan < 100 && waters.Map.GetTileValue(10, 4) == BRWV; scan++)
            {
                waters.Scan();
            }

            // The river and its banks, west of the port, whose tiles a scan may change
            CollectionAssert.AreEqual(Within(closed, waters.Map.Width, 17, 9), Within(waters.RawTiles(), waters.Map.Width, 17, 9));
        }

        // A bridge across a river three tiles wide has no middle tile with a closed bridge's five tiles in a line and
        // water at its corners, so it opens for no ship, which finds no way through and leaves by the edge it is on
        [TestMethod]
        public void Move_BridgeTooShortToOpen_IsNoWayThrough()
        {
            ShipWaters waters = ShipWaters.Of(Drawbridge.Select((row, y) => y is 2 or 6 ? "-----------------......." : row).ToArray());
            int[] tiles = waters.RawTiles();
            Sprite ship = waters.PlaceShip(0, 4, ShipPhase.SailingIn, waters.Port('P'));

            Assert.AreEqual(new Position(-1, 4), LastTileBeforeGone(waters, ship));
            Assert.AreEqual(ShipPhase.Leaving, ship.Mission!.Phase);
            CollectionAssert.AreEqual(tiles, waters.RawTiles());
        }

        // A bridge across a river seven tiles wide stands open around (10, 5), its raised end on (10, 3), the row the
        // ship sails in on: the ship sails through the open gap instead, and opens nothing more
        [TestMethod]
        public void Move_BridgeOpenAroundAnotherTile_SailsThroughItsGap()
        {
            ShipWaters waters = ShipWaters.Of(
            [
                "-----------------.......",
                .. Enumerable.Repeat("~~~~~~~~~~|~~~~~~.......", 7).Select((row, y) => y == 3 ? row[..19] + "P" + row[20..] : row),
                "-----------------.......",
                .. Enumerable.Repeat("........................", 7),
            ]);
            Road.OpenForShip(waters.Map, 10, 5);
            int[] tiles = waters.RawTiles();
            Sprite ship = waters.PlaceShip(0, 3, ShipPhase.SailingIn, waters.Port('P'));

            waters.StepUntil(() => ship.Mission!.Phase == ShipPhase.Docked);

            CollectionAssert.AreEqual(tiles, waters.RawTiles());
        }

        // A ship turns 45° at a time, every 9 steps, and sails on only once it faces its way: this one, facing east,
        // turns three times to face south-west, its first step of the shortest way to the west edge, and sails on the
        // step after the last turn
        [TestMethod]
        public void Move_FacingAwayFromItsWay_TurnsAnEighthEveryNineStepsBeforeSailing()
        {
            ShipWaters waters = ShipWaters.Of(WestRiver);
            Sprite ship = waters.PlaceShip(5, 1, ShipPhase.Leaving, null);
            Assert.AreEqual(3, ship.Frame);
            List<int> turns = [];
            int step = 0;

            while (ShipAt(ship, 5, 1))
            {
                long frame = ship.Frame;
                waters.Step();
                step++;

                if (ship.Frame != frame)
                {
                    Assert.AreEqual(frame + 1, ship.Frame, $"The ship turned from {frame} to {ship.Frame}.");
                    turns.Add(step);
                }
            }

            CollectionAssert.AreEqual(new[] { 1, 10, 19 }, turns);
            Assert.AreEqual((20, 6), (step, ship.Frame));
        }

        // A ship between two tiles whose port loses its power is sent to the nearest other port there, before it
        // reaches the tile
        [TestMethod]
        public void Move_PortLosesPowerBetweenTiles_SailsToTheNearestOtherPort()
        {
            ShipWaters waters = ShipWaters.Of(ThreePorts);
            Sprite ship = waters.PlaceShip(20, 1, ShipPhase.SailingIn, waters.Port('P'));
            waters.StepUntil(() => !ShipSprite.IsOnTile(ship));
            waters.SetPower(waters.Port('P'), false);

            waters.Step();

            Assert.IsFalse(ShipSprite.IsOnTile(ship));
            Assert.AreEqual(waters.Port('N'), ship.Mission!.Port);
            waters.StepUntil(() => ship.Mission!.Phase == ShipPhase.Docked);
            Assert.AreEqual(new Position(22, 1), ShipWaters.TileOf(ship));
        }

        [TestMethod]
        public void Move_TornadoOverTheShip_Wrecks()
        {
            ShipWaters waters = ShipWaters.Of(WestRiver);
            Sprite ship = waters.PlaceShip(5, 1, ShipPhase.SailingIn, waters.Port('P'));
            List<NewsPlace> crashes = [];
            waters.Sprites.Events.AddEventListener(RulesEvents.ShipCrashed, crashes.Add);
            // The tornado's hot spot, 40 and 36 pixels into its frame, on the ship's
            waters.Sprites.MakeSprite(SpriteType.Tornado, ship.X + ship.XHot - 40, ship.Y + ship.YHot - 36);

            waters.Step();

            Assert.AreEqual(0, ship.Frame);
            Assert.HasCount(1, crashes);
        }

        // A scan finds both ports with a ship sailing, and calls no other: the ship stays where it sailed to
        [TestMethod]
        public void PortFound_ShipSailing_CallsNoOther()
        {
            ShipWaters waters = ShipWaters.Of(TwoWays);
            waters.Scan();
            Sprite ship = waters.Ship!;
            for (int step = 0; step < 20; step++)
            {
                waters.Step();
            }

            (long x, long y) = (ship.X, ship.Y);
            waters.Scan();

            Assert.AreEqual((x, y), (ship.X, ship.Y));
            Assert.HasCount(1, waters.Sprites.SpriteList.Where(sprite => sprite.Type == SpriteType.Ship));
        }

        // A ship saved and loaded sails on as the ship never saved does, its mission saved and its route found again from
        // the map: sailing in and leaving, saved between two tiles, and docked, part of its time there gone
        [TestMethod]
        [DataRow(ShipPhase.SailingIn)]
        [DataRow(ShipPhase.Docked)]
        [DataRow(ShipPhase.Leaving)]
        public void Save_ShipInEachPhase_LoadsToTheSameVoyage(ShipPhase phase)
        {
            ShipWaters waters = ShipWaters.Of(WestRiver);
            waters.Sprites.GenerateShip(waters.Port('P').X, waters.Port('P').Y);
            Sprite ship = waters.Ship!;
            waters.StepUntil(() => ship.Mission!.Phase == phase && (phase == ShipPhase.Docked ? ship.Mission!.DockCount < 500 : !ShipSprite.IsOnTile(ship)));

            Simulation loaded = Simulation.FromSave(CanonicalJson.Write(waters.City.Save()));
            ShipMission mission = loaded.SpriteManager.GetSprite(SpriteType.Ship)!.Mission!;
            Assert.AreEqual((ship.Mission!.Phase, ship.Mission!.Port, ship.Mission!.DockCount), (mission.Phase, mission.Port, mission.DockCount));

            for (int step = 0; step < 1500; step++)
            {
                waters.Step();
                loaded.SpriteManager.MoveObjects(loaded.ConstructSimData());
            }

            Assert.AreEqual(CanonicalJson.Write(waters.City.Save()), CanonicalJson.Write(loaded.Save()));
        }

        // The last tile the ship stands on, off the map for a ship that sails off it, before it is gone
        private static Position LastTileBeforeGone(ShipWaters waters, Sprite ship)
        {
            Position last = new Position(-1, -1);

            waters.StepUntil(() =>
            {
                if (ship.Frame != 0 && ShipSprite.IsOnTile(ship))
                {
                    last = ShipWaters.TileOf(ship);
                }

                return ship.Frame == 0;
            });

            return last;
        }

        private static bool ShipAt(Sprite ship, int x, int y)
        {
            return ship.X == ShipSprite.PixelX(x) && ship.Y == ShipSprite.PixelY(y);
        }

        // The tiles of the map west of x and north of y, row by row
        private static int[] Within(int[] tiles, int width, int x, int y)
        {
            return tiles.Where((_, index) => index % width < x && index / width < y).ToArray();
        }
    }
}
