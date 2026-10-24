import { Alert } from 'react-native';
import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';

/** Use the same decision for native back and transitions inside a screen. */
export function useUnsavedChanges(dirty: boolean, busy: boolean) {
  const navigation = useNavigation();
  const confirmLeave = (leave: () => void) => {
    if (busy) { Alert.alert('正在保存', '请等待本次操作完成后再离开。'); return; }
    if (!dirty) { leave(); return; }
    Alert.alert('尚有未保存的修改', '继续编辑并保存，或放弃本次修改。', [
      { text: '继续编辑', style: 'cancel' },
      { text: '放弃修改', style: 'destructive', onPress: leave },
    ]);
  };
  usePreventRemove(dirty || busy, ({ data }) => confirmLeave(() => navigation.dispatch(data.action)));
  return confirmLeave;
}
