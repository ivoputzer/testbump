[![cd](https://img.shields.io/github/actions/workflow/status/ivoputzer/testbump/cd.yml?style=flat-square&colorB=44CC11)](https://github.com/ivoputzer/testbump/actions/workflows/cd.yml)
[![dependencies](https://img.shields.io/badge/dependencies-none-blue.svg?style=flat-square&colorB=44CC11)](https://github.com/ivoputzer/testbump/blob/main/package.json)
[![style](https://img.shields.io/badge/coding%20style-standard-brightgreen.svg?style=flat-square&colorB=44CC11)](http://standardjs.com)
[![coverage](https://img.shields.io/coveralls/ivoputzer/testbump.svg?style=flat-square&colorB=44CC11)](https://coveralls.io/github/ivoputzer/testbump?branch=master)
[![version](https://img.shields.io/npm/v/testbump.svg?label=version&style=flat-square&colorB=007EC6)](https://www.npmjs.com/package/testbump)
[![node](https://img.shields.io/node/v/testbump?style=flat-square&colorB=007EC6)](https://nodejs.org/docs/v22.3.0/api)
[![license](https://img.shields.io/npm/l/testbump.svg?style=flat-square&colorB=007EC6)](https://spdx.org/licenses/WTFNMFPL)

testbump
---

**The tool that tells you if you broke your own contract.**

`testbump` determines your semantic version based purely on the principle that your **test suite is the versioning contract**. No AST parsing, no complex rules, no dependency hell. Just pure **Test-Driven Bumps (TDB)** using Node and Git.

## The Logic Matrix
Let **C** = Code, **T** = Tests.
Let **old** = Last Git Tag, **new** = Current HEAD.

💥 **MAJOR (Breaking):** `T(old)` fails on `C(new)`. *(You broke a previously guaranteed contract).*

✨ **MINOR (Feature):** `T(old)` passes on `C(new)` AND `T(new)` fails on `C(old)`. *(Old contracts are intact, but you added new tests/contracts that old code cannot fulfill).*

🩹 **PATCH (Fix):** `T(old)` passes on `C(new)` AND `T(new)` passes on `C(old)`. *(Old contracts are intact, and no new code surface was tested).*

## Usage
Run it in your CI or locally to get the next version bump
```bash
npx testbump # outputs: major, minor, or patch
```

Chain it directly into npm
```bash
npm version $(npx testbump)
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

## Requirements
* Git
* Node LTS
* Tests written using the native `node:test` runner.

## License
[WTFNMFPL](https://spdx.org/licenses/WTFNMFPL)
