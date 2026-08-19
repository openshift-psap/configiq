# Release Process

## Overview

ConfigIQ uses semantic versioning with git tags to trigger container builds and version the UI.

## Creating a Release

1. **Update package.json version** (optional, for npm tracking):
   ```bash
   npm version patch|minor|major --no-git-tag-version
   ```

2. **Create and push a git tag**:
   ```bash
   git tag v0.2.1
   git push origin v0.2.1
   ```

3. **GitHub Actions automatically**:
   - Triggers the build workflow (`.github/workflows/build.yml`)
   - Builds the container image
   - Pushes to GHCR with multiple tags:
     - `ghcr.io/redhat-performance/configiq:0.2.1` (full semver)
     - `ghcr.io/redhat-performance/configiq:0.2` (major.minor)
     - `ghcr.io/redhat-performance/configiq:0` (major only)
     - `ghcr.io/redhat-performance/configiq:latest` (if on main branch)

## Version Display in UI

The sidebar footer shows:
- **Version**: From git tag (via `NEXT_PUBLIC_GIT_VERSION`)
- **Commit**: Short git hash (via `NEXT_PUBLIC_GIT_COMMIT`)
- **Build time**: UTC timestamp (via `NEXT_PUBLIC_BUILD_TIME`)

These are injected at build time by `scripts/inject-build-metadata.js`.

## Manual Workflow Dispatch

You can also trigger a build manually from the GitHub Actions UI without creating a tag. This will create branch-based tags (e.g., `main`, `main-abc1234`).

## Container Registry

Published containers: https://github.com/redhat-performance/configiq/pkgs/container/configiq

## Rollback

To rollback, deploy a previous tagged version:
```bash
podman pull ghcr.io/redhat-performance/configiq:0.2.0
```
