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
    /// The tile ids, under the original's names, so the rules read side by side with it.
    /// </summary>
    public static class TileValues
    {
        public const int DIRT = 0; // Clear tile
        // tile 1 ?

        /* Water */
        public const int RIVER = 2;
        public const int REDGE = 3;
        public const int CHANNEL = 4;
        public const int FIRSTRIVEDGE = 5;
        // tile 6 -- 19 ?
        public const int LASTRIVEDGE = 20;
        public const int WATER_LOW = RIVER; // First water tile
        public const int WATER_HIGH = LASTRIVEDGE; // Last water tile (inclusive)

        public const int TREEBASE = 21;
        public const int WOODS_LOW = TREEBASE;
        public const int LASTTREE = 36;
        public const int WOODS = 37;
        public const int UNUSED_TRASH1 = 38;
        public const int UNUSED_TRASH2 = 39;
        public const int WOODS_HIGH = UNUSED_TRASH2; // Why is an 'UNUSED' tile used?
        public const int WOODS2 = 40;
        public const int WOODS3 = 41;
        public const int WOODS4 = 42;
        public const int WOODS5 = 43;

        /* Rubble (4 tiles) */
        public const int RUBBLE = 44;
        public const int LASTRUBBLE = 47;

        public const int FLOOD = 48;
        // tile 49, 50 ?
        public const int LASTFLOOD = 51;

        public const int RADTILE = 52; // Radio-active contaminated tile

        public const int UNUSED_TRASH3 = 53;
        public const int UNUSED_TRASH4 = 54;
        public const int UNUSED_TRASH5 = 55;

        /* Fire animation (8 tiles) */
        public const int FIRE = 56;
        public const int FIREBASE = FIRE;
        public const int LASTFIRE = 63;

        public const int HBRIDGE = 64; // Horizontal bridge
        public const int ROADBASE = HBRIDGE;
        public const int VBRIDGE = 65; // Vertical bridge
        public const int ROADS = 66;
        public const int ROADS2 = 67;
        public const int ROADS3 = 68;
        public const int ROADS4 = 69;
        public const int ROADS5 = 70;
        public const int ROADS6 = 71;
        public const int ROADS7 = 72;
        public const int ROADS8 = 73;
        public const int ROADS9 = 74;
        public const int ROADS10 = 75;
        public const int INTERSECTION = 76;
        public const int HROADPOWER = 77;
        public const int VROADPOWER = 78;
        public const int BRWH = 79;
        public const int LTRFBASE = 80; // First tile with low traffic
        // tile 81 -- 94 ?
        public const int BRWV = 95;
        // tile 96 -- 110 ?
        public const int BRWXXX1 = 111;
        // tile 96 -- 110 ?
        public const int BRWXXX2 = 127;
        // tile 96 -- 110 ?
        public const int BRWXXX3 = 143;
        public const int HTRFBASE = 144; // First tile with high traffic
        // tile 145 -- 158 ?
        public const int BRWXXX4 = 159;
        // tile 160 -- 174 ?
        public const int BRWXXX5 = 175;
        // tile 176 -- 190 ?
        public const int BRWXXX6 = 191;
        // tile 192 -- 205 ?
        public const int LASTROAD = 206;
        public const int BRWXXX7 = 207;

        /* Power lines */
        public const int HPOWER = 208;
        public const int VPOWER = 209;
        public const int LHPOWER = 210;
        public const int LVPOWER = 211;
        public const int LVPOWER2 = 212;
        public const int LVPOWER3 = 213;
        public const int LVPOWER4 = 214;
        public const int LVPOWER5 = 215;
        public const int LVPOWER6 = 216;
        public const int LVPOWER7 = 217;
        public const int LVPOWER8 = 218;
        public const int LVPOWER9 = 219;
        public const int LVPOWER10 = 220;
        public const int RAILHPOWERV = 221; // Horizontal rail, vertical power
        public const int RAILVPOWERH = 222; // Vertical rail, horizontal power
        public const int POWERBASE = HPOWER;
        public const int LASTPOWER = RAILVPOWERH;

        public const int UNUSED_TRASH6 = 223;

        /* Rail */
        public const int HRAIL = 224;
        public const int VRAIL = 225;
        public const int LHRAIL = 226;
        public const int LVRAIL = 227;
        public const int LVRAIL2 = 228;
        public const int LVRAIL3 = 229;
        public const int LVRAIL4 = 230;
        public const int LVRAIL5 = 231;
        public const int LVRAIL6 = 232;
        public const int LVRAIL7 = 233;
        public const int LVRAIL8 = 234;
        public const int LVRAIL9 = 235;
        public const int LVRAIL10 = 236;
        public const int HRAILROAD = 237;
        public const int VRAILROAD = 238;
        public const int RAILBASE = HRAIL;
        public const int LASTRAIL = 238;

        public const int ROADVPOWERH = 239; /* bogus? */

        // Residential zone tiles

        public const int RESBASE = 240; // Empty residential, tiles 240--248
        public const int FREEZ = 244; // center-tile of 3x3 empty residential

        public const int HOUSE = 249; // Single tile houses until 260
        public const int LHTHR = HOUSE;
        public const int HHTHR = 260;

        public const int RZB = 265; // center tile first 3x3 tile residential

        public const int HOSPITALBASE = 405; // Center of hospital (tiles 405--413)
        public const int HOSPITAL = 409; // Center of hospital (tiles 405--413)

        public const int CHURCHBASE = 414; // Center of church (tiles 414--422)
        public const int CHURCH0BASE = 414; // numbered alias
        public const int CHURCH = 418; // Center of church (tiles 414--422)
        public const int CHURCH0 = 418; // numbered alias

        // Commercial zone tiles

        public const int COMBASE = 423; // Empty commercial, tiles 423--431
        // tile 424 -- 426 ?
        public const int COMCLR = 427;
        // tile 428 -- 435 ?
        public const int CZB = 436;
        // tile 437 -- 608 ?
        public const int COMLAST = 609;
        // tile 610, 611 ?

        // Industrial zone tiles.
        public const int INDBASE = 612; // Top-left tile of empty industrial zone.
        public const int INDCLR = 616; // Center tile of empty industrial zone.
        public const int LASTIND = 620; // Last tile of empty industrial zone.

        // Industrial zone population 0, value 0: 621 -- 629
        public const int IND1 = 621; // Top-left tile of first non-empty industry zone.
        public const int IZB = 625; // Center tile of first non-empty industry zone.

        // Industrial zone population 1, value 0: 630 -- 638

        // Industrial zone population 2, value 0: 639 -- 647
        public const int IND2 = 641;
        public const int IND3 = 644;

        // Industrial zone population 3, value 0: 648 -- 656
        public const int IND4 = 649;
        public const int IND5 = 650;

        // Industrial zone population 0, value 1: 657 -- 665

        // Industrial zone population 1, value 1: 666 -- 674

        // Industrial zone population 2, value 1: 675 -- 683
        public const int IND6 = 676;
        public const int IND7 = 677;

        // Industrial zone population 3, value 1: 684 -- 692
        public const int IND8 = 686;
        public const int IND9 = 689;

        // Seaport
        public const int PORTBASE = 693; // Top-left tile of the seaport.
        public const int PORT = 698; // Center tile of the seaport.
        public const int LASTPORT = 708; // Last tile of the seaport.

        public const int AIRPORTBASE = 709;
        // tile 710 ?
        public const int RADAR = 711;
        // tile 712 -- 715 ?
        public const int AIRPORT = 716;
        // tile 717 -- 744 ?

        // Coal power plant (4x4).
        public const int COALBASE = 745; // First tile of coal power plant.
        public const int POWERPLANT = 750; // 'Center' tile of coal power plant.
        public const int LASTPOWERPLANT = 760; // Last tile of coal power plant.

        // Fire station (3x3).
        public const int FIRESTBASE = 761; // First tile of fire station.
        public const int FIRESTATION = 765; // 'Center tile' of fire station.
        // 769 last tile fire station.

        public const int POLICESTBASE = 770;
        // tile 771 -- 773 ?
        public const int POLICESTATION = 774;
        // tile 775 -- 778 ?

        // Stadium (4x4).
        public const int STADIUMBASE = 779; // First tile stadium.
        public const int STADIUM = 784; // 'Center tile' stadium.
        // Last tile stadium 794.

        // tile 785 -- 799 ?
        public const int FULLSTADIUM = 800;
        // tile 801 -- 810 ?

        // Nuclear power plant (4x4).
        public const int NUCLEARBASE = 811; // First tile nuclear power plant.
        public const int NUCLEAR = 816; // 'Center' tile nuclear power plant.
        public const int LASTZONE = 826; // Also last tile nuclear power plant.

        public const int LIGHTNINGBOLT = 827;
        public const int HBRDG0 = 828;
        public const int HBRDG1 = 829;
        public const int HBRDG2 = 830;
        public const int HBRDG3 = 831;
        public const int HBRDG_END = 832;
        public const int RADAR0 = 832;
        public const int RADAR1 = 833;
        public const int RADAR2 = 834;
        public const int RADAR3 = 835;
        public const int RADAR4 = 836;
        public const int RADAR5 = 837;
        public const int RADAR6 = 838;
        public const int RADAR7 = 839;
        public const int FOUNTAIN = 840;
        // tile 841 -- 843: the original's fountain animation, which the client never draws: the park tool lays only
        // 840.
        public const int INDBASE2 = 844;
        public const int TELEBASE = 844;
        // tile 845 -- 850 ?
        public const int TELELAST = 851;
        public const int SMOKEBASE = 852;
        // tile 853 -- 859 ?
        public const int TINYEXP = 860;
        // tile 861 -- 863 ?
        public const int SOMETINYEXP = 864;
        // tile 865 -- 866 ?
        public const int LASTTINYEXP = 867;
        // tile 868 -- 882 ?
        public const int TINYEXPLAST = 883;
        // tile 884 -- 915 ?

        public const int COALSMOKE1 = 916; // Chimney animation at coal power plant (2, 0).
        // 919 last animation tile for chimney at coal power plant (2, 0).

        public const int COALSMOKE2 = 920; // Chimney animation at coal power plant (3, 0).
        // 923 last animation tile for chimney at coal power plant (3, 0).

        public const int COALSMOKE3 = 924; // Chimney animation at coal power plant (2, 1).
        // 927 last animation tile for chimney at coal power plant (2, 1).

        public const int COALSMOKE4 = 928; // Chimney animation at coal power plant (3, 1).
        // 931 last animation tile for chimney at coal power plant (3, 1).

        public const int FOOTBALLGAME1 = 932;
        // tile 933 -- 939 ?
        public const int FOOTBALLGAME2 = 940;
        // tile 941 -- 947 ?
        public const int VBRDG0 = 948;
        public const int VBRDG1 = 949;
        public const int VBRDG2 = 950;
        public const int VBRDG3 = 951;

        public const int NUKESWIRL1 = 952;
        public const int NUKESWIRL2 = 953;
        public const int NUKESWIRL3 = 954;
        public const int NUKESWIRL4 = 955;

        // 956-959 unused (originally)
        // original tile count = 960;

        // Extended zones: 956-1019
        public const int CHURCH1BASE = 956;
        public const int CHURCH1 = 960;
        public const int CHURCH2BASE = 965;
        public const int CHURCH2 = 969;
        public const int CHURCH3BASE = 974;
        public const int CHURCH3 = 978;
        public const int CHURCH4BASE = 983;
        public const int CHURCH4 = 987;
        public const int CHURCH5BASE = 992;
        public const int CHURCH5 = 996;
        public const int CHURCH6BASE = 1001;
        public const int CHURCH6 = 1005;
        public const int CHURCH7BASE = 1010;
        public const int CHURCH7 = 1014;
        public const int CHURCH7LAST = 1018;

        // Rail stations, a tile each, through which the track runs on: east and west, or north and south
        public const int HRAILSTATION = 1020;
        public const int VRAILSTATION = 1021;

        // tiles 1022-1023 unused

        public const int TILE_COUNT = 1024;

        public const int TILE_INVALID = -1; // Invalid tile (not used in the world map).
    }
}
