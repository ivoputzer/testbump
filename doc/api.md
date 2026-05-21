# Programmatic API

`testbump` is built with a Hexagonal Architecture. The core logic is completely decoupled from the CLI shell, meaning you can import it directly into your own Node.js scripts, GitHub Actions, or custom release bots.

## `bump(cwd, options)`
Evaluates the logic matrix and returns the calculated semantic version bump.

**Signature:**
```javascript
import { bump } from 'testbump'

const nextVersion = await bump(process.cwd(), {
  verbose: true,
  globs: ['test/**/*.test.js'] // Optionally scope the evaluation
})
// => 'major', 'minor', or 'patch'
```

**Options:**
* `globs` (Array<String>): A list of specific test files or globs to evaluate. If provided, `testbump` will only evaluate contracts defined in these files. Useful for monorepos or scoped changes.
* `logger` (Object): A custom logger object with `info` and `error` functions. By default, `testbump` runs silently.

---

## `init(cwd, options)`
Bootstraps a repository to be compatible with `testbump`. It injects the `"bump"` script into `package.json` and creates the baseline Git tag if one does not exist.

**Signature:**
```javascript
import { init } from 'testbump'

const result = await init(process.cwd(), {
  message: 'chore: testbump baseline setup'
})
// => String (Log of actions performed)
```

**Options:**
* `message` (String): The custom commit and tag message used when creating the baseline contract. Defaults to `"chore: baseline <version>"`.
