import { ConversationDisclosure } from './disclosure';
import type { Ref } from 'react';
import { FlatList, type FlatListProps } from 'react-native';

/** Keep keyboard and virtualization behavior identical in both workbenches. */
export function ConversationList<T>({ listRef, ...props }: FlatListProps<T> & { listRef?: Ref<FlatList<T>> }) {
  return <ConversationDisclosure><FlatList<T> ref={listRef} keyboardShouldPersistTaps="handled" keyboardDismissMode="none"
    maintainVisibleContentPosition={{minIndexForVisible:0}} initialNumToRender={16} maxToRenderPerBatch={10}
    windowSize={9} removeClippedSubviews={false} {...props}/></ConversationDisclosure>;
}
