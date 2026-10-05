#!/bin/sh
# Copies the legacy-shop fixture, .third-rail.json included, into the run's
# empty workspace so prompts naming examples/legacy-shop/... resolve and the
# guard hook sees the same config a real user would. Runs before the agent
# starts, from the run's working directory.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
src="$here/../examples/legacy-shop"
mkdir -p examples/legacy-shop
(cd "$src" && tar cf - --exclude node_modules .) | (cd examples/legacy-shop && tar xf -)
test -f examples/legacy-shop/.third-rail.json
