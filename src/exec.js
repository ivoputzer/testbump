import { spawn } from 'node:child_process'

export const run = (command, cwd) => {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, stdio: 'pipe' })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk.toString() })
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.on('close', code => {
      resolve({ stdout, stderr, pass: code === 0 })
    })
  })
}
