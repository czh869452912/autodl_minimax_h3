import { builtinWorkflowDefinitions } from './builtin';
import { legacyDefinitionToPackage, parseWorkflowPackage } from '../schema/package';

test('ships H3 as a package-compatible builtin without UI-owned workflow ids', () => {
  const pkg = parseWorkflowPackage(legacyDefinitionToPackage(builtinWorkflowDefinitions[0]));
  expect(pkg.metadata.id).toBe('autodl.minimax-h3.i2v-15s');
  expect(pkg.spec.adapter.id).toBe('autodl-comfyui');
});
