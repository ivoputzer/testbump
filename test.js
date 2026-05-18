import { test } from 'node:test'
import { equal, match, deepEqual } from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { runCommand, extractTestFilesFromJUnit, categorizeFiles, calculateTDB } from './index.js'

test('runCommand returns pass: true for successful commands', () => {
  const result = runCommand('echo "hello"', execSync)
  equal(result.pass, true)
  match(result.stdout, /hello/)
})

test('extractTestFilesFromJUnit correctly parses test paths', () => {
  const mockXml = `
    <testcase name="test1" file="/Users/dev/testbump/test.js"/>
    <testcase name="test2" file="/Users/dev/testbump/lib/other.test.js"/>
  `
  const files = extractTestFilesFromJUnit(mockXml, '/Users/dev/testbump')
  deepEqual(files, ['test.js', 'lib/other.test.js'])
})

test('categorizeFiles separates source from tests', () => {
  const allFiles = ['index.js', 'test.js', 'package.json', 'README.md']
  const testFiles = ['test.js']

  const result = categorizeFiles(allFiles, testFiles)
  deepEqual(result.testFiles, ['test.js'])
  deepEqual(result.sourceFiles, ['index.js', 'README.md'])
})

test('calculateTDB processes the matrix correctly', () => {
  equal(calculateTDB({ testOldOnNewPass: false, testNewOnOldPass: true }), 'major')
  equal(calculateTDB({ testOldOnNewPass: true, testNewOnOldPass: false }), 'minor')
  equal(calculateTDB({ testOldOnNewPass: true, testNewOnOldPass: true }), 'patch')
})
