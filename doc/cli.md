# CLI Reference

The `testbump` CLI is designed to be chained natively into standard `npm` commands, acting as the decision engine for your releases.

## Basic Usage
```bash
$ npx testbump
patch
```
*(By default, standard output is strictly limited to the semantic string so it can be chained).*

## Chaining
```bash
npm version $(npx testbump)
```

## Options

### `--init`
Bootstraps the project. Adds the `npm run bump` script to your `package.json` and establishes the initial Git tag (Baseline Contract) required for the engine to operate.
```bash
npx testbump --init --init-message "chore: baseline setup"
```

### `--verbose`
Streams detailed explanations of the Logic Matrix to `stderr` while keeping `stdout` pure. Useful for CI logs or understanding *why* a specific bump was chosen.
```bash
npx testbump --verbose
```

### `--dry-run`, `-d`
Runs the entire matrix and outputs the result in a human-readable format. This intentionally ruins the `stdout` string to actively prevent accidental `npm version` chaining during testing.
```bash
npx testbump --dry-run
```

### Scoped Execution (Positional Arguments)
You can pass specific test files as positional arguments to scope the evaluation. If you broke a contract in a file you *don't* pass, `testbump` ignores it.
```bash
npx testbump test/auth.test.js test/user.test.js
```
