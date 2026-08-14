#!/usr/bin/env bash
# JSON preset saga — manages the app's shippable preset gallery. Multi-mode CLI:
#   1 | import              Import new preset triplets from presetsprep/ (dev-dump JSON +
#                            before/composite PNG pair) into the shipped library.
#   2 | list [algo]         List installed presets in their current gallery order.
#   3 | reorder <algo> "<seq>"   Reorder an algo's gallery — see usage() for <seq>'s semantics.
#   4 | delete <algo> "<positions>"   Delete preset(s) and renumber the rest contiguously.
#   ? | help | -h | --help  Show usage.
#
# Storage layout (unchanged by this rewrite):
#   public/presets/<algo>/<slug>/{before,after}.webp   — converted from source PNGs
#   src/presets/data/<algo>/<slug>.json                — trimmed preset data
# presetManifest.ts auto-discovers everything under src/presets/data/ via import.meta.glob,
# sorted lexically by path — slugs are always 2-digit zero-padded (01, 02, ...) so that sort
# is also numeric order. There is no separate order field anywhere: gallery order IS slug
# order, so `reorder`/`delete` physically renumber/rename presets rather than editing a field.
#
# Requires `jq` and `magick` (ImageMagick) on PATH.
set -euo pipefail
shopt -s nullglob

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREP_DIR="$ROOT/presetsprep"
IMPORTED_DIR="$PREP_DIR/_imported"
PUBLIC_DIR="$ROOT/public/presets"
DATA_DIR="$ROOT/src/presets/data"

