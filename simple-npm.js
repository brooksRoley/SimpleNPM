const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const semver = require('semver');

class SimpleNPM {
  constructor() {
    this.registryUrl = 'https://registry.npmjs.org';
    this.installedPackages = new Map();
  }

  async install(packageName, version = 'latest') {
    const packageJson = await this.fetchPackageJson(packageName, version);
    await this.installPackageWithDependencies(packageName, packageJson.version, packageJson.dependencies);
    console.log(`Successfully installed ${packageName}@${packageJson.version}`);
  }

  async fetchPackageJson(packageName, version) {
    const url = `${this.registryUrl}/${packageName}/${version}`;
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`Failed to fetch package info for ${packageName}@${version}`));
          }
        });
      }).on('error', reject);
    });
  }

  async installPackageWithDependencies(packageName, version, dependencies) {
    if (this.installedPackages.has(packageName) && semver.gte(this.installedPackages.get(packageName), version)) {
      return; // Package already installed with same or higher version
    }

    console.log(`Installing ${packageName}@${version}`);
    const tarballUrl = `${this.registryUrl}/${packageName}/-/${packageName}-${version}.tgz`;
    const targetDir = path.join('node_modules', packageName);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    execSync(`curl -L ${tarballUrl} | tar xz -C ${targetDir} --strip-components=1`);
    this.installedPackages.set(packageName, version);

    if (dependencies) {
      for (const [depName, depVersion] of Object.entries(dependencies)) {
        const resolvedVersion = await this.resolveVersion(depName, depVersion);
        await this.installPackageWithDependencies(depName, resolvedVersion);
      }
    }
  }

  async resolveVersion(packageName, versionRange) {
    const packageData = await this.fetchPackageJson(packageName, 'latest');
    const availableVersions = Object.keys(packageData.versions);
    const maxSatisfying = semver.maxSatisfying(availableVersions, versionRange);
    
    if (!maxSatisfying) {
      throw new Error(`No version satisfying ${versionRange} found for ${packageName}`);
    }

    return maxSatisfying;
  }
}

async function main() {
  const [,, command, ...args] = process.argv;

  if (command !== 'install' || args.length === 0) {
    console.log('Usage: node simple-npm.js install <package-name>[@<version>] [<package-name>[@<version>] ...]');
    process.exit(1);
  }

  const simpleNpm = new SimpleNPM();

  for (const arg of args) {
    const [packageName, version] = arg.split('@');
    await simpleNpm.install(packageName, version || 'latest');
  }
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});