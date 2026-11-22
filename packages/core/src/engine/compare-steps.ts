// DiffEngine.compareSteps: removed/added steps, renames, and per-pair semantic comparison
// (specific adapter, then the generic adapter on unclaimed tags, then the XML fallback).

import { change, type Change } from '../model/change.ts';
import type { PentahoVersion } from '../model/pentaho-version.ts';
import type { MatchResult } from '../match/step-matcher.ts';
import { sameStepType } from '../match/step-type-aliases.ts';
import type { DiffConfig } from '../profile/diff-config.ts';
import type { AdapterRegistry } from './adapter-registry.ts';
import { ComparisonContext, stepXml } from './step-adapter.ts';
import { XmlFallback } from './xml-fallback.ts';

const NO_TAGS: ReadonlySet<string> = new Set();
const IDENTITY_TAGS: ReadonlySet<string> = new Set(['name', 'type']);

export function compareSteps(registry: AdapterRegistry, match: MatchResult, config: DiffConfig,
  version: PentahoVersion | null, changes: Change[]): void {
  for (const s of match.removedSteps) {
    changes.push(change('step_removed', 'functional', 'step')
      .stepType(s.type).stepName(s.name).beforeName(s.name)
      .section('steps')
      .sourceXmlPath(stepXml(s).path)
      .build());
  }
  for (const s of match.addedSteps) {
    changes.push(change('step_added', 'functional', 'step')
      .stepType(s.type).stepName(s.name).afterName(s.name)
      .section('steps')
      .sourceXmlPath(stepXml(s).path)
      .build());
  }
  for (const pair of match.pairs) {
    const firstChange = changes.length;
    const b = pair.before;
    const a = pair.after;
    if (pair.isRename()) {
      changes.push(change('step_renamed', 'functional', 'step')
        .stepType(a.type)
        .beforeName(b.name).afterName(a.name)
        .section('identity').property('name')
        .before(b.name).after(a.name)
        .confidence(pair.score)
        .sourceXmlPath(stepXml(a).path + '/name')
        .build());
    }
    const ctx = new ComparisonContext(config, a.name, a.type, version);
    if (!sameStepType(b.type, a.type)) {
      // Same name, different plugin: a critical replacement. The internal configurations of two
      // different plugins are not comparable field by field, so only identity and layout are
      // reported for the pair.
      changes.push(change('step_property_changed', 'functional', 'step')
        .stepType(a.type).stepName(a.name)
        .section('identity').property('type')
        .before(b.type).after(a.type)
        .sourceXmlPath(stepXml(a).path + '/type')
        .build());
      const everything = new Set<string>();
      for (const c of stepXml(b).children) everything.add(c.name);
      for (const c of stepXml(a).children) everything.add(c.name);
      changes.push(...registry.generic.compareUnclaimed(b, a, ctx, everything));
      continue;
    }
    const specific = registry.findAdapter(a.type, version);
    const claimed = specific === null ? NO_TAGS : specific.claimedTags();
    if (specific !== null) changes.push(...specific.compare(b, a, ctx));
    changes.push(...registry.generic.compareUnclaimed(b, a, ctx, claimed));
    new XmlFallback(changes.slice(firstChange), changes, a.name, a.type)
      .compare(stepXml(b), stepXml(a), IDENTITY_TAGS);
  }
}
