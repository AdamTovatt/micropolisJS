# micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
# Copyright (C) 2026 Adam Tovatt
#
# This code is released under the GNU GPL v3, with some additional terms.
# Please see the files LICENSE and COPYING for details. Alternatively,
# consult http://micropolisjs.graememcc.co.uk/LICENSE and
# http://micropolisjs.graememcc.co.uk/COPYING
#
# The name/term "MICROPOLIS" is a registered trademark of Micropolis (https://www.micropolis.com) GmbH
# (Micropolis Corporation, the "licensor") and is licensed here to the authors/publishers of the "Micropolis"
# city simulation game and its source code (the project or "licensee(s)") as a courtesy of the owner.
#

"""What the art tools share: which design fills which tile ids and sprite frames, and the one way to
load an asset's layers.

A design is an asset rendered into art/blender/out and painted into art/painted/out, which are laid
out alike: a single tile set's tiles in <set>/<id>, the tile id in four digits; a zone in <zone>, its
animated tiles' frames in <zone>/frame-<n>; a vehicle's frames in <vehicle>/<frame>, two digits.
Tile ids are numbered as src/tileValues.ts numbers them. Every tile id the art fills is written in
this file and nowhere else in art/tools/. Needs Pillow.
"""

import json
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, '..')
RENDERS = os.path.join(ART, 'blender', 'out')      # the renders, committed, which the join reads
PAINTED = os.path.join(ART, 'painted', 'out')      # the painted layers, committed
BUILT = os.path.join(ART, 'painted', 'built')      # each painted single tile's BUILT_LAYERS as the paint build
                                                   # made them, before the join, committed
IMAGES = os.path.join(ART, '..', 'images')         # where the atlas build writes what the game draws

TILE_PX = 64                   # the art's pixels a tile (TILE_PX in art/blender/tileart.py)
SHEET_PX = 16                  # the 16 px sheets: 16 px tiles, 32 a row
SHEET_COLUMNS = 32
SPRITE_CELL = 48               # the sprite sheet: a 48 px cell per frame, a row per sprite type

# The game's 16 px sheets as they were before any art was painted into them, from which the atlas
# build writes the shipped sheets in images/
ORIGINAL_TILES = os.path.join(ART, 'sheets', 'tiles-original.png')
ORIGINAL_SPRITES = os.path.join(ART, 'sheets', 'sprites-original.png')

# Single tiles the tools name, as src/tileValues.ts names them
DIRT = 0
RIVER = 2
WOODS_LOW, WOODS_HIGH = 21, 39             # the woods, which the game draws as the canopy over the world grass, from
                                           # where they lie on the map, not as single tiles (grass.py)
HBRIDGE, VBRIDGE, ROADS, ROADS2 = 64, 65, 66, 67
HPOWER, VPOWER, LHPOWER, LVPOWER = 208, 209, 210, 211
HRAIL, VRAIL, LHRAIL, LVRAIL = 224, 225, 226, 227

_ROAD_PIECES = range(HBRIDGE, 79)          # each road piece: the bridges, roads, junction and the roads under a
                                           # power line (art/blender/tiles/roads.py)

# Each single tile set and the tile ids it renders, in named groups, a tile in one group only. The rules' traffic tiles
# have none: the game draws them as the plain road they run on, and its traffic as cars (CAR)
SINGLE_TILES = {
    'land': {'land': (DIRT,)},
    'water': {'water': range(RIVER, 21)},                  # open water and the river's shores
    'parks': {'gardens': range(40, 44), 'fountain': (840,)},
    'rubble': {'rubble': range(44, 48), 'explosion': range(860, 868)},   # the bulldozer's small explosion
    'roads': {
        'pieces': _ROAD_PIECES,
        'second_road_under_power': (239,),
        'open_water': range(79, 208, 16),                  # an open drawbridge's middle, and its frames
        'drawbridge_h': range(828, 832),                   # open for a ship, east-west and north-south
        'drawbridge_v': range(948, 952),
    },
    'power': {'lines': range(HPOWER, 221), 'unpowered': (827,)},   # the unpowered zone's warning
    'rail': {'rail': (221, 222, *range(HRAIL, 239)),       # rail, its bridges and crossings
             'stations': (1020, 1021)},                    # the station on straight track
    'houses': {'houses': range(249, 261)},                 # the single-tile houses a residential zone grows
}


