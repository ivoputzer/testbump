import { relative } from 'node:path'

// Execute a shell command safely
export const runCommand = (cmd, execSync, cwd = process.cwd()) => {
  try {
    return { stdout: execSync(cmd, { cwd, encoding: 'utf-8', stdio: 'pipe' }), pass: true }
  } catch (err) {
    return { stdout: err.stdout || err.message, pass: false }
  }
}

// Use the JUnit trick to natively extract test files
export const extractTestFilesFromJUnit = (junitXml, cwd) => {
  const matches = [...junitXml.matchAll(/file="([^"]+)"/g)]
  return matches
    .map(match => match[1])
    .map(absPath => relative(cwd, absPath)) // Convert to relative paths
    .filter((v, i, a) => a.indexOf(v) === i) // Unique values only
}

// Figure out what is source code vs tests
export const categorizeFiles = (allTrackedFiles, testFiles) => {
  return {
    sourceFiles: allTrackedFiles.filter(f => !testFiles.includes(f) && !f.includes('package.json')),
    testFiles
  }
}

// The TDB Logic Matrix
export const calculateTDB = ({ testOldOnNewPass, testNewOnOldPass }) => {
  if (!testOldOnNewPass) return 'major'
  if (!testNewOnOldPass) return 'minor'
  return 'patch'
}
