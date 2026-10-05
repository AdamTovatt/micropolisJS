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

"""The art tools' tests, run with pytest art/tools/tests from the packages in art/requirements.txt."""

import os
import sys

import pytest

TOOLS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sys.path.insert(0, TOOLS)

import atlas  # noqa: E402
from designs import PAINTED  # noqa: E402


@pytest.fixture(scope='session')
def built(tmp_path_factory):
    # the atlas build from the committed painted layers, into a directory of its own, never images/
    out = tmp_path_factory.mktemp('images')
    atlas.build(PAINTED, str(out))
    return str(out)
