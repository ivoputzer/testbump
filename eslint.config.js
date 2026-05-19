import neostandard, { plugins, resolveIgnoresFromGitignore } from 'neostandard'

export default [
  ...neostandard({
    ignores: resolveIgnoresFromGitignore()
  }),
  plugins.n.configs['flat/recommended'],
]
