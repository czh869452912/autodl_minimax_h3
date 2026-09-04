import { create, act } from 'react-test-renderer';
import { StyleSheet, Text, TextInput } from 'react-native';
import { WorkflowForm } from './WorkflowForm';
import type { WorkflowDefinition } from '../schema/types';
import { COLORS } from '../../ui/theme';

const definition = { schemaVersion: '1.0', id: 'demo', version: '1.0.0', kind: 'atomic', platform: { adapter: 'demo', operation: 'workflow.submit' }, metadata: { title: 'Demo', category: 'video' }, inputs: { type: 'object', required: ['prompt'], properties: { prompt: { type: 'string', title: 'Prompt', maxLength: 10000, 'x-workflow.semantic': 'prompt', 'x-workflow.widget': 'textarea' }, mode: { type: 'string', enum: ['image', 'video'], 'x-workflow.semantic': 'enum', 'x-workflow.widget': 'segmented' } } }, ui: { sections: [{ id: 'main', title: 'Main', fields: ['prompt', 'mode'] }] }, request: { operation: 'workflow.submit', bindings: {} }, outputs: { artifacts: [] } } as WorkflowDefinition;

test('renders schema fields in declared order and emits controlled changes', () => {
  const changes: Record<string, unknown>[] = [];
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<WorkflowForm definition={definition} value={{ prompt: '', mode: 'image' }} errors={[]} onChange={(value) => changes.push(value)} />); });
  const inputs = tree.root.findAllByType(TextInput);
  expect(inputs).toHaveLength(1);
  act(() => { inputs[0].props.onChangeText('hello'); });
  expect(changes[0]).toMatchObject({ prompt: 'hello', mode: 'image' });
});

test('keeps schema-driven controls readable on the dark generation page', () => {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      <WorkflowForm
        definition={definition}
        value={{ prompt: '', mode: 'image' }}
        errors={[]}
        onChange={() => undefined}
      />,
    );
  });

  const title = tree.root.findAllByType(Text).find((node) => node.props.children === 'Main');
  expect(title).toBeDefined();
  expect(StyleSheet.flatten(title?.props.style)).toMatchObject({ color: COLORS.text });

  const inputStyle = StyleSheet.flatten(tree.root.findByType(TextInput).props.style);
  expect(inputStyle).toMatchObject({ color: COLORS.text, backgroundColor: COLORS.surface });

  const option = tree.root.findAll((node) => node.props.accessibilityRole === 'radio')[0];
  const optionStyle = StyleSheet.flatten(option.props.style);
  expect(optionStyle).toMatchObject({ borderWidth: 1 });
  expect([COLORS.surfaceRaised, COLORS.primarySoft]).toContain(optionStyle.backgroundColor);
});

test('shows the schema limit and field error without truncating the prompt', () => {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      <WorkflowForm
        definition={definition}
        value={{ prompt: 'a'.repeat(10_001), mode: 'image' }}
        errors={[{ path: 'prompt', message: 'Prompt（视频描述）最多 10,000 个字符，当前 10,001 个。' }]}
        onChange={() => undefined}
      />,
    );
  });

  const counter = tree.root.findAllByType(Text).find((node) => node.props.children === '10,001 / 10,000 字符');
  expect(counter).toBeDefined();
  expect(StyleSheet.flatten(counter?.props.style)).toMatchObject({ color: COLORS.danger });
  expect(tree.root.findByType(TextInput).props.maxLength).toBeUndefined();
  expect(tree.root.findAllByType(Text).some((node) => node.props.children === 'Prompt（视频描述）最多 10,000 个字符，当前 10,001 个。')).toBe(true);
});
