module.exports = {
  extends: ['expo', '../../../.eslintrc.js'],
  ignorePatterns: [
    'dist/*',
    'node_modules/*',
    'coverage/*',
    'build/*',
    'ios/*',
    'android/*',
    '.eslintrc.js',
    'prettier.config.js',
    'global.d.ts',
  ],
  rules: {
    'import/no-unresolved': 'off',
  },
};
