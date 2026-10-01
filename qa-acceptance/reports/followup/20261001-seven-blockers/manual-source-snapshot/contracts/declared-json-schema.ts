import { Ajv, type AnySchema, type ValidateFunction } from 'ajv';
import { Ajv2019 } from 'ajv/dist/2019.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { BlockedError } from '../harness/security.js';

/** Same bundled dialect selection as the independent Agent simulator; no product schema import. */
export function compileDeclaredJsonSchema(schema: AnySchema): ValidateFunction {
  const validators = [
    new Ajv({ strict: false, allErrors: true }),
    new Ajv2019({ strict: false, allErrors: true }),
    new Ajv2020({ strict: false, allErrors: true }),
  ];
  const dialect = typeof schema === 'object' && schema !== null ? schema.$schema : undefined;
  if (dialect !== undefined && typeof dialect !== 'string')
    throw new Error('Invalid JSON Schema: $schema must be a string');
  const validator =
    dialect === undefined ? validators[0] : validators.find((item) => item.getSchema(dialect));
  if (!validator)
    throw new BlockedError(`QA未内置声明的JSON Schema方言：${dialect}；不删$schema或下载远端meta`);
  if (!validator.validateSchema(schema))
    throw new Error(`Invalid JSON Schema: ${validator.errorsText()}`);
  return validator.compile(schema);
}
