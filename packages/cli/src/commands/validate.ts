// KtrDiffCli.ValidateCommand: is the file a well-formed, parseable KTR document?

import { basename } from 'node:path';
import { ParseError } from '@ktrdiff/core';
import type { CliIo } from '../io.ts';
import { parseTransformationFile } from './inspect.ts';

export function runValidate(file: string, io: CliIo): number {
  try {
    const t = parseTransformationFile(file, io);
    io.stdout('OK: ' + basename(file) + ' — ' + t.steps.length + ' steps, ' + t.hops.length + ' hops\n');
    return 0;
  } catch (e) {
    if (!(e instanceof ParseError)) throw e;
    io.stderr('INVALID [' + e.code + ']: ' + e.message + '\n');
    return 2;
  }
}
