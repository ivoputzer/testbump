[![cd](https://img.shields.io/github/actions/workflow/status/ivoputzer/testbump/cd.yml?style=flat-square&colorB=44CC11)](https://github.com/ivoputzer/testbump/actions/workflows/cd.yml)
[![dependencies](https://img.shields.io/badge/dependencies-none-blue.svg?style=flat-square&colorB=44CC11)](https://github.com/ivoputzer/testbump/blob/main/package.json)
[![style](https://img.shields.io/badge/coding%20style-standard-brightgreen.svg?style=flat-square&colorB=44CC11)](http://standardjs.com)
[![coverage](https://img.shields.io/coveralls/ivoputzer/testbump.svg?style=flat-square&colorB=44CC11)](https://coveralls.io/github/ivoputzer/testbump?branch=master)
[![version](https://img.shields.io/npm/v/testbump.svg?label=version&style=flat-square&colorB=007EC6)](https://www.npmjs.com/package/testbump)
[![node](https://img.shields.io/node/v/testbump?style=flat-square&colorB=007EC6)](https://nodejs.org/docs/v22.3.0/api)
[![license](https://img.shields.io/npm/l/testbump.svg?style=flat-square&colorB=007EC6)](https://spdx.org/licenses/WTFNMFPL)

testbump
---

**The versioning tool that will tell you if you broke your own contracts.**

`testbump` determines your semantic version based purely on the principle that your **test suite is the versioning contract**. No AST parsing, no complex rules, no dependency hell. Just pure **Test-Driven Bumps (TDB)** using Node and Git.

## The Logic Matrix
Let **C** = Code, **T** = Tests.
Let **old** = Last Git Tag, **new** = Current HEAD.

💥 **MAJOR (Breaking):** `T(old)` fails on `C(new)`. *(You broke a previously guaranteed contract).*

✨ **MINOR (Feature):** `T(old)` passes on `C(new)` AND `T(new)` fails on `C(old)`. *(Old contracts are intact, but you added new tests/contracts that old code cannot fulfill).*

🩹 **PATCH (Fix):** `T(old)` passes on `C(new)` AND `T(new)` passes on `C(old)`. *(Old contracts are intact, and no new code surface was tested).*

## How it Works (Under the Hood)
`testbump` doesn't parse ASTs or guess your intentions. It uses **Git Worktrees** to time-travel.
It creates hidden, parallel worktrees of your last tagged release and physically overlays your new code. It dynamically synthesizes a hybrid `package.json` to ensure your new code gets its new dependencies, while your old tests get their historical testing frameworks. Then, it runs the matrix.

### Example: The Unintentional Breaking Change
```javascript
// v1.0.0 Code
export const fetchUser = () => ({ status: 'Not Found' })

// v1.0.0 Test
test('user missing', () => equal(fetchUser().status, 'Not Found'))

// --- You refactor for v2 ---

// HEAD Code
export const fetchUser = () => ({ status: 'User Not Found' })
```
*You might think this is a patch. `testbump` runs the v1.0.0 test against your HEAD code. It fails. `testbump` bumps you to `v2.0.0`. You broke the contract.*

## Usage
Run it in your CI or locally to get the next version bump
```bash
npx testbump # outputs: major, minor, or patch
```

Chain it directly into npm
```bash
npm version $(npx testbump)
```

Initialize your project automatically
```bash
npx testbump --init # updates package.json .scripts.bump and creates first git tag
```

## Setup
`testbump` requires a **Baseline Contract** (an initial git tag) to compare future code against.

1. **Initialize your project:**
   Ensure your `package.json` has a test script that uses the native Node test runner.
   ```json
   "scripts": {
     "test": "node --test",
     "bump": "npm version $(npx testbump)"
   }
   ```
2. **Write your first code & tests.**
3. **Establish the Baseline Contract:**
   Commit your work and create your first manual tag.
   ```bash
   git add .
   git commit -m "initial commit"
   git tag 0.0.1  # Or something like `npm version $(jq -r .version package.json) --allow-same-version`
   ```
4. **Let `testbump` take the wheel:**
   From now on, just run `npm run bump` when you want to release! Or have the [CI](https://github.com/ivoputzer/testbump/blob/main/.github/workflows/cd.yml#L43-L50) do it!

## Programmatic API
`testbump` isn't just a CLI. It's completely decoupled, meaning you can integrate it directly into your own Node-based CI/CD pipelines, bots, or release scripts.

```javascript
import { bump, init } from 'testbump'
import { cwd } from 'node:process'

// Returns 'major', 'minor', or 'patch'
const nextVersion = await bump(cwd(), {
  verbose: true,
  globs: ['test/**/*.test.js'] // Optionally scope your contracts
})
```

## Documentation
Dive deeper into the architecture, philosophy, and advanced mechanics of `testbump`:
* [Test-Driven Bumps (TDB) & Versioning Philosophy](doc/versioning.md)
* [CLI Reference](doc/cli.md)
* [Programmatic API](doc/api.md)
* [Git Worktrees & Parallel Execution](doc/worktrees.md)
* [Dependency Hybridization](doc/hybridization.md)
* [Dependency Recycling & Performance](doc/recycling.md)

## Requirements
* Git
* Node LTS
* Tests written using the native `node:test` runner.

## License
[WTFNMFPL](https://spdx.org/licenses/WTFNMFPL)
