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
  ],
  rules: {
    'import/no-unresolved': 'off',
  },
};
