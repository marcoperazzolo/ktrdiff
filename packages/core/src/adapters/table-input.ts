// it.ktrdiff.core.adapters.TableInputAdapter — extracts the SQL query, the referenced connection
// name and the execute-for-each-row flag. The SQL text is compared as a document (line diff); it
// is never parsed against a database, never executed and variables are never expanded.

import { change, type Change, type Classification } from '../model/change.ts';
import type { StepModel } from '../model/document.ts';
import { sameStepType } from '../match/step-type-aliases.ts';
import { normalizeText, sameIgnoringWhitespace } from '../normalize/normalizer.ts';
import { emptyToNull, stepXml, type ComparisonContext, type StepAdapter } from '../engine/step-adapter.ts';
import { javaTrim } from '../util/java.ts';
import { textDiff } from './text-diff.ts';

const CLAIMED: ReadonlySet<string> = new Set(['sql', 'connection', 'execute_each_row']);

export class TableInputAdapter implements StepAdapter {
  readonly name = 'TableInputAdapter';

  supports(stepType: string | null): boolean {
    return sameStepType('TableInput', stepType);
  }

  claimedTags(): ReadonlySet<string> {
    return CLAIMED;
  }

  compare(before: StepModel, after: StepModel, ctx: ComparisonContext): Change[] {
    const changes: Change[] = [];
    const bx = stepXml(before);
    const ax = stepXml(after);

    const sqlB = normalizeText(bx.childRawText('sql'));
    const sqlA = normalizeText(ax.childRawText('sql'));
    const tb = sqlB === null ? '' : javaTrim(sqlB);
    const ta = sqlA === null ? '' : javaTrim(sqlA);
    if (tb !== ta) {
      const formattingOnly = sameIgnoringWhitespace(tb, ta);
      const diff = textDiff(tb, ta);
      const cls: Classification = formattingOnly && ctx.config.sqlIgnoreFormatting ? 'metadata' : 'functional';
      changes.push(change('sql_changed', cls, 'step')
        .stepType(ctx.stepType).stepName(ctx.stepName)
        .section('sql')
        .property(formattingOnly ? 'formatting' : 'query')
        // The whole texts let the web app show the query with its changed words (D8).
        .before(tb).after(ta)
        .addedFragments(diff.addedLines)
        .removedFragments(diff.removedLines)
        .rawDiff(diff.unified)
        .sourceXmlPath(ax.path + '/sql')
        .build());
    }

    const cb = emptyToNull(bx.childText('connection'));
    const ca = emptyToNull(ax.childText('connection'));
    if (cb !== ca) {
      changes.push(change('step_property_changed', 'functional', 'step')
        .stepType(ctx.stepType).stepName(ctx.stepName)
        .section('connection').property('connection')
        .before(cb).after(ca)
        .sourceXmlPath(ax.path + '/connection')
        .build());
    }

    const eb = emptyToNull(bx.childText('execute_each_row'));
    const ea = emptyToNull(ax.childText('execute_each_row'));
    if (eb !== ea) {
      changes.push(change('step_property_changed', 'functional', 'step')
        .stepType(ctx.stepType).stepName(ctx.stepName)
        .section('properties').property('execute_each_row')
        .before(eb).after(ea)
        .sourceXmlPath(ax.path + '/execute_each_row')
        .build());
    }
    return changes;
  }
}
