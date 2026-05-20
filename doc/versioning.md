# Test-Driven Bumps (TDB)

Semantic Versioning (SemVer) is currently broken because it relies on human ego.
Developers are asked to decide if their changes are a "minor refactor" or a "breaking change." But humans are optimistic, lazy, and forgetful. `testbump` is **the strictest, most merciless Semantic Versioning tool for JS libraries.** It removes the human from the equation entirely. You don't get to decide what version you are bumping. Your tests do.

## The Philosophy
`testbump` operates on a single, indisputable rule: **Your test suite is the versioning contract.**
If you change the wording of an error message and a test was asserting that exact string, you broke the contract. That is a `MAJOR` bump. It mercilessly punishes bad developers and highly coupled tests, forcing you to write robust, accurate contracts.

## The Logic Matrix
Let **C** = Code, **T** = Tests.
Let **old** = Last Git Tag, **new** = Current HEAD.

`testbump` evaluates these two states against each other to derive mathematical truth:

### 💥 MAJOR (Breaking)
* **Rule:** `T(old)` fails on `C(new)`.
* **Meaning:** A previously guaranteed contract was broken by your new implementation. You altered a public API, changed a return type, or removed an expected behavior.

### ✨ MINOR (Feature)
* **Rule:** `T(old)` passes on `C(new)` AND `T(new)` fails on `C(old)`.
* **Meaning:** Old contracts are perfectly intact (backwards compatibility is maintained), but you added new tests/contracts that the old code cannot fulfill. You safely added a new feature.

### 🩹 PATCH (Fix)
* **Rule:** `T(old)` passes on `C(new)` AND `T(new)` passes on `C(old)`.
* **Meaning:** Old contracts are intact, and the old code effortlessly passes your new tests. No new API surface was added or tested. You simply refactored internal logic or fixed a bug without expanding the contract.

## The Verdict
If you are building a monolithic Express API with flaky, side-effect-heavy tests, this tool will make you cry.
If you are a library maintainer, building utility packages, or writing contract-driven microservices, `testbump` is the Holy Grail. It completely eliminates versioning anxiety.
