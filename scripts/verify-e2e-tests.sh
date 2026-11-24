#!/usr/bin/env bash

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
manifest="$project_root/scripts/e2e-test-hashes.txt"

if [[ ! -f "$manifest" ]]; then
  printf 'missing e2e manifest: %s\n' "$manifest" >&2
  exit 1
fi

actual_file="$(mktemp)"
trap 'rm -f "$actual_file"' EXIT
(
  cd "$project_root"
  find e2e -type f -name '*.test.ts' -print0 | sort -z | xargs -0 sha256sum
) | sort >"$actual_file"

if ! diff -u "$manifest" "$actual_file"; then
  printf '%s\n' 'e2e tests changed without human manifest approval' >&2
  exit 1
fi
