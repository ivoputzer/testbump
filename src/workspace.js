import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const createWorkspace = (cwd, { fs, fsPromises, run }) => {
  const getPackagePath = () => join(cwd, 'package.json')

  const readPackage = async () => {
    const pkgPath = getPackagePath()
    if (!fs.existsSync(pkgPath)) {
      throw new Error('No package.json found. Please run `npm init` first.')
    }
    return JSON.parse(await fsPromises.readFile(pkgPath, 'utf8'))
  }

  return {
    getTestCommand: async () => {
      const pkgPath = getPackagePath()
      if (!fs.existsSync(pkgPath)) throw new Error('No package.json found.')
      const pkg = JSON.parse(await fsPromises.readFile(pkgPath, 'utf8'))

      if (!pkg.scripts?.test) throw new Error('No "test" script found in package.json.')
      return pkg.scripts.test
    },

    discoverContractFiles: async (testCmd, resultsPath, globs = []) => {
      const reporterPath = fileURLToPath(new URL('../lib/customReporter.js', import.meta.url))
      let cmd = `${testCmd} --test-reporter="${reporterPath}" --test-reporter-destination="${resultsPath}"`

      if (globs.length > 0) cmd += ' ' + globs.map(g => `"${g}"`).join(' ')

      await run(cmd, cwd)

      if (!fs.existsSync(resultsPath)) {
        throw new Error('No test files discovered! Testbump requires at least one test file to form a contract.')
      }

      const rawFiles = JSON.parse(await fsPromises.readFile(resultsPath, 'utf8'))
      const testFiles = rawFiles.map(p => relative(cwd, p))

      if (testFiles.length === 0) {
        throw new Error('No test files discovered! Testbump requires at least one test file to form a contract.')
      }

      return testFiles
    },

    overlayFiles: async (files, source, destination) => {
      for (const file of files) {
        const src = join(source, file)
        const dst = join(destination, file)
        if (fs.existsSync(src)) {
          await fsPromises.mkdir(dirname(dst), { recursive: true })
          await fsPromises.cp(src, dst, { force: true })
        }
      }
    },

    removeFileSync: (filePath) => {
      try {
        fs.rmSync(filePath, { force: true })
      } catch {
      }
    },

    configureBumpScript: async () => {
      const pkg = await readPackage()
      pkg.scripts = pkg.scripts || {}
      pkg.scripts.bump = 'npm version $(npx testbump)'
      await fsPromises.writeFile(getPackagePath(), JSON.stringify(pkg, null, 2) + '\n')

      return pkg.version || '0.0.1'
    },

    npmVersion: async (version, commitMsg) => {
      return run(`npm version ${version} -m "${commitMsg}" --allow-same-version --force`, cwd)
    }
  }
}
