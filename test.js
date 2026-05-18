import { test } from 'node:test'
import assert from 'node:assert'
import { execSync } from 'node:child_process'
import { runCommand, extractTestFilesFromJUnit, categorizeFiles, calculateTDB } from './index.js'

test('runCommand returns pass: true for successful commands', () => {
  const result = runCommand('echo "hello"', execSync)
  assert.strictEqual(result.pass, true)
  assert.match(result.stdout, /hello/)
})

test('extractTestFilesFromJUnit correctly parses test paths', () => {
  const mockXml = `
    <testcase name="test1" file="/Users/dev/testbump/test.js"/>
    <testcase name="test2" file="/Users/dev/testbump/lib/other.test.js"/>
  `
  const files = extractTestFilesFromJUnit(mockXml, '/Users/dev/testbump')
  assert.deepStrictEqual(files, ['test.js', 'lib/other.test.js'])
})

test('categorizeFiles separates source from tests', () => {
  const allFiles = ['index.js', 'test.js', 'package.json', 'README.md']
  const testFiles = ['test.js']

  const result = categorizeFiles(allFiles, testFiles)
  assert.deepStrictEqual(result.testFiles, ['test.js'])
  // package.json is ignored automatically
  assert.deepStrictEqual(result.sourceFiles, ['index.js', 'README.md'])
})

test('calculateTDB processes the matrix correctly', () => {
  assert.strictEqual(calculateTDB({ testOldOnNewPass: false, testNewOnOldPass: true }), 'major')
  assert.strictEqual(calculateTDB({ testOldOnNewPass: true, testNewOnOldPass: false }), 'minor')
  assert.strictEqual(calculateTDB({ testOldOnNewPass: true, testNewOnOldPass: true }), 'patch')
})
