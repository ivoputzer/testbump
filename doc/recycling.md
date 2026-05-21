# Dependency Recycling

`testbump` is designed for speed. In modern CI/CD environments, running `npm install` multiple times is the primary bottleneck. `testbump` solves this via **Dependency Recycling**.

## How it Works
Node.js naturally resolves modules by traversing up the directory tree. Because `testbump` creates its Git Worktrees inside the project root, it can "recycle" the parent directory's `node_modules` instantly.

## Zero-Latency Hybridization
Before evaluating the logic matrix, `testbump` synthesizes a hybrid `package.json` for the specific scenario (Scenario A or B). 

1. **The Equality Check:** It compares the synthesized `hybridPkg` against the parent's `package.json`.
2. **The Recycling Decision:**
   - **Match Found:** If the dependencies are identical and the parent has `node_modules` present, `testbump` **does nothing**. It lets Node.js recycle the parent's dependencies. Execution is instantaneous.
   - **Divergence Found:** If the dependencies have drifted (e.g., a version upgrade in Scenario A or a new test utility in Scenario B), `testbump` triggers a surgical `npm install` inside the worktree to ensure a deterministic environment.

## Benefits
- **CI Performance:** 95% of commits don't change dependencies. These runs now execute in seconds.
- **Offline Reliability:** Works perfectly in "cold" environments (like a fresh Git clone) by gracefully falling back to a full install.
- **Atomic Isolation:** By using a local `package.json` in the worktree, we prevent the "Ghost Leeching" bug where a worktree might accidentally resolve an incompatible dependency version from the parent.
