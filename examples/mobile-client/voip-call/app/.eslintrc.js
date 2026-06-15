module.exports = {
  root: true,
  extends: ['expo'],
  ignorePatterns: [
    'dist/*',
    'node_modules/*',
    'ios/*',
    'android/*',
    'server/*',
    '.eslintrc.js',
    'prettier.config.js',
  ],
  rules: {
    'import/no-unresolved': 'off',
  },
};
