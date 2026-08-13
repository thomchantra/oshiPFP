#!/usr/bin/env bash
# JSON preset saga — imports new preset triplets (dev-dump JSON + before/composite PNG pair)
# dropped into presetsprep/ into the app's shippable preset library. Safe to re-run: every
# successfully-imported triplet gets moved into presetsprep/_imported/, so a re-run only ever
# processes genuinely new drops. Requires `jq` and `magick` (ImageMagick) on PATH.
#
# Output, per new preset:
#   public/presets/<algo>/<slug>/{before,after}.webp   — converted from the source PNGs
#   src/presets/data/<algo>/<slug>.json                — trimmed preset data
# presetManifest.ts auto-discovers everything under src/presets/data/ via import.meta.glob, so
# this script is the only thing that should ever need to touch this system going forward — no
# generated TS file to hand-edit.
set -euo pipefail
shopt -s nullglob

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREP_DIR="$ROOT/presetsprep"
IMPORTED_DIR="$PREP_DIR/_imported"
PUBLIC_DIR="$ROOT/public/presets"
DATA_DIR="$ROOT/src/presets/data"

command -v jq >/dev/null || { echo "jq is required but not found on PATH" >&2; exit 1; }
command -v magick >/dev/null || { echo "magick (ImageMagick) is required but not found on PATH" >&2; exit 1; }

mkdir -p "$IMPORTED_DIR"

imported_count=0
skipped_count=0

for json in "$PREP_DIR"/*.json; do
  base_json="$(basename "$json")"
  file_name="$(jq -r '.file.name' "$json")"
  active_mode="$(jq -r '.lineArt.activeMode' "$json")"
  stem="${file_name%.*}"

  # Match the JSON to its before/after PNG pair by the source photo's own basename (embedded in
  # the dump as file.name) — e.g. "img060w.jpg" -> "img060w_pfp-846x846-{original,composite}.png".
  # nullglob (set above) makes an unmatched pattern expand to zero array elements rather than the
  # literal pattern string, so array length alone tells us "not found" vs "found" vs "ambiguous".
  original_matches=("$PREP_DIR"/"$stem"_pfp-*-original.png)
  composite_matches=("$PREP_DIR"/"$stem"_pfp-*-composite.png)

  if [ "${#original_matches[@]}" -ne 1 ] || [ "${#composite_matches[@]}" -ne 1 ]; then
    echo "SKIP: $base_json — expected exactly one original+composite PNG pair matching \"$stem\", found ${#original_matches[@]} original / ${#composite_matches[@]} composite"
    skipped_count=$((skipped_count + 1))
    continue
  fi
  original_png="${original_matches[0]}"
  composite_png="${composite_matches[0]}"

  # Next free slug for this algorithm — count existing public/presets/<algo>/<NN>/ folders.
  algo_public_dir="$PUBLIC_DIR/$active_mode"
  mkdir -p "$algo_public_dir"
  next=1
  for existing in "$algo_public_dir"/*/; do
    [ -d "$existing" ] || continue
    n="$(basename "$existing")"
    n=$((10#$n)) # force base-10 (a plain $((n)) would misread "08"/"09" as invalid octal)
    if [ "$n" -ge "$next" ]; then next=$((n + 1)); fi
  done
  slug="$(printf '%02d' "$next")"

  preset_public_dir="$algo_public_dir/$slug"
  mkdir -p "$preset_public_dir"

  echo "Importing $base_json -> $active_mode/$slug"
  magick "$original_png" -quality 90 "$preset_public_dir/before.webp"
  magick "$composite_png" -quality 90 "$preset_public_dir/after.webp"

  data_dir="$DATA_DIR/$active_mode"
  mkdir -p "$data_dir"
  jq \
    --arg id "${active_mode}-${slug}" \
    --arg algo "$active_mode" \
    --arg before "/presets/${active_mode}/${slug}/before.webp" \
    --arg after "/presets/${active_mode}/${slug}/after.webp" \
    '{
      id: $id,
      algo: $algo,
      algoLabel: .lineArt.activeLabel,
      beforeImage: $before,
      afterImage: $after,
      lineArtParams: (.lineArt.paramsByAlgorithm[.lineArt.activeMode].params + {overlayPassthrough: false, matteColor: [1, 1, 1]}),
      color: (.color | {light, colorAdjust, invert, hslByBand, curveChannel, curves, curveVisible, gradeGradientMap}),
      enhance: .crop.enhance
    }' "$json" > "$data_dir/$slug.json"

  mv "$json" "$original_png" "$composite_png" "$IMPORTED_DIR"/
  imported_count=$((imported_count + 1))
done

echo ""
echo "Done: $imported_count imported, $skipped_count skipped."
