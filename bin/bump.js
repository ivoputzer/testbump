#!/usr/bin/env node

import { cwd, exit } from 'node:process'
import { bump } from '../index.js'

try {
  console.log(await bump(cwd()))
} catch ({ message }) {
  console.error('[testbump] Error: %s', message)
  exit(1)
}
