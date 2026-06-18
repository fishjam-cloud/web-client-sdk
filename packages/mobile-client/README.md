# @fishjam-cloud/react-native-client

React Native client library for Fishjam.

## Installation

```bash
npm install @fishjam-cloud/react-native-client
# or
yarn add @fishjam-cloud/react-native-client
```

## Local Development with WebRTC Fork

This package depends on `@fishjam-cloud/react-native-webrtc`, a fork of `react-native-webrtc`. The fork lives in [its own GitHub repo](https://github.com/fishjam-cloud/fishjam-react-native-webrtc) and is included in this monorepo as a git submodule at `packages/react-native-webrtc/`, wired up as a yarn workspace. No manual linking is required.

### Setup

Clone the repository with submodules:

```bash
git clone --recurse-submodules https://github.com/fishjam-cloud/web-client-sdk.git
```

If you already cloned without `--recurse-submodules`, initialize the submodules from inside the repo:

```bash
git submodule update --init --recursive
```

Then install dependencies from the repo root:

```bash
yarn install
```

Yarn resolves `@fishjam-cloud/react-native-webrtc` to the workspace at `packages/react-native-webrtc/`, and React Native autolinking picks up the native iOS and Android code automatically through the symlinked package.

### Development Workflow

| Change Type                           | What to Do                                            |
| ------------------------------------- | ----------------------------------------------------- |
| **JS/TS changes** in the fork         | Save → Metro hot reloads automatically                |
| **Native code changes** (iOS/Android) | Save → Rebuild the app (`yarn ios` or `yarn android`) |

No `pod install` or `yarn install` is needed after native code changes — just rebuild the app.

### Updating the Submodule

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

When bumping the submodule across a version boundary, also update `peerDependencies.@fishjam-cloud/react-native-webrtc` in this package's `package.json` so external consumers see the correct range.

### Contributing Changes to the Fork

Changes inside `packages/react-native-webrtc/` belong to the fork's own repo, not this one. To push them upstream:

```bash
cd packages/react-native-webrtc
git checkout -b your-feature-branch
# commit your changes
git push origin your-feature-branch
# open a PR against fishjam-cloud/fishjam-react-native-webrtc
```

Once the upstream PR is merged, bump the submodule sha here (see "Updating the Submodule" above).
