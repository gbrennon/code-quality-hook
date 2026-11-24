#!/usr/bin/env bash

set -euo pipefail

if [[ "${HUMAN_APPROVED_E2E_UPDATE:-}" != "1" ]]; then
  printf '%s\n' 'set HUMAN_APPROVED_E2E_UPDATE=1 after human review to update e2e hashes' >&2
  exit 1
fi

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
manifest="$project_root/scripts/e2e-test-hashes.txt"
(
  cd "$project_root"
  find e2e -type f -name '*.test.ts' -print0 | sort -z | xargs -0 sha256sum
) | sort >"$manifest"
