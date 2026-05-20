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
      const BATCH_SIZE = 100
      const createdDirs = new Set()

      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE)

        await Promise.all(batch.map(async (file) => {
          const src = join(source, file)
          const dst = join(destination, file)

          if (fs.existsSync(src)) {
            const dir = dirname(dst)

            // 1. Thread-safe, memoized directory creation
            if (!createdDirs.has(dir)) {
              try {
                await fsPromises.mkdir(dir, { recursive: true })
              } catch (err) {
                // Safely ignore EEXIST if another promise beat us to it
                if (err.code !== 'EEXIST') throw err
              }
              createdDirs.add(dir)
            }

            // 2. High-performance, concurrent file copying
            await fsPromises.copyFile(src, dst)
          }
        }))
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
    },

    syncDependencies: async (worktreeCwd, parentCwd, scenario) => {
      const wtPkgPath = join(worktreeCwd, 'package.json')
      const parentPkgPath = join(parentCwd, 'package.json')

      const wtPkg = fs.existsSync(wtPkgPath) ? JSON.parse(await fsPromises.readFile(wtPkgPath, 'utf8')) : {}
      const parentPkg = fs.existsSync(parentPkgPath) ? JSON.parse(await fsPromises.readFile(parentPkgPath, 'utf8')) : {}

      const hybridPkg = { ...wtPkg }

      switch (scenario) {
        // Scenario A (T(old) on C(new)): Code uses New deps, Tests use Old devDeps
        case 'A':
          hybridPkg.dependencies = parentPkg.dependencies || {}
          hybridPkg.devDependencies = wtPkg.devDependencies || {}
          break

        // Scenario B (T(new) on C(old)): Code uses Old deps, Tests use New devDeps
        case 'B':
          hybridPkg.dependencies = wtPkg.dependencies || {}
          hybridPkg.devDependencies = parentPkg.devDependencies || {}
          break
      }

      await fsPromises.writeFile(wtPkgPath, JSON.stringify(hybridPkg, null, 2) + '\n')

      // Recycling:
      // If our synthesized environment matches the parent exactly, we skip installation.
      // Node will natively traverse up and use the parent's node_modules!
      const getDepsStr = (pkg) => JSON.stringify({ d: pkg.dependencies || {}, dev: pkg.devDependencies || {} })
      const isPerfectMatch = getDepsStr(hybridPkg) === getDepsStr(parentPkg)
      const parentHasModules = fs.existsSync(join(parentCwd, 'node_modules'))

      if (isPerfectMatch && parentHasModules) return { pass: true } // Zero-latency execution

      // We must drop the lockfile (--no-package-lock) because our synthesized hybrid package.json is a unique timeline fracture that will not match either existing lockfile.
      const res = await run('npm install --no-package-lock --no-audit --no-fund --prefer-offline', worktreeCwd, { retries: 2 })

      if (!res.pass) {
        throw new Error(`Failed to install hybrid dependencies in Scenario ${scenario}:\n${res.stderr || res.stdout}`)
      }
      return res
    }
  }
}
