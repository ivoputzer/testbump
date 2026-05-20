import process from 'node:process'
import { exec } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

export const execAsync = promisify(exec)

export function cleanEnvironment ({ NODE_TEST_IPC, NODE_TEST_CONTEXT, ...env } = process.env) {
  return env
}

export async function createModule (cwd, dependencies) {
  await execAsync('git init', { cwd })
  await execAsync('git config user.email "test@bump.local"', { cwd })
  await execAsync('git config user.name "test"', { cwd })
  await writeFile(join(cwd, '.gitignore'), 'node_modules/\n')
  return updateModule(cwd, dependencies)
}

export async function updateModule (cwd, dependencies) {
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ type: 'module', scripts: { test: 'node --test' }, ...dependencies }))
  return execAsync('npm install', { cwd })
}

export async function updateModuleSource (cwd, source) {
  return await writeFile(join(cwd, 'index.js'), source)
}
export async function updateModuleTest (cwd, test) {
  return await writeFile(join(cwd, 'test.js'), test)
}

export async function createModuleCommit (cwd, message) {
  await execAsync('git add .', { cwd })
  return execAsync(`git commit -m "${message}"`, { cwd })
}

export async function createModuleVersion (cwd, message, tag) {
  await createModuleCommit(cwd, message)
  return execAsync(`git tag "v${tag}" -m "${tag}"`, { cwd })
}
