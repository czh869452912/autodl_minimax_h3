import React from 'react';
import { act, create } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { NovelAiNumberField } from './NovelAiNumberField';

test('a focused numeric field follows slider changes while retaining intermediate keyboard text', () => {
  const change = jest.fn();
  let tree!: ReturnType<typeof create>;
  const render = (value: number) => <NovelAiNumberField label="Strength" value={value} editable onChange={change} />;
  try {
    act(() => { tree = create(render(0.5)); });
    const field = () => tree.root.findByType(TextInput);
    act(() => field().props.onFocus());
    act(() => field().props.onChangeText('0.'));
    act(() => tree.update(render(0)));
    expect(change).toHaveBeenLastCalledWith(0);
    expect(field().props.value).toBe('0.');
    act(() => tree.update(render(0.67)));
    expect(field().props.value).toBe('0.67');
    act(() => tree.update(render(0)));
    expect(field().props.value).toBe('0');
    act(() => field().props.onChangeText('0.00'));
    expect(field().props.value).toBe('0.00');
    act(() => field().props.onBlur());
    expect(field().props.value).toBe('0');
  } finally { act(() => tree?.unmount()); }
});
