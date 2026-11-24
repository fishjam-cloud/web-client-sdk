<img width="2358" height="1030" alt="fishjam" src="https://github.com/user-attachments/assets/8851767c-c7ea-4907-88ef-3c7eab411c7f" />

# Fishjam Web Client

React and TypeScript client libraries for [Fishjam](https://fishjam.swmansion.com/).

## Documentation

Documentation is available [here](https://fishjam.swmansion.com/docs). There
is also API documentation [here](https://fishjam.swmansion.com/docs/api).

### React Library:

[React library](https://github.com/fishjam-cloud/web-client-sdk/tree/main/packages/react-client) is useful for projects
that uses React. It is wrapper over TypeScript library, that provides React integration.

Check out [docs](https://fishjam.swmansion.com/docs/tutorials/react-quick-start) for more information.

### TypeScript Library:

[TypeScript library](https://github.com/fishjam-cloud/web-client-sdk/tree/main/packages/ts-client) is useful for
projects that do not use React. Or if you want to have more control on how all streaming events are handled.

> [!NOTE]  
> TypeScript SDK is not stable yet. We recommend using React Client

## Contributing

Contributions are always welcome, no matter how large or small!

We aspire to build a community that is friendly and respectful to each other. Please adhere to this spirit in all your
interactions within the project.

### Development Workflow

This repo uses git submodules for `packages/protobufs/protos` and `packages/react-native-webrtc`. Clone with submodules:

```bash
git clone --recurse-submodules https://github.com/fishjam-cloud/web-client-sdk.git
```

If you cloned without `--recurse-submodules`, initialize them after the fact:

```bash
git submodule update --init --recursive
```

Then install dependencies and build:

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

### Working on the React Native WebRTC fork

`@fishjam-cloud/react-native-client` depends on `@fishjam-cloud/react-native-webrtc`, a fork of `react-native-webrtc`.
The fork lives in [its own repository](https://github.com/fishjam-cloud/fishjam-react-native-webrtc) and is included
here as a git submodule at `packages/react-native-webrtc/`, wired up as a yarn workspace. Yarn resolves the package to
the workspace and React Native autolinking picks up its native iOS and Android code, so no manual linking is needed.

#### Development workflow

| Change Type                           | What to Do                                            |
| ------------------------------------- | ----------------------------------------------------- |
| **JS/TS changes** in the fork         | Save → Metro hot reloads automatically                |
| **Native code changes** (iOS/Android) | Save → Rebuild the app (`yarn ios` or `yarn android`) |

No `pod install` or `yarn install` is needed after native code changes — just rebuild the app.

#### Updating the Submodule

The submodule tracks the fork's `master` branch but is pinned to a specific commit. To update to the latest upstream:

```bash
git submodule update --remote packages/react-native-webrtc
git add packages/react-native-webrtc
git commit -m "Bump react-native-webrtc submodule"
```

To check out a specific tag or commit:

```bash
git -C packages/react-native-webrtc fetch
git -C packages/react-native-webrtc checkout <tag-or-sha>
git add packages/react-native-webrtc
git commit -m "Pin react-native-webrtc to <tag-or-sha>"
```

When bumping the submodule across a version boundary, also update `peerDependencies.@fishjam-cloud/react-native-webrtc` in `packages/mobile-client/package.json` so external consumers see the correct range.

#### Contributing Changes to the Fork

Changes inside `packages/react-native-webrtc/` belong to the fork's own repo, not this one. To push them upstream:

```bash
cd packages/react-native-webrtc
git checkout -b your-feature-branch
# commit your changes
git push origin your-feature-branch
# open a PR against fishjam-cloud/fishjam-react-native-webrtc
```

Once the upstream PR is merged, bump the submodule sha here (see "Updating the Submodule" above).

## Submitting a Pull Request

> **Working on your first pull request?** Get started with this _free_ series:
> [How to Contribute to an Open Source Project on GitHub](https://app.egghead.io/playlists/how-to-contribute-to-an-open-source-project-on-github).

When you're sending a pull request:

- Focus on one change and try to keep pull requests small.
- Make sure that formatter, linter and test checks are passing.
- Review the documentation to make sure it looks good.
- Follow the pull request template when opening a pull request.
- If your pull request changes the API or implementation, first discuss the changes with the maintainers by opening an
  issue.

## License

Licensed under the [Apache License, Version 2.0](./LICENSE)

## Fishjam is created by Software Mansion

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with experience in building web and mobile
apps. We are Core React Native Contributors and experts in dealing with all kinds of React Native issues. We can help
you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=fishjam&utm_medium=web-readme).

[![Software Mansion](https://logo.swmansion.com/logo?color=white&variant=desktop&width=200&tag=react-client)](https://swmansion.com/contact/projects?utm_source=fishjam&utm_medium=web-readme)
