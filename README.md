# AI Toolkit Code Quality Hook

This project installs the shared code-quality hook for Pi and OMP.

## Install

```bash
./scripts/install.sh
```

Installation requires Bun. Set `BUN_COMMAND` to the Bun executable when it is
not available on the default `PATH`.

The installer updates only the quality hook files. It does not install or modify
notification hooks.

## Test

```bash
bun test
```


## Settings

The hook stores settings in
`$XDG_CONFIG_HOME/ai-toolkit/code-quality-hook.json`, or
`$HOME/.config/ai-toolkit/code-quality-hook.json` when `XDG_CONFIG_HOME` is
unset.

Available settings and defaults:

- `max-complexity=5`
- `max-function-length=50`
- `max-arguments=5`
- `circuit-breaker-threshold=3`
- `circuit-breaker-state-path` unset, using existing environment/default resolution

Use the shared command in Pi or OMP:

```text
/code-quality menu
/code-quality show
/code-quality set max-complexity 9
/code-quality reset max-complexity
/code-quality reset
```

In an interactive TUI, `/code-quality` or `/code-quality menu` opens a settings
menu. Successful `show`, `set`, and `reset` commands display the resolved
settings in the same read-only panel; it is display-only and not sent to the
model. Editing a setting opens a prefilled editor with its current value.
Without an interactive UI, the bare command shows the current settings. The
`show`, `set`, and `reset` forms remain available for scripting and
non-interactive sessions. While typing `/code-quality`, the TUI offers
completions for `menu`, `show`, `set`, `reset`, and setting keys.

Successful changes apply to the next write or edit event in the current session
and persist for later sessions. Semgrep repository discovery is unchanged.
`AI_TOOLKIT_CIRCUIT_BREAKER_THRESHOLD` and `AI_TOOLKIT_CIRCUIT_BREAKER_STATE`
remain fallbacks when no persisted override exists.

## Quality checks

For each modified source file, the hook runs `check-code-quality` with Lizard
limits of cyclomatic complexity 5, function length 50, and 5 arguments.
Semgrep configuration is selected in this order:

1. the repository's `.semgrep` directory or config file;
2. the repository's `semgrep` directory or config file;
3. the bundled rules installed alongside the hook.

Repository rules therefore take precedence, while repositories without Semgrep
configuration still receive language-specific hook defaults. Bundled rules are
selected from the modified file extension for Python, Rust, Scala, Go, Java,
Kotlin, Haskell, TypeScript, JavaScript, Swift, C/C++, C#, Ruby, PHP, Lua, and
Bash; unsupported extensions use the default rules.
