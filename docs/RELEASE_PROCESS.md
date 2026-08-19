# Release Process

## Overview

ConfigIQ uses semantic versioning with git tags to trigger container builds and version the UI.

## Creating a Release

1. **Update package.json version** (optional, for npm tracking):
   ```bash
   npm version patch --no-git-tag-version
   ```
   Use `patch`, `minor`, or `major` depending on the type of release.

2. **Create and push a git tag**:
   ```bash
   git tag v0.2.1
   git push origin v0.2.1
   ```

3. **GitHub Actions automatically**:
   - Triggers the build workflow (`.github/workflows/build.yml`)
   - Builds the container image
   - Pushes to GHCR with tags:
     - `ghcr.io/redhat-performance/configiq:0.2.1` (specific version)
     - `ghcr.io/redhat-performance/configiq:latest` (most recent release)

## Version Display in UI

The sidebar footer shows:
- **Version**: From git tag (via `NEXT_PUBLIC_GIT_VERSION`)
- **Commit**: Short git hash (via `NEXT_PUBLIC_GIT_COMMIT`)
- **Build time**: UTC timestamp (via `NEXT_PUBLIC_BUILD_TIME`)

These are injected at build time by `scripts/inject-build-metadata.js`.

## Container Tags

- **`latest`** - Most recent tagged release (production)
- **`dev`** - Latest commit from main branch (development)
- **`0.2.1`** - Specific version tags

## Container Registry

Published containers: https://github.com/redhat-performance/configiq/pkgs/container/configiq

## Deployment

**Production**:
```bash
podman pull ghcr.io/redhat-performance/configiq:latest
```

**Development**:
```bash
podman pull ghcr.io/redhat-performance/configiq:dev
```

## Rollback

To rollback, deploy a previous tagged version:
```bash
podman pull ghcr.io/redhat-performance/configiq:0.2.0
```
