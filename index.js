export const runCommand = (cmd, execSync, cwd = process.cwd()) => {
  try {
    return { stdout: execSync(cmd, { cwd, encoding: 'utf-8', stdio: 'pipe' }), pass: true }
  } catch (err) {
    return { stdout: err.stdout || err.message, pass: false }
  }
}
