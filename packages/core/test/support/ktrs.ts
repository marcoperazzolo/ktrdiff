// it.ktrdiff.core.TestKtrs — synthetic minimal KTR documents for unit tests (not fixtures:
// those live in fixtures/). Strings are byte-for-byte the Java ones so ported tests stay literal.

export function transformation(name: string, body: string): string {
  return '<transformation>\n'
    + '  <info>\n'
    + '    <name>' + name + '</name>\n'
    + '    <description/>\n'
    + '  </info>\n'
    + '  <notepads>\n</notepads>\n'
    + body
    + '</transformation>\n';
}

export function step(name: string, type: string, x: number, y: number, extra: string): string {
  return '  <step>\n'
    + '    <name>' + name + '</name>\n'
    + '    <type>' + type + '</type>\n'
    + '    <description/>\n'
    + '    <distribute>Y</distribute>\n'
    + '    <copies>1</copies>\n'
    + extra
    + '    <GUI><xloc>' + x + '</xloc><yloc>' + y + '</yloc><draw>Y</draw></GUI>\n'
    + '  </step>\n';
}

export function hop(from: string, to: string): string {
  return '    <hop><from>' + from + '</from><to>' + to + '</to><enabled>Y</enabled></hop>\n';
}

export function order(...hops: string[]): string {
  return '  <order>\n' + hops.join('') + '  </order>\n';
}

export function notepad(text: string, x: number, y: number): string {
  return '    <notepad><note>' + text + '</note><xloc>' + x + '</xloc><yloc>' + y
    + '</yloc><width>100</width><heigth>30</heigth></notepad>\n';
}

export function notepads(...pads: string[]): string {
  return '  <notepads>\n' + pads.join('') + '  </notepads>\n';
}

/** A transformation with an explicit notepads block replacing the default empty one. */
export function transformationWithNotes(name: string, notepadsBlock: string, body: string): string {
  return '<transformation>\n'
    + '  <info>\n'
    + '    <name>' + name + '</name>\n'
    + '  </info>\n'
    + notepadsBlock
    + body
    + '</transformation>\n';
}

export function dummyStep(name: string, x: number, y: number): string {
  return step(name, 'Dummy', x, y, '');
}

export function rowGenStep(name: string, fieldName: string, type: string, length: string, x: number, y: number): string {
  return step(name, 'RowGenerator', x, y,
    '    <fields>\n'
    + '      <field>\n'
    + '        <name>' + fieldName + '</name>\n'
    + '        <type>' + type + '</type>\n'
    + '        <length>' + length + '</length>\n'
    + '        <nullif>X-1</nullif>\n'
    + '      </field>\n'
    + '    </fields>\n'
    + '    <limit>3</limit>\n');
}

export function selectValuesStep(name: string, metaType: string, metaLength: string, x: number, y: number): string {
  return step(name, 'SelectValues', x, y,
    '    <fields>\n'
    + '      <field><name>CUSTOMER_CODE</name><rename/></field>\n'
    + '      <select_unspecified>N</select_unspecified>\n'
    + '      <meta>\n'
    + '        <name>CUSTOMER_CODE</name>\n'
    + '        <rename>CUSTOMER_CODE</rename>\n'
    + '        <type>' + metaType + '</type>\n'
    + '        <length>' + metaLength + '</length>\n'
    + '        <precision>-2</precision>\n'
    + '        <conversion_mask/>\n'
    + '        <encoding/>\n'
    + '      </meta>\n'
    + '    </fields>\n');
}

export function tableInputStep(name: string, sql: string, connection: string, x: number, y: number): string {
  return step(name, 'TableInput', x, y,
    '    <connection>' + connection + '</connection>\n'
    + '    <sql>' + sql + '</sql>\n'
    + '    <execute_each_row>N</execute_each_row>\n'
    + '    <limit>0</limit>\n');
}

export function scriptStep(name: string, script: string, x: number, y: number): string {
  return step(name, 'ScriptValueMod', x, y,
    '    <compatible>N</compatible>\n'
    + '    <jsScripts>\n'
    + '      <jsScript>\n'
    + '        <jsScript_type>0</jsScript_type>\n'
    + '        <jsScript_name>Script 1</jsScript_name>\n'
    + '        <jsScript_script>' + script + '</jsScript_script>\n'
    + '      </jsScript>\n'
    + '    </jsScripts>\n'
    + '    <fields>\n'
    + '      <field><name>OUT</name><rename>OUT</rename><type>String</type>'
    + '<length>20</length><precision>-1</precision><replace>N</replace></field>\n'
    + '    </fields>\n');
}

export function filterRowsStep(name: string, field: string, fn: string, valueType: string,
  valueText: string, x: number, y: number): string {
  return step(name, 'FilterRows', x, y,
    '    <send_true_to>OK</send_true_to>\n'
    + '    <send_false_to>KO</send_false_to>\n'
    + '    <compare>\n'
    + '      <condition>\n'
    + '        <negated>N</negated>\n'
    + '        <leftvalue>' + field + '</leftvalue>\n'
    + '        <function>' + fn + '</function>\n'
    + '        <rightvalue/>\n'
    + '        <value>\n'
    + '          <name>constant</name>\n'
    + '          <type>' + valueType + '</type>\n'
    + '          <text>' + valueText + '</text>\n'
    + '          <isnull>N</isnull>\n'
    + '          <mask/>\n'
    + '        </value>\n'
    + '      </condition>\n'
    + '    </compare>\n');
}

export function connection(name: string, host: string, password: string): string {
  return '  <connection>\n'
    + '    <name>' + name + '</name>\n'
    + '    <server>' + host + '</server>\n'
    + '    <type>MARIADB</type>\n'
    + '    <access>Native</access>\n'
    + '    <database>demo</database>\n'
    + '    <port>3306</port>\n'
    + '    <username>demo_user</username>\n'
    + '    <password>' + password + '</password>\n'
    + '  </connection>\n';
}
