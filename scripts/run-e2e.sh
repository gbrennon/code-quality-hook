#!/usr/bin/env bash

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$project_root/scripts/verify-e2e-tests.sh"
bun test "$project_root"/e2e/*.test.ts
"$project_root/scripts/verify-e2e-tests.sh"
