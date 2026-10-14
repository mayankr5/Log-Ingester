const test = require('node:test');
const assert = require('node:assert');
const { compile } = require('../src/query/compile');

test('field match', () => {
    assert.deepStrictEqual(compile('level:error'), { level: 'error' });
});

test('implicit and explicit AND', () => {
    const expected = { $and: [{ level: 'error' }, { resourceId: 'server-1' }] };
    assert.deepStrictEqual(compile('level:error resourceId:server-1'), expected);
    assert.deepStrictEqual(compile('level:error AND resourceId:server-1'), expected);
});

test('OR with parentheses and precedence', () => {
    assert.deepStrictEqual(compile('(level:error OR level:warn) AND commit:abc'), {
        $and: [{ $or: [{ level: 'error' }, { level: 'warn' }] }, { commit: 'abc' }],
    });
    // AND binds tighter than OR
    assert.deepStrictEqual(compile('level:error OR level:warn commit:abc'), {
        $or: [{ level: 'error' }, { $and: [{ level: 'warn' }, { commit: 'abc' }] }],
    });
});

test('NOT', () => {
    assert.deepStrictEqual(compile('NOT level:info'), { $nor: [{ level: 'info' }] });
});

test('quoted values and nested field', () => {
    assert.deepStrictEqual(compile('resourceId:"server 1"'), { resourceId: 'server 1' });
    assert.deepStrictEqual(compile('metadata.parentResourceId:abc'), { 'metadata.parentResourceId': 'abc' });
});

test('trailing wildcard becomes escaped anchored regex', () => {
    assert.deepStrictEqual(compile('traceId:abc.1*'), { traceId: { $regex: '^abc\\.1' } });
    assert.throws(() => compile('traceId:a*c'), /trailing wildcards/);
    assert.throws(() => compile('traceId:*'), /trailing wildcards/);
});

test('timestamp comparison and range, with colons in values', () => {
    assert.deepStrictEqual(compile('timestamp:>=2023-09-15T08:00:00Z'), {
        timestamp: { $gte: new Date('2023-09-15T08:00:00Z') },
    });
    assert.deepStrictEqual(compile('timestamp:[2023-09-15 TO 2023-09-16]'), {
        timestamp: { $gte: new Date('2023-09-15'), $lte: new Date('2023-09-16') },
    });
    assert.deepStrictEqual(compile('timestamp:[2023-09-15T08:00:00Z TO 2023-09-15T09:30:00Z]'), {
        timestamp: { $gte: new Date('2023-09-15T08:00:00Z'), $lte: new Date('2023-09-15T09:30:00Z') },
    });
    assert.throws(() => compile('timestamp:>=not-a-date'), /Invalid date/);
    assert.throws(() => compile('level:>=error'), /only supported on timestamp/);
});

test('free text uses $text and must be top-level AND', () => {
    assert.deepStrictEqual(compile('"connection refused" level:error'), {
        $and: [{ level: 'error' }, { $text: { $search: '"connection refused"' } }],
    });
    assert.deepStrictEqual(compile('timeout'), { $text: { $search: 'timeout' } });
    assert.throws(() => compile('timeout OR level:error'), /Free-text/);
});

test('rejects unknown fields and operator injection', () => {
    assert.throws(() => compile('hello:world'), /Unknown field/);
    assert.throws(() => compile('$where:sleep'), /Unknown field/);
    assert.throws(() => compile('__proto__:x'), /Unknown field/);
});

test('syntax errors', () => {
    assert.throws(() => compile('(level:error'), /Expected '\)'/);
    assert.throws(() => compile('level:error)'), /Unexpected/);
    assert.throws(() => compile('level:'), /Expected 'VALUE'/);
    assert.throws(() => compile('"unterminated'), /Unterminated/);
    assert.throws(() => compile('('.repeat(30) + 'level:error' + ')'.repeat(30)), /nested too deeply/);
});

test('empty query matches everything', () => {
    assert.deepStrictEqual(compile(''), {});
    assert.deepStrictEqual(compile(undefined), {});
});
