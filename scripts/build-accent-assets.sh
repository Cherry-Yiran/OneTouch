#!/bin/zsh

set -euo pipefail

project_root="${0:A:h:h}"
catalog_path="$project_root/src-tauri/ThemeAssets.xcassets"
asset_path="$project_root/src-tauri/theme/Assets.car"
developer_dir="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

if [[ ! -x "$developer_dir/usr/bin/actool" ]]; then
  test -s "$asset_path"
  exit 0
fi

temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT
partial_plist="$temp_dir/AccentInfo.plist"

DEVELOPER_DIR="$developer_dir" xcrun actool \
  --compile "$temp_dir" \
  --platform macosx \
  --minimum-deployment-target 13.0 \
  --accent-color AccentColor \
  --output-partial-info-plist "$partial_plist" \
  --warnings \
  --errors \
  "$catalog_path"

test -s "$temp_dir/Assets.car"
test "$(/usr/libexec/PlistBuddy -c 'Print :NSAccentColorName' "$partial_plist")" = "AccentColor"

mkdir -p "${asset_path:h}"
if [[ ! -f "$asset_path" ]] || ! cmp -s "$temp_dir/Assets.car" "$asset_path"; then
  cp "$temp_dir/Assets.car" "$asset_path"
fi
