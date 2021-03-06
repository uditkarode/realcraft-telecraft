# Telecraft

Pluggable Minecraft server bridge and administration tools.

## Introduction

`// Todo(mkr): Documentation`

## How to use this monorepo

If you're here to read about a specific package, find it in `packages/`.

If you're trying to get involved with or tinker with the Telecraft project, read on.

Get [`pnpm`](https://pnpm.js.org/en/installation). `pnpm` is a fast, disk efficient package manager; usually a drop-in replacement to npm, but this repository is a monorepo. It manages multiple packages simultaneously by taking advantage of pnpm's workspace support.

Quick setup:

```bash
# Get pnpm
npm i -g pnpm

# install node modules for all packages
pnpm install -r

# run typescript build on all packages, so they're ready to go
pnpm build

# if you're actively developing, you'll want to run build in watch mode
pnpm build:w

# run cli package during development (alias to `node packages/cli/dist`)
pnpm dev
```

Now you're ready to go tinker with the packages and TypeScript will automatically build as you edit files! Packages within the monorepo are automatically linked by the `workspace:` protocol. Before publishing, pnpm will automatically convert them to the correct versions of those packages.

To update node modules used in all packages across the entire workspace, use `pnpm recursive install typescript@latest` from the root.

### Do NOT:

- Use npm, yarn, or another package manager in the root repo or any of the packages
- Install package specific modules from the root with or without recursive. `cd` into the package and install them.
- Publish the root repo. It's a container and not meant to be published.

### Do:

- Use `pnpm install @telecraft/parser@workspace:../parser` to add one package from this repo as a dependency to another
