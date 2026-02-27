import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { glob } from 'glob';
import { readJsonFile, readFileIfExists } from './fs.js';
import { parseYaml } from './yaml.js';

interface WorkspacePackage {
  name: string;
  path: string; // absolute
  relativePath: string; // relative to root
  language?: string;
  description?: string;
}

interface MonoRepoDetection {
  detected: boolean;
  manager: 'npm' | 'yarn' | 'pnpm' | 'turborepo' | null;
  packageGlobs: string[];
  packages: WorkspacePackage[];
}

interface PackageJson {
  name?: string;
  description?: string;
  workspaces?: string[] | { packages: string[] };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface PnpmWorkspaceYaml {
  packages?: string[];
}

export function detectMonoRepo(rootDir: string): MonoRepoDetection {
  const noResult: MonoRepoDetection = {
    detected: false,
    manager: null,
    packageGlobs: [],
    packages: [],
  };

  // 1. Read root package.json for workspaces field
  const rootPkg = readJsonFile<PackageJson>(join(rootDir, 'package.json'));
  let packageGlobs: string[] = [];

  // 2. Check for pnpm-workspace.yaml — if present, use its packages globs, manager = 'pnpm'
  const pnpmWorkspace = readFileIfExists(join(rootDir, 'pnpm-workspace.yaml'));
  if (pnpmWorkspace) {
    const parsed = parseYaml<PnpmWorkspaceYaml>(pnpmWorkspace);
    if (parsed?.packages && Array.isArray(parsed.packages)) {
      packageGlobs = parsed.packages;
    }
    const packages = resolvePackages(rootDir, packageGlobs);
    return {
      detected: packages.length > 0,
      manager: 'pnpm',
      packageGlobs,
      packages,
    };
  }

  // Get workspaces from root package.json
  if (rootPkg?.workspaces) {
    if (Array.isArray(rootPkg.workspaces)) {
      packageGlobs = rootPkg.workspaces;
    } else if (rootPkg.workspaces.packages && Array.isArray(rootPkg.workspaces.packages)) {
      packageGlobs = rootPkg.workspaces.packages;
    }
  }

  if (packageGlobs.length === 0) {
    return noResult;
  }

  // 3. Check for turbo.json — if present, manager = 'turborepo'
  const hasTurbo = existsSync(join(rootDir, 'turbo.json'));
  if (hasTurbo) {
    const packages = resolvePackages(rootDir, packageGlobs);
    return {
      detected: packages.length > 0,
      manager: 'turborepo',
      packageGlobs,
      packages,
    };
  }

  // 4. Otherwise: yarn.lock → 'yarn', else 'npm'
  const hasYarnLock = existsSync(join(rootDir, 'yarn.lock'));
  const manager = hasYarnLock ? 'yarn' : 'npm';

  const packages = resolvePackages(rootDir, packageGlobs);
  return {
    detected: packages.length > 0,
    manager,
    packageGlobs,
    packages,
  };
}

function resolvePackages(rootDir: string, globs: string[]): WorkspacePackage[] {
  const packages: WorkspacePackage[] = [];
  const seen = new Set<string>();

  for (const pattern of globs) {
    // glob.sync returns matching directories
    const matches = glob.sync(pattern, { cwd: rootDir, absolute: false });

    for (const relativePath of matches) {
      const absPath = join(rootDir, relativePath);
      if (seen.has(absPath)) continue;

      // Must have a package.json to be a workspace package
      const pkgJsonPath = join(absPath, 'package.json');
      if (!existsSync(pkgJsonPath)) continue;

      seen.add(absPath);

      const pkg = readJsonFile<PackageJson>(pkgJsonPath);
      const name = pkg?.name || relativePath.replace(/\//g, '-');
      const language = detectLanguage(absPath, pkg);

      packages.push({
        name,
        path: absPath,
        relativePath,
        language,
        description: pkg?.description,
      });
    }
  }

  return packages;
}

function detectLanguage(dir: string, pkg: PackageJson | null): string | undefined {
  if (existsSync(join(dir, 'tsconfig.json'))) return 'typescript';
  const allDeps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  if (allDeps['typescript']) return 'typescript';
  if (pkg) return 'javascript';
  return undefined;
}
