# Contributing

This repository is a dependency-light Bun/TypeScript hook installed into both Pi
and OMP. Keep changes small, testable, and compatible with both hosts.

## First-time setup

Install [Bun](https://bun.sh/), clone the repository, and run:

```sh
bun run setup
```

The setup recipe installs the Lefthook pre-push hook. It does not change your
agent credentials or user-level hook configuration.

## Daily checks

Use the package recipes instead of invoking individual tools from memory:

```sh
bun run test:unit  # fast repository tests
bun run test:e2e   # installed Pi/OMP acceptance flow
bun run test:all   # both gates
```

The pre-push hook runs the e2e gate automatically. E2e tests are human-owned:
agents may execute them but must not edit them. A human who intentionally changes
an e2e test must review the change and regenerate its hash manifest explicitly:

```sh
HUMAN_APPROVED_E2E_UPDATE=1 scripts/update-e2e-manifest.sh
```

## Settings smoke check

After installing the hook, open a fresh Pi or OMP session and use:

```text
/code-quality show
/code-quality set max-complexity 9
/code-quality reset max-complexity
```

Successful commands render a read-only panel in interactive sessions. The next
write or edit event uses the new settings; the values persist in the user config.

## Pull requests

1. Create a focused `feat/`, `fix/`, `chore/`, or `docs/` branch.
2. Add tests for behavior changes before implementation changes.
3. Run `bun run test:all`.
4. Push the branch and open a pull request describing scope and validation.
5. Keep unrelated formatting, generated files, and credentials out of commits.
