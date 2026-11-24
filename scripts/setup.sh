#!/usr/bin/env bash

set -euo pipefail

if ! command -v bun >/dev/null 2>&1; then
  printf '%s\n' 'Bun is required. Install it from https://bun.sh/ and rerun this recipe.' >&2
  exit 1
fi

bunx lefthook install
printf '%s\n' 'Contributor setup complete.'
printf '%s\n' 'Run `bun run test:all` before opening a pull request.'
