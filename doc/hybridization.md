# Dependency Hybridization

`testbump` evaluates semantic versions by time-traveling your codebase across Git history. But because Node.js resolves modules locally from a single `node_modules` tree, we cannot simply copy old files over new files.

- **Code dependencies (`dependencies`) track the Implementation.**
- **Test dependencies (`devDependencies`) track the Contracts.**

To mathematically guarantee accurate test execution without False Positives, `testbump` physically synthesizes a hybrid `package.json` in each isolated Git Worktree.

## Scenario A: `T(old)` on `C(new)`
*Are old contracts intact against the new reality?*

We overlay the new source code (`HEAD`) into the baseline worktree (`TAG`).
Because the new code might use upgraded libraries, but the old tests rely on the old testing framework, the environment must be synthesized as:
* **Code:** `C(new)`
* **Tests:** `T(old)`
* **`dependencies`:** `HEAD` *(New code gets its new tools)*
* **`devDependencies`:** `TAG` *(Old tests get their old frameworks)*

## Scenario B: `T(new)` on `C(old)`
*Does the old baseline fulfill the newly written contracts?*

We overlay the new tests (`HEAD`) into the baseline worktree (`TAG`).
Because the old code relies on its historical dependencies, but the newly written tests might use a new assertion library or mock tool, the environment must be synthesized as:
* **Code:** `C(old)`
* **Tests:** `T(new)`
* **`dependencies`:** `TAG` *(Old code gets its historical tools)*
* **`devDependencies`:** `HEAD` *(New tests get their new frameworks)*

## Anti-Leeching (No Magic)
`testbump` keeps worktrees physically inside the project root (`cwd/.bump-worktree-*`). By synthesizing this exact `package.json` and installing it natively, a local `node_modules` folder is generated. This traps Node's module resolution, preventing tests from accidentally "leeching" dependencies from the parent directory.
