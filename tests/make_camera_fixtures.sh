#!/usr/bin/env bash
# Purpose:
#   Regenerate the y4m camera-feed fixtures used by the fake-camera test
#   (tests/camera_classification.test.mjs). Each y4m is a short clip of a
#   known-class image, fed into Chromium's fake camera so the test can verify
#   the camera-capture path classifies correctly.
#
# Dependencies:
#   - ffmpeg
#   - public/images/examples/* and dataset_collection/data/not_tattoo_fitzpatrick/*
#
# Usage:
#   bash tests/make_camera_fixtures.sh
#
# Changes:
#   2026-05-26: Initial.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=tests/fixtures/camera
mkdir -p "$OUT"

make_y4m () {  # $1 = source image, $2 = output class name
  # Pre-flip the source horizontally so the y4m simulates the natural
  # left-right reversal a real front camera applies. The app mirrors the
  # preview + capture for front cameras; with a pre-flipped y4m the test
  # ends up with the SAME final orientation as a real camera capture,
  # so classifications behave the same.
  ffmpeg -y -loop 1 -i "$1" -t 1.5 -r 15 -pix_fmt yuv420p -s 640x480 \
    -vf hflip \
    "$OUT/$2.y4m" -loglevel error
  echo "  $2.y4m (pre-flipped to simulate front-camera lens reversal)"
}

echo "Generating camera fixtures:"
make_y4m public/images/examples/real_tattoo_2.png        real_tattoo
make_y4m public/images/examples/sticker_tattoo_2.png     sticker_tattoo
make_y4m public/images/examples/sharpie_tattoo_example.png pen_drawn
# not_tattoo: a bare-skin Fitzpatrick background (no tattoo present)
NT=$(find dataset_collection/data/not_tattoo_fitzpatrick/fst_3 -name '*.png' | head -1)
make_y4m "$NT" not_tattoo
echo "Done -> $OUT"