command -v jq >/dev/null || { echo "jq is required but not found on PATH" >&2; exit 1; }
command -v magick >/dev/null || { echo "magick (ImageMagick) is required but not found on PATH" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: import-presets.sh <mode> [args...]

Modes:
  1 | import
      Import new preset triplets dropped into presetsprep/ (dev-dump JSON + before/composite
      PNG pair) into the shipped preset library. Safe to re-run — every successfully-imported
      triplet is moved into presetsprep/_imported/, so a re-run only processes new drops.

  2 | list [algo]
      List installed presets in their current gallery order (the order the in-app gallery
      modal actually shows them in) — index, slug, id, algo display name, and the original
      source image filename (shows "(unknown)" for presets imported before this field existed,
      since the original filename was never recorded for those and can't be recovered after the
      fact). With an algo argument (e.g. pathC), lists just that one; otherwise lists every algo
      that has any presets.

  3 | reorder <algo> "<seq>"
      Reorder an algo's gallery. <algo> is a path id like pathC. <seq> is a single argument,
      space- or comma-separated, listing OLD positions in the desired NEW order — e.g. on a
      4-preset gallery, "3 1 4 2" means: new slot 1 gets whatever was at old position 3, new
      slot 2 gets old position 1, new slot 3 gets old position 4, new slot 4 gets old position 2.
      Run `list` first to see current positions. <seq> must be a permutation of 1..N (every
      old position named exactly once) — validated before anything on disk is touched.

  4 | delete <algo> "<positions>"
      Delete one or more presets from an algo's gallery, then shift the remaining presets down
      to fill the gap (renumbered contiguously). <positions> is a single argument, space- or
      comma-separated, listing the 1-indexed current positions to delete (same numbering as
      `list`'s output) — e.g. "2" deletes just the 2nd preset, "2 4" deletes the 2nd and 4th.
      Prompts for y/n confirmation (showing exactly what will be deleted) before touching
      anything on disk.

  ? | help | -h | --help
      Show this message.
EOF
}

# Every 2-digit slug currently installed for an algo, in ascending (= current gallery) order.
list_slugs() {
  local algo="$1"
  local algo_dir="$DATA_DIR/$algo"
  [ -d "$algo_dir" ] || return 0
  local f slug
  for f in "$algo_dir"/*.json; do
    slug="$(basename "$f" .json)"
    echo "$slug"
  done | sort
}

# Renumbers a set of existing presets to contiguous 01..N slugs, in the given order — shared by
# `reorder` (full permutation of all presets) and `delete` (remaining presets after a deletion).
# Args: algo, then the old slugs listed in the desired NEW order.
# Two-phase (.tmp-suffixed intermediate name) to avoid collisions — a direct rename could
# otherwise overwrite one preset before it's read (e.g. reorder swapping 01<->02).
renumber_to() {
  local algo="$1"; shift
  local ordered_old_slugs=("$@")
  local n="${#ordered_old_slugs[@]}"
  [ "$n" -eq 0 ] && return 0
  local old_slug new_slug i

  for old_slug in "${ordered_old_slugs[@]}"; do
    mv "$PUBLIC_DIR/$algo/$old_slug" "$PUBLIC_DIR/$algo/${old_slug}.tmp"
    mv "$DATA_DIR/$algo/${old_slug}.json" "$DATA_DIR/$algo/${old_slug}.tmp.json"
  done

  for ((i = 0; i < n; i++)); do
    old_slug="${ordered_old_slugs[$i]}"
    new_slug="$(printf '%02d' "$((i + 1))")"
    mv "$PUBLIC_DIR/$algo/${old_slug}.tmp" "$PUBLIC_DIR/$algo/$new_slug"
    jq \
      --arg id "${algo}-${new_slug}" \
      --arg before "/presets/${algo}/${new_slug}/before.webp" \
      --arg after "/presets/${algo}/${new_slug}/after.webp" \
      '.id = $id | .beforeImage = $before | .afterImage = $after' \
      "$DATA_DIR/$algo/${old_slug}.tmp.json" > "$DATA_DIR/$algo/${new_slug}.json"
    rm "$DATA_DIR/$algo/${old_slug}.tmp.json"
    echo "  $old_slug -> $new_slug"
  done
}

# Parses a space- or comma-separated <seq>/<positions> argument into array `parsed_positions`,
# validating every entry is an integer in 1..n. Set `allow_dup=1` to skip the
# no-duplicates check (delete doesn't need a permutation, just a valid position set).
parse_positions() {
  local raw="$1" n="$2" allow_dup="${3:-0}"
  local clean
  clean="${raw//,/ }"
  read -r -a parsed_positions <<< "$clean"

  local seen=() k v
  for ((k = 0; k < n; k++)); do seen[k]=0; done
  for v in "${parsed_positions[@]}"; do
    if ! [[ "$v" =~ ^[0-9]+$ ]] || [ "$v" -lt 1 ] || [ "$v" -gt "$n" ]; then
      echo "Invalid entry \"$v\" — must be an integer between 1 and $n." >&2
      exit 1
    fi
    if [ "$allow_dup" -eq 0 ] && [ "${seen[$((v - 1))]}" -eq 1 ]; then
      echo "Entry $v appears more than once." >&2
      exit 1
    fi
    seen[$((v - 1))]=1
  done
}

cmd_import() {
  mkdir -p "$IMPORTED_DIR"
  local imported_count=0
  local skipped_count=0

  for json in "$PREP_DIR"/*.json; do
    local base_json file_name active_mode stem
    base_json="$(basename "$json")"
    file_name="$(jq -r '.file.name' "$json")"
    active_mode="$(jq -r '.lineArt.activeMode' "$json")"
    stem="${file_name%.*}"

    # Match the JSON to its before/after PNG pair by the source photo's own basename (embedded
    # in the dump as file.name) — e.g. "img060w.jpg" -> "img060w_pfp-846x846-{original,composite}.png".
    # nullglob makes an unmatched pattern expand to zero array elements rather than the literal
    # pattern string, so array length alone tells us "not found" vs "found" vs "ambiguous".
    local original_matches=("$PREP_DIR"/"$stem"_pfp-*-original.png)
    local composite_matches=("$PREP_DIR"/"$stem"_pfp-*-composite.png)

    if [ "${#original_matches[@]}" -ne 1 ] || [ "${#composite_matches[@]}" -ne 1 ]; then
      echo "SKIP: $base_json — expected exactly one original+composite PNG pair matching \"$stem\", found ${#original_matches[@]} original / ${#composite_matches[@]} composite"
      skipped_count=$((skipped_count + 1))
      continue
    fi
    local original_png="${original_matches[0]}"
    local composite_png="${composite_matches[0]}"

    # Next free slug for this algorithm — one past whatever the current highest number is.
    local algo_public_dir="$PUBLIC_DIR/$active_mode"
    mkdir -p "$algo_public_dir"
    local next=1 existing n
    for existing in "$algo_public_dir"/*/; do
      [ -d "$existing" ] || continue
      n="$(basename "$existing")"
      n=$((10#$n)) # force base-10 (a plain $((n)) would misread "08"/"09" as invalid octal)
      if [ "$n" -ge "$next" ]; then next=$((n + 1)); fi
    done
    local slug
    slug="$(printf '%02d' "$next")"

    local preset_public_dir="$algo_public_dir/$slug"
    mkdir -p "$preset_public_dir"

    echo "Importing $base_json -> $active_mode/$slug"
    magick "$original_png" -quality 90 "$preset_public_dir/before.webp"
    magick "$composite_png" -quality 90 "$preset_public_dir/after.webp"

    local data_dir="$DATA_DIR/$active_mode"
    mkdir -p "$data_dir"
    jq \
      --arg id "${active_mode}-${slug}" \
      --arg algo "$active_mode" \
      --arg before "/presets/${active_mode}/${slug}/before.webp" \
      --arg after "/presets/${active_mode}/${slug}/after.webp" \
      --arg sourceFileName "$file_name" \
      '{
        id: $id,
        algo: $algo,
        algoLabel: .lineArt.activeLabel,
        beforeImage: $before,
        afterImage: $after,
        sourceFileName: $sourceFileName,
        lineArtParams: (.lineArt.paramsByAlgorithm[.lineArt.activeMode].params + {overlayPassthrough: false, matteColor: [1, 1, 1]}),
        color: (.color | {light, colorAdjust, invert, hslByBand, curveChannel, curves, curveVisible, gradeGradientMap}),
        enhance: .crop.enhance
      }' "$json" > "$data_dir/$slug.json"

    mv "$json" "$original_png" "$composite_png" "$IMPORTED_DIR"/
    imported_count=$((imported_count + 1))
  done

  echo ""
  echo "Done: $imported_count imported, $skipped_count skipped."
}

cmd_list() {
  local filter_algo="${1:-}"
  local algos=()
  if [ -n "$filter_algo" ]; then
    algos=("$filter_algo")
  else
    local d
    for d in "$DATA_DIR"/*/; do
      [ -d "$d" ] || continue
      algos+=("$(basename "$d")")
    done
    algos=($(printf '%s\n' "${algos[@]}" | sort))
  fi

  local algo
  for algo in "${algos[@]}"; do
    local slugs=()
    while IFS= read -r line; do
      [ -n "$line" ] && slugs+=("$line")
    done < <(list_slugs "$algo")
    if [ "${#slugs[@]}" -eq 0 ]; then
      if [ -n "$filter_algo" ]; then
        echo "$algo: no presets installed"
      fi
      continue
    fi
    echo "$algo (${#slugs[@]} presets):"
    local i=1 slug label source_file
    for slug in "${slugs[@]}"; do
      label="$(jq -r '.algoLabel' "$DATA_DIR/$algo/$slug.json")"
      # sourceFileName only exists on presets imported since it was added — older presets (from
      # before this field existed) show "(unknown)" since the original filename was never
      # recorded and can't be reconstructed after the fact.
      source_file="$(jq -r '.sourceFileName // "(unknown)"' "$DATA_DIR/$algo/$slug.json")"
      echo "  $i. $slug  ${algo}-${slug}  $label  $source_file"
      i=$((i + 1))
    done
  done
}

cmd_reorder() {
  local algo="${1:-}"
  local seq_raw="${2:-}"
  if [ -z "$algo" ] || [ -z "$seq_raw" ]; then
    echo "Usage: import-presets.sh reorder <algo> \"<seq>\"" >&2
    exit 1
  fi

  local algo_dir="$DATA_DIR/$algo"
  [ -d "$algo_dir" ] || { echo "No such algo directory: $algo_dir" >&2; exit 1; }

  local old_slugs=()
  while IFS= read -r line; do
    [ -n "$line" ] && old_slugs+=("$line")
  done < <(list_slugs "$algo")
  local n="${#old_slugs[@]}"
  if [ "$n" -eq 0 ]; then
    echo "No presets installed for $algo" >&2
    exit 1
  fi

  local parsed_positions=()
  parse_positions "$seq_raw" "$n" 0
  local seq=("${parsed_positions[@]}")
  if [ "${#seq[@]}" -ne "$n" ]; then
    echo "Sequence has ${#seq[@]} entries, but $algo has $n presets — must match exactly." >&2
    exit 1
  fi

  # Old slugs, reordered into the desired new order (seq[k] is the 1-indexed OLD position that
  # should land at new position k+1).
  local ordered_old_slugs=() i old_index
  for ((i = 0; i < n; i++)); do
    old_index="${seq[$i]}"
    ordered_old_slugs[i]="${old_slugs[$((old_index - 1))]}"
  done

  echo "Reordering $algo ($n presets):"
  renumber_to "$algo" "${ordered_old_slugs[@]}"
  echo ""
  echo "Done."
}

cmd_delete() {
  local algo="${1:-}"
  local positions_raw="${2:-}"
  if [ -z "$algo" ] || [ -z "$positions_raw" ]; then
    echo "Usage: import-presets.sh delete <algo> \"<positions>\"" >&2
    exit 1
  fi

  local algo_dir="$DATA_DIR/$algo"
  [ -d "$algo_dir" ] || { echo "No such algo directory: $algo_dir" >&2; exit 1; }

  local old_slugs=()
  while IFS= read -r line; do
    [ -n "$line" ] && old_slugs+=("$line")
  done < <(list_slugs "$algo")
  local n="${#old_slugs[@]}"
  if [ "$n" -eq 0 ]; then
    echo "No presets installed for $algo" >&2
    exit 1
  fi

  local parsed_positions=()
  parse_positions "$positions_raw" "$n" 1
  local to_delete=("${parsed_positions[@]}")

  # Mark which (0-indexed) old positions are being deleted.
  local delete_mask=() k
  for ((k = 0; k < n; k++)); do delete_mask[k]=0; done
  for k in "${to_delete[@]}"; do delete_mask[$((k - 1))]=1; done

  echo "The following $algo preset(s) will be permanently deleted:"
  for ((k = 0; k < n; k++)); do
    if [ "${delete_mask[$k]}" -eq 1 ]; then
      echo "  $((k + 1)). ${old_slugs[$k]}  ${algo}-${old_slugs[$k]}"
    fi
  done
  read -r -p "Delete these ${#to_delete[@]} preset(s) from $algo? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Aborted — no changes made."
    exit 0
  fi

  local remaining_old_slugs=()
  for ((k = 0; k < n; k++)); do
    if [ "${delete_mask[$k]}" -eq 1 ]; then
      rm -rf "$PUBLIC_DIR/$algo/${old_slugs[$k]}"
      rm -f "$DATA_DIR/$algo/${old_slugs[$k]}.json"
    else
      remaining_old_slugs+=("${old_slugs[$k]}")
    fi
  done

  echo "Deleted. Renumbering remaining presets:"
  renumber_to "$algo" "${remaining_old_slugs[@]}"
  echo ""
  echo "Done."
}

mode="${1:-}"
case "$mode" in
  1|import)
    cmd_import
    ;;
  2|list)
    cmd_list "${2:-}"
    ;;
  3|reorder)
    cmd_reorder "${2:-}" "${3:-}"
    ;;
  4|delete)
    cmd_delete "${2:-}" "${3:-}"
    ;;
  '?'|help|-h|--help)
    usage
    ;;
  *)
    usage
    exit 1
    ;;
esac
