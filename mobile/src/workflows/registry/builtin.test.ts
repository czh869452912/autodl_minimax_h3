import { builtinWorkflowDefinitions } from './builtin';
import { legacyDefinitionToPackage, parseWorkflowPackage } from '../schema/package';

test('ships immutable H3 builtin versions and activates schema-owned input constraints', () => {
  expect(builtinWorkflowDefinitions.map((definition) => definition.version)).toEqual(['1.0.0', '1.0.1']);

  const pkg = parseWorkflowPackage(legacyDefinitionToPackage(builtinWorkflowDefinitions[1]));
  expect(pkg.metadata.id).toBe('autodl.minimax-h3.i2v-15s');
  expect(pkg.spec.adapter.id).toBe('autodl-comfyui');
  const properties = pkg.spec.inputSchema.properties as Record<string, Record<string, unknown>>;
  expect(properties.prompt).toMatchObject({ minLength: 1, maxLength: 10000 });
  expect(properties.seed).toMatchObject({ type: 'integer', minimum: 1, maximum: 999999999999999 });
});
