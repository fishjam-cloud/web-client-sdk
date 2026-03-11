module.exports = {
  extends: ['expo', '../../../.eslintrc.js', 'plugin:prettier/recommended'],
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
};