# The tiles the game draws in place of another asset's tile, which are drawn whole as objects too, opaque, so no
# shadow darkens them: the warning an unpowered zone or service building blinks in place of its centre, where a
# building's own shadow lies dense under the roof the warning replaces
OVER_SHADOWS = set(SINGLE_TILES['power']['unpowered'])

# The single tiles whose painted layers the paint build's join leaves as the build made them, each with why. The
# join gives a tile a donor's painting wherever their renders agree to within a few levels, which on a tile that
# shares no surface with a donor are only stray pixels that happen to match (join() in tools/paint.py)
NOT_JOINED = {
    # each house stands on its own lawn, which no donor paints
    *SINGLE_TILES['houses']['houses'],
    # the fountain stands on its own lawn, which no donor paints. Its built layers are its painting's record: its
    # paint job was laid out with the fountain's retired frames 841 to 843 beside it, whose renders
    # art/blender/tiles/parks.py no longer makes, so the job cannot be built again as it was painted
    *SINGLE_TILES['parks']['fountain'],
}


def single_tile_ids(name):
    # every tile id a single tile set renders, low to high
    return sorted(t for ids in SINGLE_TILES[name].values() for t in ids)


def tile_asset(name, tile_id):
    # the asset of a tile of a single tile set: '<set>/<id>', the id in four digits
    return f'{name}/{tile_id:04d}'


def single_tile(tile_id):
    # the asset of a single tile, or None if no set renders it
    for name in SINGLE_TILES:
        if tile_id in single_tile_ids(name):
            return tile_asset(name, tile_id)
    return None


def single_tile_assets():
    # every single tile's asset, by set, low to high
    return [tile_asset(name, t) for name in SINGLE_TILES for t in single_tile_ids(name)]


def is_joined(asset):
    # whether the join gives a single tile's asset its donors' paintings: every one's but those NOT_JOINED names
    return int(asset.split('/')[1]) not in NOT_JOINED


def built_tiles(root=BUILT):
    # every single tile with built layers under `root`, by its asset name
    return sorted(f'{s}/{t}' for s in os.listdir(root) for t in os.listdir(os.path.join(root, s)))


def built_layers(asset, root=BUILT):
    # a single tile's built layers, BUILT_LAYERS by name, as RGBA; one missing fails, naming it
    directory = os.path.join(root, asset)
    missing = [k for k in BUILT_LAYERS if not os.path.exists(os.path.join(directory, f'{k}.png'))]
    if missing:
        raise FileNotFoundError(f'{directory} has no {" or ".join(f"{k}.png" for k in missing)}')
    return {k: Image.open(os.path.join(directory, f'{k}.png')).convert('RGBA') for k in BUILT_LAYERS}


def _slots(kind, first, grid):
    # A populated zone's designs by slot: the game picks slot = land value * densities + density
    # (PlaceResidential, PlaceCommercial, PlaceIndustrial in the C# rules), nine ids each from `first`. `grid`
    # has a row per land value, low to high, and in it a design per density, low to high
    return {f'{kind}_{design}': first + 9 * slot
            for slot, design in enumerate(design for row in grid for design in row)}


