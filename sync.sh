#!/usr/bin/env bash

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
APPLET_DIR="$HOME/.local/share/cinnamon/applets"

mkdir -p "$APPLET_DIR"

for dir in "$SCRIPT_DIR"/*@logogistiks; do
    if [[ -d "$dir" && -f "$dir/metadata.json" ]]; then
        ln -sfn "$dir" "$APPLET_DIR/$(basename "$dir")"
    fi
done
