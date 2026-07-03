# web-client-sdk

Fishjam web/client SDK — a Yarn (Berry, v4) workspace monorepo.

## Cursor Cloud specific instructions

Non-obvious setup caveat:

- `packages/protobufs/protos` and `packages/react-native-webrtc` are git submodules. They must be initialized before `yarn install`, otherwise install fails during resolution with `Workspace not found (@fishjam-cloud/react-native-webrtc@workspace:*)`. Run `git submodule update --init --recursive` first (the startup script does this).
- Validated commands: `yarn build`, `yarn test:unit`, and `yarn lint:check` all pass. `yarn test:e2e` needs Playwright browsers and a running backend.
