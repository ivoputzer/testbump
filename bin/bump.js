#!/usr/bin/env node

import { cwd, exit } from 'node:process'
import { parseArgs } from 'node:util'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { bump, init } from '../index.js'

const options = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  verbose: { type: 'boolean' },
  'dry-run': { type: 'boolean', short: 'd' },
  init: { type: 'boolean' },
  'init-message': { type: 'string' },
  'init-tag-message': { type: 'string' }
}

let args
try {
  args = parseArgs({
    options,
    allowPositionals: true,
    strict: false
  })
} catch (err) {
  console.error('[testbump] Error parsing arguments: %s', err.message)
  exit(1)
}

const { values, positionals } = args

if (values.help) {
  console.log(`
testbump - Test-Driven Bumps (TDB)

Usage:
  testbump [options] [test-files...]

Options:
  -h, --help               Show this help message
  -v, --version            Show the currently installed testbump version
      --verbose            Run the logic matrix and output detailed explanations to stderr
  -d, --dry-run            Run the logic matrix, output explanations, and prevent accidental npm chaining
      --init               Bootstrap the project: update package.json and create baseline git tag
      --init-message       Custom commit message for the init commit
  `)
  exit(0)
}

if (values.version) {
  const pkgPath = join(import.meta.dirname, '..', 'package.json')
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
  console.log(pkg.version)
  exit(0)
}

if (values.init) {
  try {
    console.log(await init(cwd(), {
      message: values['init-message'],
    }))
    exit(0)
  } catch ({ message }) {
    console.error('[testbump] Initialization Error: %s', message)
    exit(1)
  }
}

try {
  const bumpStr = await bump(cwd(), {
    verbose: values.verbose,
    globs: positionals
  })

  if (values['dry-run']) {
    console.log(`[testbump] Dry run complete. Would bump: ${bumpStr} (aborting...)`)
  } else {
    console.log(bumpStr)
  }
} catch ({ message }) {
  console.error('[testbump] Error: %s', message)
  exit(1)
}