# Each zone's first tile id, its top-left, from which its ids run in rows (BuildingTool in the C# rules).
# A populated zone's design is chosen by what it shows: denser across a row, from bare ground and
# car parks to gardens, plazas and glass down the rows.
ZONES = {
    'residential_empty': 240,
    **_slots('residential', 261, [
        ('grey_l_on_bare_ground', 'red_blue_over_car_park', 'blue_c_block', 'grey_ring'),
        ('blue_and_green_houses', 'domed_hall_and_blocks', 'blue_l_tall_wing', 'three_towers'),
        ('red_and_blue', 'brick_s_block_and_blue_roofs', 'courtyard_block', 'white_blocks_and_terraces'),
        ('apartment_slabs', 'green_l_block', 'grey_blocks_and_fountain', 'round_towers'),
    ]),
    'hospital': 405,
    'commercial_empty': 423,
    **_slots('commercial', 432, [
        ('tank_under_construction', 'long_block_and_parking_court', 'brick_l_and_grey_tower', 'round_tower',
         'glass_tower'),
        ('radio_mast_and_car_park', 'offices_and_store', 'green_l_and_tower', 'blue_tower_wings', 'twin_towers'),
        ('strip_mall_and_car_park', 'office_park', 'green_red_glass_court', 'green_tower', 'dark_glass_tower'),
        ('long_store_and_car_park', 'offices_and_fountain_plaza', 'domes_and_l_block', 'stepped_terrace',
         'white_tower_on_pyramids'),
    ]),
    'industrial_empty': 612,
    **_slots('industrial', 621, [
        ('workshop_yard', 'scrapyard', 'brick_factory', 'steel_mill'),
        ('warehouse', 'chemical_works', 'large_factory', 'sawtooth_plant'),
    ]),
    'seaport': 693,
    'airport': 709,
    'coal_power_plant': 745,
    'fire_station': 761,
    'police_station': 770,
    'stadium_empty': 779,
    'stadium_full': 795,
    'nuclear_power_plant': 811,
}

# The tiles of a zone the game animates, each with its frames' ids in the order src/animationManager.ts
# cycles them, which the zone renders into frame-<n> (render_animated() in art/blender/tileart.py)
FRAMES = {
    'industrial_workshop_yard': {621: range(852, 860)},
    'industrial_brick_factory': {641: range(884, 888), 644: range(888, 892)},
    'industrial_steel_mill': {649: range(892, 896), 650: range(896, 900)},
    'industrial_large_factory': {676: range(900, 904), 677: range(904, 908)},
    'industrial_sawtooth_plant': {686: range(908, 912), 689: range(912, 916)},
    'coal_power_plant': {747: range(916, 920), 748: range(920, 924), 751: range(924, 928), 752: range(928, 932)},
    'airport': {711: range(832, 840)},
    'stadium_full': {801: range(932, 940), 805: range(940, 948)},
    'nuclear_power_plant': {820: range(952, 956)},
}

# Each vehicle's sprite type (SpriteType in the C# rules), the tiles a side of the square the game
# draws it into (SPRITE_SHEET in src/renderManifest.ts), and its frames
# (conformance/ruleConstants.json). A vehicle renders at three tiles a frame, standing on its middle, and is cropped to the middle of it
SPRITES = {
    'train': {'type': 1, 'square': 2, 'frames': 5},
    'helicopter': {'type': 2, 'square': 2, 'frames': 8},
    'airplane': {'type': 3, 'square': 3, 'frames': 11},
    'ship': {'type': 4, 'square': 3, 'frames': 8},
}


# The cars the game drives along the city's trips (src/cars.ts), which are no sprite of the rules: each colour, facing
# each way it drives, a frame each, frame colour * 4 + way, in the order CUTOUTS and TURNS in
# art/blender/vehicles/car.py render them. The game finds a car's art by its colour's and its way's names, which the
# client's CAR_COLOURS must hold. A car renders on a frame of one tile, which the game draws whole
CAR_COLOURS = ('red', 'blue', 'yellow', 'white', 'green', 'orange')
CAR_WAYS = ('north', 'east', 'south', 'west')
CAR = {'square': 1, 'frames': len(CAR_COLOURS) * len(CAR_WAYS)}

# Every vehicle the art renders and paints, a frame of each an asset: the sprites, and the car
VEHICLES = {**SPRITES, 'car': CAR}


def sprite_frame(vehicle, frame):
    # the asset of a vehicle's frame, counted from 0 as the renders count them: '<vehicle>/<frame>'
    return f'{vehicle}/{frame:02d}'


def zone_frame(zone, frame):
    # the asset of a frame of an animated zone, counted from 0: '<zone>/frame-<n>'
    return f'{zone}/frame-{frame}'


