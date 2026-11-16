#!/usr/bin/env bash

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$project_root/src"
pi_dir="${HOME}/.pi/agent/extensions"
omp_dir="${HOME}/.omp/agent/hooks/post"

install_hook_modules() {
  local destination_dir="$1"
  local source_path

  for source_path in "$source_dir"/*.ts; do
    install -D -m 0644 "$source_path" "$destination_dir/$(basename "$source_path")"
  done
}

install_hook_modules "$pi_dir"
install_hook_modules "$omp_dir"

printf 'Installed shared code-quality hook:\n'
printf '  Pi:  %s\n' "$pi_dir/ai-toolkit-quality.ts"
printf '  OMP: %s\n' "$omp_dir/ai-toolkit-quality.ts"
