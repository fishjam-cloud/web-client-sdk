# Contributing

Contributions are always welcome, no matter how large or small!

We aspire to build a community that is friendly and respectful to each other.
Please adhere to this spirit in all your interactions within the project.

## Development Workflow

To get started with the project, run `npm install` in the root directory to
install the required dependencies:

```sh
npm install
```

Then, setup [Husky](https://typicode.github.io/husky/) to run pre-commit hooks:

```sh
npx husky
```

Ensure your code passes TypeScript, ESLint and formatter checks by running the
following commands:

```sh
npm run build:check
npm run lint:check
npm run format:check
```

To lint and format your code, use the following commands:

```sh
npm run lint
npm run format
```

For other scripts, refer to [package.json](./package.json).

### Code Checking

We utilize [TypeScript](https://www.typescriptlang.org/) for type checking,
[ESLint](https://eslint.org/) for linting, and [Prettier](https://prettier.io/)
for formatting the code.

### E2E Tests

We employ [Playwright](https://playwright.dev/) to run End-to-End (E2E) tests.

You can use the `npm run test:e2e` command to run these tests. However, you may
need to first install the browsers using this command:
`npx playwright install --with-deps`.

E2E tests initiate a Fishjam instance using Docker and
[Testcontainers](https://node.testcontainers.org/).

#### Colima

If you are a [Colima](https://github.com/abiosoft/colima) user, you will need to
run the following commands first:

```bash
export DOCKER_HOST=unix://${HOME}/.colima/default/docker.sock
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
```

To learn about known issues, refer to the
[Testcontainers' documentation](https://node.testcontainers.org/supported-container-runtimes/#known-issues_1).

### Submitting a Pull Request

> **Working on your first pull request?** Get started with this _free_ series:
> [How to Contribute to an Open Source Project on GitHub](https://app.egghead.io/playlists/how-to-contribute-to-an-open-source-project-on-github).

When you're sending a pull request:

- Focus on one change and try to keep pull requests small.
- Make sure that formatter, linter and test checks are passing.
- Review the documentation to make sure it looks good.
- Follow the pull request template when opening a pull request.
- If your pull request changes the API or implementation, first discuss the
  changes with the maintainers by opening an issue.

## Releasing New Versions

To release a new version of the package, navigate to `Actions` >
`Release package` workflow and trigger it with the chosen release type. The
workflow will update the package version in `package.json`, release the package
to NPM, create a new git tag and a GitHub release.
