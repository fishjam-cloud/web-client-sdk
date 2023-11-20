# Contributing

Contributions are always welcome, no matter how large or small!

We want this community to be friendly and respectful to each other. Please follow it in all your interactions with the project. Before contributing, please read the [code of conduct](./CODE_OF_CONDUCT.md).

## Development workflow

To get started with the project, run `npm install` in the root directory to install the required dependencies for each package:

```sh
npm install
```

Make sure your code passes TypeScript and ESLint. Run the following to verify:

```sh
npm run watch
npm run lint
```

To fix formatting errors, run the following:

```sh
npm run lint --fix
```

To use prettier, run the following:

```sh
npm run format
```

### Linting

[ESLint](https://eslint.org/), [Prettier](https://prettier.io/), [TypeScript](https://www.typescriptlang.org/)

We use [TypeScript](https://www.typescriptlang.org/) for type checking, [ESLint](https://eslint.org/) with [Prettier](https://prettier.io/) for linting and formatting the code,

### e2e tests

We use [Playwright](https://playwright.dev/) to run e2e tests.

Use the `npm run e2e` command to run them. You may need to install the browsers using this command: `npx playwright install --with-deps`.

The e2e tests start a Jellyfish instance via Docker and [Testcontainers](https://node.testcontainers.org/).

#### Colima

If you are using [colima](https://github.com/abiosoft/colima), you need to run these commands first:

```bash
export DOCKER_HOST=unix://${HOME}/.colima/default/docker.sock
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
```

See the Testcontainers' documentation to learn about [known issues](https://node.testcontainers.org/supported-container-runtimes/#known-issues_1).

### Scripts

The `package.json` file contains various scripts for common tasks:

- `npm run watch`: type-check files with TypeScript.
- `npm run lint`: lint files with ESLint.
- `npm run format`: format files with Prettier.
- `npm run dev`: run the dashboard in development mode.
- `npm run build`: build the dashboard for production.

### Sending a pull request

> **Working on your first pull request?** You can learn how from this _free_ series: [How to Contribute to an Open Source Project on GitHub](https://app.egghead.io/playlists/how-to-contribute-to-an-open-source-project-on-github).

When you're sending a pull request:

- Prefer small pull requests focused on one change.
- Verify that linters and tests are passing.
- Review the documentation to make sure it looks good.
- Follow the pull request template when opening a pull request.
- For pull requests that change the API or implementation, discuss with maintainers first by opening an issue.
