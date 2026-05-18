#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { rmSync, copyFileSync, existsSync } from 'node:fs'
import { runCommand } from '../index.js'

const OLD_DIR = join(process.cwd(), '.old-state')
const TEST_FILE = 'test.js' // Hardcoded for V1 simplicity

try {
  // 1. Get the last tag
  const lastTagResult = runCommand('git describe --tags --abbrev=0', execSync)
  if (!lastTagResult.pass || !lastTagResult.stdout.trim()) {
    console.log('minor') // Default bump if no tags exist yet
    process.exit(0)
  }
  const lastTag = lastTagResult.stdout.trim()

  // 2. Setup Git Worktree
  if (existsSync(OLD_DIR)) {
    runCommand(`git worktree remove --force ${OLD_DIR}`, execSync)
  }
  runCommand(`git worktree add ${OLD_DIR} ${lastTag}`, execSync)

  // 3. Scenario A: T(old) on C(new)
  // Backup current test, copy old test over, run against current code
  copyFileSync(TEST_FILE, `${TEST_FILE}.backup`)
  copyFileSync(join(OLD_DIR, TEST_FILE), TEST_FILE)

  const testOldOnNew = runCommand(`node --test ${TEST_FILE}`, execSync)

  // Restore current tests immediately
  copyFileSync(`${TEST_FILE}.backup`, TEST_FILE)
  rmSync(`${TEST_FILE}.backup`)

  if (!testOldOnNew.pass) {
    console.log('major')
    process.exit(0)
  }

  // 4. Scenario B: T(new) on C(old)
  // Copy current test into worktree, run against old code
  copyFileSync(TEST_FILE, join(OLD_DIR, TEST_FILE))
  const testNewOnOld = runCommand(`node --test ${TEST_FILE}`, execSync, OLD_DIR)

  if (!testNewOnOld.pass) {
    console.log('minor')
    process.exit(0)
  }

  // 5. Scenario C: Both pass -> Patch
  console.log('patch')
} catch (err) {
  console.error(err.message)
  process.exit(1)
} finally {
  // Cleanup Worktree
  if (existsSync(OLD_DIR)) {
    runCommand(`git worktree remove --force ${OLD_DIR}`, execSync)
  }
}
