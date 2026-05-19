#!/usr/bin/env node

import { cwd, exit } from 'node:process'
import { parseArgs } from 'node:util'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { bump } from '../index.js'

const options = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  verbose: { type: 'boolean' },
  'dry-run': { type: 'boolean', short: 'd' }
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

const { values } = args

if (values.help) {
  console.log(`
testbump - Test-Driven Bumps (TDB)

Usage:
  testbump [options] [test-files...]

Options:
  -h, --help       Show this help message
  -v, --version    Show the currently installed testbump version
      --verbose    Run the logic matrix and output detailed explanations to stderr, but still return the bump string
  -d, --dry-run    Run the logic matrix, output explanations, and prevent accidental npm version chaining
  `)
  exit(0)
}

if (values.version) {
  const pkgPath = join(import.meta.dirname, '..', 'package.json')
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
  console.log(pkg.version)
  exit(0)
}

try {
  // Only enable verbose if explicitly requested
  const bumpStr = await bump(cwd(), { verbose: values.verbose })

  if (values['dry-run']) {
    // Sabotages npm version chaining
    console.log(`[testbump] Dry run complete. Would bump: ${bumpStr} (aborting...)`)
  } else {
    // Raw output
    console.log(bumpStr)
  }
} catch ({ message }) {
  console.error('[testbump] Error: %s', message)
  exit(1)
}
