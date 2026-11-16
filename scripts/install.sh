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

install_hook_rules() {
  local destination_dir="$1"
  local source_path
  local relative_path

  while IFS= read -r -d "" source_path; do
    relative_path="${source_path#"$source_dir/"}"
    install -D -m 0644 "$source_path" "$destination_dir/$relative_path"
  done < <(find "$source_dir/semgrep-rules" -type f -print0)
}

install_hook_modules "$pi_dir"
install_hook_rules "$pi_dir"
install_hook_modules "$omp_dir"
install_hook_rules "$omp_dir"

printf 'Installed shared code-quality hook:\n'
printf '  Pi:  %s\n' "$pi_dir/ai-toolkit-quality.ts"
printf '  OMP: %s\n' "$omp_dir/ai-toolkit-quality.ts"
