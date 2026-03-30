# Agents

## Cursor Cloud specific instructions

### Overview

Fishjam Web Client SDK — a Yarn 4 monorepo of TypeScript/React client libraries for the Fishjam real-time WebRTC streaming platform. Published as `@fishjam-cloud/*` npm packages.

### Key commands

All commands run from the workspace root. See `package.json` `scripts` for the full list.

| Action | Command |
|---|---|
| Install deps | `corepack enable && yarn` |
| Build all | `yarn build` |
| Unit tests | `yarn test:unit` |
| Lint | `yarn lint:check` |
| Format | `yarn format:check` |
| Typecheck | `yarn tsc` |
| Dev server (example) | `yarn dev` in `examples/react-client/minimal-react` |

### Caveats

- The project uses **Yarn 4.12.0** via Corepack. Run `corepack enable` before `yarn` if you get a Yarn version mismatch.
- Git submodule `packages/protobufs/protos` must be initialized (`git submodule update --init --recursive`) before the first build. The generated `.ts` files are committed, so `protoc` is not needed unless regenerating protos.
- CI uses Node 22 for Playwright E2E tests and Node 24.4.1 for lint/build/unit-test checks. Node 22.x works for all local development tasks.
- E2E tests require a running Fishjam server via `VITE_FISHJAM_URL` env var (external service, not available locally by default).
- The minimal React example app (`examples/react-client/minimal-react`) runs on port 5173 via Vite and needs `yarn build` to have been run first so workspace package links resolve.
- Pre-commit hook (`husky` + `lint-staged`) runs formatting/linting on staged files. It aborts the commit if lint-staged modifies any files.
- `packages/mobile-client/README.md` has a known Prettier formatting warning that exists on `main`.
