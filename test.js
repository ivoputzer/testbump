import { test } from 'node:test'
import assert from 'node:assert'
import { execSync } from 'node:child_process'
import { runCommand } from './index.js'

test('runCommand returns pass: true for successful commands', () => {
  const result = runCommand('echo "hello"', execSync)
  assert.strictEqual(result.pass, true)
  assert.match(result.stdout, /hello/)
})

test('runCommand returns pass: false for failing commands', () => {
  const result = runCommand('exit 1', execSync)
  assert.strictEqual(result.pass, false)
})
