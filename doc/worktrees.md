# Git Worktrees & Parallel Execution

To evaluate the Logic Matrix, `testbump` must test the Code from today against the Tests from yesterday (and vice-versa). Doing this sequentially by switching branches would mutate your current working directory, cause file locks, and take forever.

Instead, `testbump` uses **Git Worktrees**.

## How it Works
A Git Worktree allows you to check out multiple branches (or tags) of the same repository in different directories simultaneously, without cloning the repository over the network.

When you run `testbump`, it creates two hidden, isolated directories inside your project root:
* `.bump-worktree-A` (Used for Scenario A)
* `.bump-worktree-B` (Used for Scenario B)

It checks out the baseline tag in both worktrees concurrently. It then uses high-performance OS file copying to overlay the specific files required for the matrix (`C(new)` into Worktree A, `T(new)` into Worktree B).

## Safety & Cleanup
* **Zero Mutation:** Your actual working directory (`cwd`) and uncommitted changes are completely untouched. The evaluation happens entirely in the isolated worktrees.
* **Deterministic Teardown:** `testbump` guarantees teardown. Whether the run succeeds, crashes, or is aborted via `SIGINT` (Ctrl+C), it uses native Git commands to force-remove the worktrees, leaving your repository pristine.
