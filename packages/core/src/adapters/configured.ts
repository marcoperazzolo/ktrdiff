// it.ktrdiff.core.adapters.ConfiguredStepAdapter — explicit Pentaho serialization schemas.
// Unknown top-level/plugin extensions stay in the generic fallback.

import type { Change, Classification } from '../model/change.ts';
import type { StepModel } from '../model/document.ts';
import { stepXml, type ComparisonContext, type StepAdapter } from '../engine/step-adapter.ts';
import { javaSplit } from '../util/java.ts';
import { compareXmlProperty } from './xml-property-diff.ts';

function schemas(): Map<string, string> {
  // Insertion-ordered like the Java LinkedHashMap: it decides the registry order. Re-putting a
  // key (SortRows) keeps its first position in both Java and JS.
  const m = new Map<string, string>();
  m.set('MergeJoin', 'step1 step2 join_type keys_1 keys_2');
  m.set('MergeRows', 'reference compare flag_field keys values');
  m.set('SortRows', 'fields sort_size free_memory compress compress_variable unique_rows directory prefix');
  m.set('GroupBy', 'group fields all_rows ignore_aggregate field_ignore add_linenr linenr_fieldname give_back_row directory prefix');
  m.set('MemoryGroupBy', 'group fields ignore_aggregate field_ignore');
  m.set('AnalyticQuery', 'group fields');
  m.set('TableOutput', 'connection schema table commit truncate ignore_errors use_batch specify_fields fields partitioning_enabled partitioning_field partitioning_daily partitioning_monthly tablename_in_field tablename_field tablename_in_table return_keys return_field');
  for (const t of ['Update', 'InsertUpdate', 'Delete']) m.set(t, 'connection commit lookup skip_lookup error_ignored ignore_flag_field use_batch update_bypassed');
  m.set('RowGenerator', 'fields limit never_ending interval_in_ms row_time_field last_time_field');
  m.set('DataGrid', 'fields data');
  m.set('Constant', 'fields');
  m.set('GetVariable', 'fields'); m.set('SetVariable', 'fields use_formatting');
  m.set('SortRows', 'fields sort_size free_memory compress compress_variable unique_rows directory prefix');
  m.set('Unique', 'fields count_rows count_field reject_duplicate_row error_description');
  m.set('Denormaliser', 'fields group key_field');
  m.set('ReplaceString', 'fields'); m.set('StringOperations', 'fields');
  m.set('IfNull', 'fields valuetypes replaceAllByValue replaceAllMask selectFields selectValuesType setEmptyStringAll');
  m.set('SwitchCase', 'fieldname cases default_target_step use_contains case_value_type case_value_format case_value_decimal case_value_group');
  m.set('Sequence', 'connection schema seqname valuename use_database use_counter counter_name start_at increment_by max_value');
  m.set('ExecSQL', 'connection sql execute_each_row single_statement replace_variables quoteString set_params arguments insert_field update_field delete_field read_field');
  m.set('Rest', 'url urlField urlInField method methodFieldName dynamicMethod applicationType bodyField headers parameters matrixParameters result httpLogin httpPassword preemptive proxyHost proxyPort trustStoreFile trustStorePassword');
  m.set('JsonInput', 'fields file limit include include_field rownum rownum_field IsAFile IsInFields IsIgnoreEmptyFile readurl removeSourceField valueField ignoreMissingPath defaultPathLeafToNull includeNulls doNotFailIfNoFile addresultfile shortFileFieldName extensionFieldName pathFieldName sizeFieldName hiddenFieldName lastModificationTimeFieldName uriNameFieldName rootUriNameFieldName');
  m.set('CsvInput', 'fields filename filename_field rownum_field include_filename separator enclosure header encoding format lazy_conversion buffer_size parallel newline_possible add_filename_result');
  m.set('TextFileOutput', 'fields file fileNameInField fileNameField separator enclosure enclosure_forced enclosure_fix_disabled header footer format compression encoding endedLine create_parent_folder fast_dump');
  m.set('WriteToLog', 'fields loglevel logmessage displayHeader limitRows limitRowsNumber');
  m.set('BlockUntilStepsFinish', 'steps'); m.set('SplitFieldToRows3', 'splitfield delimiter delimiter_is_regex newfield rownum rownum_field resetrownumber');
  m.set('RowsFromResult', 'fields'); m.set('SystemInfo', 'fields');
  m.set('TRANS', 'filename transname directory specification_method trans_object_id parameters arguments arg_from_previous params_from_previous exec_per_row clear_rows clear_files wait_until_finished parallel nr run_configuration cluster slave_server_name suppress_result_data logfile logext loglevel set_logfile set_append_logfile add_date add_time create_parent_folder logging_remote_work follow_abort_remote');
  m.set('JOB', 'filename jobname directory specification_method job_object_id parameters arguments arg_from_previous params_from_previous exec_per_row clear_rows clear_files wait_until_finished parallel nr run_configuration logfile logext loglevel set_logfile');
  m.set('SQL', 'connection sql sqlfilename sqlfromfile sendOneStatement useVariableSubstitution parallel nr');
  m.set('SPECIAL', 'start dummy repeat schedulerType intervalSeconds intervalMinutes hour minutes weekDay DayOfMonth parallel nr');
  m.set('SUCCESS', 'parallel nr'); m.set('DELAY', 'timeout maximumTimeout scaletime parallel nr');
  m.set('ABORT', 'message abort_option always_log_rows row_threshold parallel nr');
  return m;
}

const SCHEMAS: ReadonlyMap<string, string> = schemas();

const CONFIGURATION_TAGS: ReadonlySet<string> = new Set([
  'sort_size', 'free_memory', 'directory', 'prefix', 'compress', 'buffer_size', 'loglevel', 'logfile',
  'run_configuration', 'nr',
]);

export class ConfiguredStepAdapter implements StepAdapter {
  readonly name = 'ConfiguredStepAdapter';
  private readonly type: string;

  constructor(type: string) {
    this.type = type;
  }

  static all(): StepAdapter[] {
    return [...SCHEMAS.keys()].map((type) => new ConfiguredStepAdapter(type));
  }

  supports(stepType: string | null): boolean {
    return this.type === stepType;
  }

  claimedTags(): ReadonlySet<string> {
    return new Set(javaSplit(SCHEMAS.get(this.type)!, ' '));
  }

  compare(before: StepModel, after: StepModel, ctx: ComparisonContext): Change[] {
    const changes: Change[] = [];
    for (const tag of this.claimedTags()) {
      const b = stepXml(before).childrenNamed(tag);
      const a = stepXml(after).childrenNamed(tag);
      const cls: Classification = CONFIGURATION_TAGS.has(tag) ? 'configuration' : 'functional';
      for (let i = 0; i < Math.max(b.length, a.length); i++) {
        compareXmlProperty(i < b.length ? b[i]! : null, i < a.length ? a[i]! : null, tag, tag, cls, ctx, changes);
      }
    }
    return changes;
  }
}