def zone_frames(zone):
    # how many frames an animated zone renders: its longest-running tile's
    return max(map(len, FRAMES[zone].values()))


def asset_names():
    # every asset the tables name, each a directory of layers
    names = single_tile_assets()
    names += list(ZONES)
    names += [zone_frame(zone, k) for zone in FRAMES for k in range(zone_frames(zone))]
    names += [sprite_frame(vehicle, k) for vehicle, sprite in VEHICLES.items() for k in range(sprite['frames'])]
    return names


def is_vehicle(asset):
    # whether an asset is a vehicle's frame, which has no ground
    return asset.split('/')[0] in VEHICLES


LAYERS = ('ground', 'shadow', 'objects')
BUILT_LAYERS = ('ground', 'objects')       # the layers of a single tile the paint build keeps and the join writes
LAND_MASK = 'ground-land.png'              # beside a joined single tile's layers: white where the bare land's painting
                                           # gave its ground, which the game draws as the world grass (grass.py)
NO_MARGIN = {'left': 0, 'top': 0, 'right': 0, 'bottom': 0}


class Asset:
    # One asset's layers, from its directory: layers.json, giving its size in tiles, its pixels a
    # tile and its shadow margin, the whole tiles its shadow reaches past it on each side (none if
    # it gives none, as a vehicle's frame doesn't), and ground.png, shadow.png and objects.png in
    # `layers`. A vehicle's frame has no ground.png, and its ground is transparent, the footprint's
    # size, unless the caller lays one under it; any other layer missing fails, so an asset that
    # loses one is never built as a black tile or without its shadow
    def __init__(self, directory, vehicle=False):
        with open(os.path.join(directory, 'layers.json')) as f:
            info = json.load(f)
        self.tiles, self.tile_px = info['tiles'], info['tile_px']
        self.margin = {**NO_MARGIN, **info.get('shadow_margin', {})}
        self.size = self.tiles * self.tile_px
        self.vehicle = vehicle
        self.layers = {k: Image.open(os.path.join(directory, f'{k}.png')).convert('RGBA')
                       for k in LAYERS if os.path.exists(os.path.join(directory, f'{k}.png'))}
        missing = [k for k in LAYERS if k not in self.layers and not (vehicle and k == 'ground')]
        if missing:
            raise FileNotFoundError(f'{directory} has no {" or ".join(f"{k}.png" for k in missing)}')
        if vehicle:
            self.layers['ground'] = Image.new('RGBA', (self.size, self.size))
        # where the bare land's painting gave a joined single tile's ground, as the join wrote it, or None
        land = os.path.join(directory, LAND_MASK)
        self.land = Image.open(land).convert('L') if os.path.exists(land) else None

    def tile(self, layer, column, row):
        x, y = column * self.tile_px, row * self.tile_px
        return self.layers[layer].crop((x, y, x + self.tile_px, y + self.tile_px))

    def ground_over_grass(self):
        # the ground as the game draws it over the world grass: transparent where the bare land's painting gave it
        ground = self.layers['ground'].copy()
        if self.land is not None:
            ground.putalpha(Image.eval(self.land, lambda v: 255 - v))
        return ground

    def composite(self, ground=None):
        # the asset as the game draws it alone: ground, or the ground given, its own shadow, objects, the size of its
        # footprint
        left, top = self.margin['left'] * self.tile_px, self.margin['top'] * self.tile_px
        shadow = Image.new('RGBA', self.layers['shadow'].size, (0, 0, 0, 255))
        shadow.putalpha(self.layers['shadow'].getchannel('A'))
        image = Image.new('RGBA', shadow.size)
        image.alpha_composite(self.layers['ground'] if ground is None else ground, (left, top))
        image.alpha_composite(shadow)
        image.alpha_composite(self.layers['objects'], (left, top))
        return image.crop((left, top, left + self.size, top + self.size))


def load(root, asset):
    # an asset by its name under a directory of layers, such as PAINTED
    return Asset(os.path.join(root, asset), is_vehicle(asset))
