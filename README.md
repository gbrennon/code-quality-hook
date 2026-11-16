# AI Toolkit Code Quality Hook

This project installs the shared code-quality hook for Pi and OMP.

## Install

```bash
./scripts/install.sh
```

The installer updates only the quality hook files. It does not install or modify
notification hooks.

## Test

```bash
bun test
```

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
