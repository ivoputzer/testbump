import { spawn } from 'node:child_process'

export const run = (command, cwd) => {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, stdio: 'pipe' })

    const stdout = []
    const stderr = []

    child.stdout.on('data', chunk => stdout.push(chunk))
    child.stderr.on('data', chunk => stderr.push(chunk))

    child.on('close', code => {
      resolve({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        pass: code === 0
      })
    })
  })
}
