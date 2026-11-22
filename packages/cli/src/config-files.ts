// File part of it.ktrdiff.core.profile.ConfigLoader: reads `.ktrdiff.yml` layers and hands the
// parsed trees to core `mergeConfig`. Precedence: CLI > repository > user (~) > defaults; the CLI
// layer is applied by the commands on top of what this module returns.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { defaultConfig, mergeConfig, type DiffConfig } from '@ktrdiff/core';

export const CONFIG_FILE_NAME = '.ktrdiff.yml';

// Java read the files with Jackson over SnakeYAML, a YAML 1.1 parser: keep 1.1 scalar rules.
function readTree(file: string): unknown {
  return parse(readFileSync(file, 'utf8'), { version: '1.1' });
}

const isRegularFile = (p: string): boolean => existsSync(p) && statSync(p).isFile();

/** ConfigLoader.load: defaults <- user config <- repository config. */
export function loadConfig(repositoryDir: string | null, homeDir: string | null): DiffConfig {
  let config = defaultConfig();
  if (homeDir !== null) {
    const userFile = join(homeDir, CONFIG_FILE_NAME);
    if (isRegularFile(userFile)) config = mergeConfig(config, readTree(userFile));
  }
  if (repositoryDir !== null) {
    const repoFile = join(repositoryDir, CONFIG_FILE_NAME);
    if (isRegularFile(repoFile)) config = mergeConfig(config, readTree(repoFile));
  }
  return config;
}

/** ConfigLoader.loadFile: one explicit file (--config) over the defaults. */
export function loadConfigFile(file: string): DiffConfig {
  return mergeConfig(defaultConfig(), readTree(file));
}
