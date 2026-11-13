#!/usr/bin/env bash

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_path="$project_root/src/ai-toolkit-quality.ts"
pi_path="${HOME}/.pi/agent/extensions/ai-toolkit-quality.ts"
omp_path="${HOME}/.omp/agent/hooks/post/ai-toolkit-quality.ts"

install -D -m 0644 "$source_path" "$pi_path"
install -D -m 0644 "$source_path" "$omp_path"

printf 'Installed shared code-quality hook:\n'
printf '  Pi:  %s\n' "$pi_path"
printf '  OMP: %s\n' "$omp_path"
