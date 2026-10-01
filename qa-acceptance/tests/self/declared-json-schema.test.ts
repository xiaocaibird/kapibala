import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileDeclaredJsonSchema } from '../../contracts/declared-json-schema.js';

test('declared dialects preserve explicit clamp input and reject invalid integer/type inputs', () => {
  for (const dialect of [
    undefined,
    'http://json-schema.org/draft-07/schema#',
    'https://json-schema.org/draft/2019-09/schema',
    'https://json-schema.org/draft/2020-12/schema',
  ]) {
    const schema = {
      ...(dialect ? { $schema: dialect } : {}),
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1 } },
      required: ['limit'],
      additionalProperties: false,
    };
    const validate = compileDeclaredJsonSchema(schema);
    assert.equal(validate({ limit: 100000 }), true);
    for (const limit of [0, -1, 1.5, '2']) assert.equal(validate({ limit }), false);
    assert.equal(validate({ limit: 2, extra: true }), false);
    assert.equal(validate({}), false);
    assert.equal(schema.$schema, dialect);
  }
});

test('2020-12 keyword semantics are applied rather than stripping the dialect declaration', () => {
  const validate = compileDeclaredJsonSchema({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'array',
    prefixItems: [{ type: 'integer' }],
    items: false,
  });
  assert.equal(validate([1]), true);
  assert.equal(validate(['1']), false);
  assert.equal(validate([1, 2]), false);
});

test('malformed schemas fail; unknown remote dialect is explicitly blocked without fetch', () => {
  assert.throws(
    () =>
      compileDeclaredJsonSchema({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        required: 7,
      }),
    /required/,
  );
  assert.throws(
    () =>
      compileDeclaredJsonSchema({ $schema: 'https://untrusted.invalid/schema', type: 'object' }),
    /\[BLOCKED\]/,
  );
});
