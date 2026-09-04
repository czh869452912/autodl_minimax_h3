import h3V100 from '../definitions/autodl/minimax-h3-i2v-15s.json';
import h3V101 from '../definitions/autodl/minimax-h3-i2v-15s-v1.0.1.json';
import { legacyDefinitionToPackage } from '../schema/package';
import type { WorkflowDefinition } from '../schema/types';
import {
  LEGACY_DEFINITION_IDENTITY_V1,
  WORKFLOW_PACKAGE_IDENTITY_V1,
  computeWorkflowDigest,
  detectWorkflowRepresentation,
} from './identity';

test('keeps released H3 identity protocols stable', () => {
  expect(computeWorkflowDigest(h3V100, LEGACY_DEFINITION_IDENTITY_V1)).toBe(
    '917cce0dca1a7a3cc178d46baee6c5dd16c2a586283bee2b7d426bda71705390',
  );
  expect(computeWorkflowDigest(
    legacyDefinitionToPackage(h3V100 as WorkflowDefinition),
    WORKFLOW_PACKAGE_IDENTITY_V1,
  )).toBe('b3d2ac04b13f581527a580d49abea9d9cc079ee8c8a6681232cd2cdbfda8ce81');
  expect(computeWorkflowDigest(
    legacyDefinitionToPackage(h3V101 as WorkflowDefinition),
    WORKFLOW_PACKAGE_IDENTITY_V1,
  )).toBe('fe166625b82f953d23eac160ed509f468b2383b7d7c8be6383abca9096381897');
});

test('detects only validated legacy definition and package envelopes', () => {
  expect(detectWorkflowRepresentation(h3V100)).toEqual({
    format: 'legacy-workflow-definition@1',
    scheme: LEGACY_DEFINITION_IDENTITY_V1,
  });
  expect(detectWorkflowRepresentation(legacyDefinitionToPackage(h3V100 as WorkflowDefinition))).toEqual({
    format: 'workflow-package@1',
    scheme: WORKFLOW_PACKAGE_IDENTITY_V1,
  });
  expect(() => detectWorkflowRepresentation({ id: 'partial' })).toThrow('REGISTRY_IDENTITY_FORMAT_UNKNOWN');
});
