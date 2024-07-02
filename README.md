# Fishjam Cloud Web Client

React and TypeScript client libraries for [Fishjam Cloud](https://cloud.fishjam.stream).

## Installation

To install SDK you can use `npm` or `yarn` commands:

### React Library:

React library is useful for projects that uses React. It is wrapper over TypeScript library, that provides React
integration.

```bash
npm install @fishjam-cloud/react-client
```

or

```bash
yarn add @fishjam-cloud/react-client
```

### TypeScript Library:

TypeScript library is useful for projects that do not use React. Or if you want to have more control on how all
streaming events are handled.

```bash
npm install @fishjam-cloud/ts-client
```

or

```bash
yarn add @fishjam-cloud/ts-client
```

## Documentation

For more information visit [React Client](./packages/react-client/readme.md) or
[TypeScript Client](./packages/ts-client/README.md) website.

## Contributing

Contributions are always welcome, no matter how large or small!

We aspire to build a community that is friendly and respectful to each other. Please adhere to this spirit in all your
interactions within the project.

### Development Workflow

To get started with the project, run npm install in the root directory to install the required dependencies and build
TypeScript:

```bash
yarn
yarn build
```

Ensure your code passes TypeScript, ESLint and formatter checks by running the following commands:

```
yarn tsc
yarn lint:check
yarn format:check
```

To lint and format your code, use the following commands:

```bash
yarn lint
yarn format
```

## Copyright and License

Copyright 2024,
[Software Mansion](https://swmansion.com/?utm_source=git&utm_medium=readme&utm_campaign=fishjam-web-client)

[![Software Mansion](https://logo.swmansion.com/logo?color=white&variant=desktop&width=200&tag=fishjam-github)](https://swmansion.com/?utm_source=git&utm_medium=readme&utm_campaign=fishjam-web-client)

Licensed under the [Apache License, Version 2.0](LICENSE)
