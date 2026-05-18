testbump
---
**The tool that tells you if you broke your own contract.**

`testbump` determines your semantic version based purely on the principle that your **Test Suite is the API Contract**. No AST parsing, no complex rules, no dependency hell. Just pure **Test-Driven Bumps (TDB)** using Node v24 and Git.

## The Logic Matrix
Let **C** = Code, **T** = Tests. 
Let **old** = Last Git Tag, **new** = Current HEAD.

💥 **MAJOR (Breaking):** `T(old)` fails on `C(new)`. *(You broke a previously guaranteed contract).*

✨ **MINOR (Feature):** `T(old)` passes on `C(new)` AND `T(new)` fails on `C(old)`. *(Old contracts are intact, but you added new tests/contracts that old code cannot fulfill).*

🩹 **PATCH (Fix):** `T(old)` passes on `C(new)` AND `T(new)` passes on `C(old)`. *(Old contracts are intact, and no new API surface was tested).*

## Usage
Run it in your CI or locally to get the next version bump
```bash
npx testbump
# outputs: major, minor, or patch
```
Chain it directly into npm
```bash
npm version $(npx testbump)
```

## Requirements
* Git
* Node v24+
* Tests written using the native `node:test` runner.
