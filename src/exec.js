import { spawn } from 'node:child_process'

export const run = async (command, cwd, options = {}) => {
  const { timeout = 60000, retries = 0 } = options

  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await new Promise((resolve) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const child = spawn(command, { cwd, shell: true, stdio: 'pipe', signal: controller.signal })

      const stdout = []
      const stderr = []

      child.stdout.on('data', chunk => stdout.push(chunk))
      child.stderr.on('data', chunk => stderr.push(chunk))

      child.on('close', code => {
        clearTimeout(timeoutId)
        resolve({
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
          pass: code === 0,
          attempt
        })
      })
      child.on('error', (err) => {
        clearTimeout(timeoutId)
        resolve({
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: err.name === 'AbortError'
            ? `Process timed out after ${timeout}ms.`
            : err.message,
          pass: false
        })
      })
    })
    if (result.pass || attempt === retries) {
      return result
    }
  }
}
