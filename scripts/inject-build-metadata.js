#!/usr/bin/env node

// Inject build metadata into environment variables
// Run this in package.json build script before next build

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function execGit(command) {
  try {
    return execSync(command, { encoding: 'utf8', stderr: 'ignore' }).trim();
  } catch (e) {
    return null;
  }
}

// Get git commit hash
const gitCommit = execGit('git rev-parse HEAD') || 'unknown';

// Get version from git tag (most recent tag)
const gitVersion = execGit('git describe --tags --abbrev=0') || 'unknown';

// Get build timestamp
const buildTime = new Date().toISOString();

// Write to .env.local for Next.js to pick up
const envPath = path.join(__dirname, '..', '.env.local');

// Clear previous auto-generated metadata
let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
  // Remove old auto-generated section
  envContent = envContent.replace(/# Auto-generated build metadata.*?(?=\n#|\n[A-Z]|$)/s, '').trim();
}

// Append new metadata
const metadata = `
# Auto-generated build metadata - DO NOT EDIT
NEXT_PUBLIC_BUILD_TIME=${buildTime}
NEXT_PUBLIC_GIT_COMMIT=${gitCommit}
NEXT_PUBLIC_GIT_VERSION=${gitVersion}
`;

fs.writeFileSync(envPath, envContent + '\n' + metadata);

console.log('✅ Build metadata injected:');
console.log(`   Build time: ${buildTime}`);
console.log(`   Git commit: ${gitCommit.substring(0, 7)}`);
console.log(`   Git version: ${gitVersion}`);
