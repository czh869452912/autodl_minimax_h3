import React from 'react';
import { act, create } from 'react-test-renderer';
import { VersionComparison } from './VersionComparison';
import type { AssetVersion } from './types';

const versions: AssetVersion[] = [1, 2].map(n => Object.freeze({ id: `v${n}`, assetId: 'asset', versionNo: n, source: 'generated' as const, state: 'AVAILABLE' as const, relativePath: `${n}.png`, mime: 'image/png', recipe: Object.freeze({ input: Object.freeze({ prompt: `Scene ${n}`, seed: n }) }) }));
const press = (tree: ReturnType<typeof create>, label: string) => tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0].props.onPress();

test('A/B switches the compared image in place while raw snapshots stay behind technical details', async () => {
  const original = JSON.stringify(versions);
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<VersionComparison versions={versions} />); });
    act(() => press(tree, '比较版本 1'));
    act(() => press(tree, '比较版本 2'));
    expect(tree.root.findAllByProps({ accessibilityLabel: '比较画面：版本 1' }).length).toBeGreaterThan(0);
    expect(JSON.stringify(tree.toJSON())).toContain('画面描述、随机种子');
    expect(JSON.stringify(tree.toJSON())).not.toContain('Scene 1');
    act(() => press(tree, 'B · 版本 2'));
    expect(tree.root.findAllByProps({ accessibilityLabel: '比较画面：版本 2' }).length).toBeGreaterThan(0);
    expect(JSON.stringify(versions)).toBe(original);
  } finally { act(() => tree?.unmount()); }
});
