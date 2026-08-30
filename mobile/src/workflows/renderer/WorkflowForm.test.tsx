import { create, act } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { WorkflowForm } from './WorkflowForm';
import type { WorkflowDefinition } from '../schema/types';

const definition = { schemaVersion: '1.0', id: 'demo', version: '1.0.0', kind: 'atomic', platform: { adapter: 'demo', operation: 'workflow.submit' }, metadata: { title: 'Demo', category: 'video' }, inputs: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string', 'x-workflow.semantic': 'prompt', 'x-workflow.widget': 'textarea' }, mode: { type: 'string', enum: ['image', 'video'], 'x-workflow.semantic': 'enum', 'x-workflow.widget': 'segmented' } } }, ui: { sections: [{ id: 'main', title: 'Main', fields: ['prompt', 'mode'] }] }, request: { operation: 'workflow.submit', bindings: {} }, outputs: { artifacts: [] } } as WorkflowDefinition;

test('renders schema fields in declared order and emits controlled changes', () => {
  const changes: Record<string, unknown>[] = [];
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<WorkflowForm definition={definition} value={{ prompt: '', mode: 'image' }} errors={[]} onChange={(value) => changes.push(value)} />); });
  const inputs = tree.root.findAllByType(TextInput);
  expect(inputs).toHaveLength(1);
  act(() => { inputs[0].props.onChangeText('hello'); });
  expect(changes[0]).toMatchObject({ prompt: 'hello', mode: 'image' });
});
