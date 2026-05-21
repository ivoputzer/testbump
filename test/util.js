import process from 'node:process'
import { exec } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

export const execAsync = promisify(exec)

export function cleanEnvironment ({ NODE_TEST_IPC, NODE_TEST_CONTEXT, ...env } = process.env) {
/*
  CRITICAL NODE QUIRK
    Strip internal IPC variables for tests.
    Without this, executing `testbump` via `exec` inside an existing `node --test` suite causes the nested test runners to hijack the parent's IPC pipe and hang.
*/
  return env
}

export async function createModule (cwd, pkg) {
  await execAsync('git init', { cwd })
  await execAsync('git config user.email "test@bump.local"', { cwd })
  await execAsync('git config user.name "test"', { cwd })
  await writeFile(join(cwd, '.gitignore'), 'node_modules/\n')
  return updateModule(cwd, pkg)
}

export async function updateModule (cwd, pkg) {
  await writeJson(cwd, 'package.json', { type: 'module', scripts: { test: 'node --test' }, ...pkg })
  return execAsync('npm install', { cwd })
}

export async function updateModuleSource (cwd, source, file = 'index.js') {
  return await writeFile(join(cwd, file), source)
}

export async function updateModuleTest (cwd, test, file = 'test.js') {
  return await writeFile(join(cwd, file), test)
}

export async function createModuleCommit (cwd, message) {
  await execAsync('git add .', { cwd })
  return execAsync(`git commit -m "${message}"`, { cwd })
}

export async function createModuleVersion (cwd, message, tag) {
  await createModuleCommit(cwd, message)
  return execAsync(`git tag "v${tag}" -m "${tag}"`, { cwd })
}

export async function writeJson (cwd, file, content, { stringify } = JSON) {
  return writeFile(join(cwd, file), stringify(content))
}

export async function readJson (cwd, file, fallback = {}, { parse } = JSON) {
  try {
    return parse(await readFile(join(cwd, file), 'utf8'))
  } catch {
    return fallback
  }
}
