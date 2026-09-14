import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Pressable, SectionList, Text, TextInput, View } from 'react-native';
import { AppIcon } from '../ui/icons';
import { LIGHT_PROMPT_COLORS } from '../ui/theme';
import { groupSessions, matchesSessionQuery, sessionDisplayTitle, sessionMessageCount, sessionTitle } from './agentPresentation';
import { sessionRunLabel } from './assistantWorkspace';
import type { LocalThreadSnapshot } from './threadStore';
import { styles } from './PromptAssistantStyles';

export type HistoryProps = {
  threads: LocalThreadSnapshot[];
  activeThreadId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void | Promise<void>;
  onSearchHistory?: (query: string) => void | Promise<void>;
  onLoadMoreHistory?: () => void | Promise<void>;
};

export function HistoryList({
  threads,
  activeThreadId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onSearchHistory,
  onLoadMoreHistory,
  onRenameVisibilityChange,
}: HistoryProps & { onRenameVisibilityChange: (visible: boolean) => void }) {
  const [query, setQuery] = useState('');
  const [renameTarget, setRenameTarget] = useState<LocalThreadSnapshot | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renaming, setRenaming] = useState(false);
  const renameLock = useRef(false);
  useEffect(() => {
    onRenameVisibilityChange(Boolean(renameTarget));
    return () => onRenameVisibilityChange(false);
  }, [renameTarget, onRenameVisibilityChange]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchRetry, setSearchRetry] = useState(0);
  const [paging, setPaging] = useState(false);
  const pageLock = useRef(false);
  const [pageError, setPageError] = useState(false);
  const pageGeneration = useRef(0);
  useEffect(() => { ++pageGeneration.current; pageLock.current = false; setPaging(false); setPageError(false); return () => { ++pageGeneration.current; }; }, [query, searchRetry]);
  const loadMore = () => {
    if (!onLoadMoreHistory || pageLock.current || searching || searchError) return;
    const generation = pageGeneration.current;
    pageLock.current = true; setPaging(true); setPageError(false);
    void Promise.resolve().then(() => onLoadMoreHistory()).catch(() => { if (generation === pageGeneration.current) setPageError(true); }).finally(() => {
      if (generation === pageGeneration.current) { pageLock.current = false; setPaging(false); }
    });
  };
  const search = useRef(onSearchHistory); search.current = onSearchHistory;
  useEffect(() => { if (!search.current) return; let active = true; setSearching(true); setSearchError(''); const timer = setTimeout(() => { void Promise.resolve().then(() => search.current?.(query)).catch(() => { if (active) setSearchError('搜索失败，点击重试'); }).finally(() => { if (active) setSearching(false); }); }, 250); return () => { active = false; clearTimeout(timer); }; }, [query, searchRetry]);
  const groups = groupSessions(
    onSearchHistory ? threads : threads.filter((thread) => matchesSessionQuery(thread, query)),
    Date.now(),
  );
  const sections = groups.map((group) => ({ title: group.label, data: group.snapshots }));
  return (
    <View style={styles.history}>
      <View style={styles.historySearch}>
        <AppIcon name="search" size={18} color={LIGHT_PROMPT_COLORS.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          accessibilityLabel="搜索对话" placeholder="搜索对话"
          placeholderTextColor={LIGHT_PROMPT_COLORS.placeholder}
          style={styles.searchInput}
        />
        {query ? <Pressable accessibilityRole="button" accessibilityLabel="清除搜索" style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }} onPress={() => setQuery('')}><Text>清除</Text></Pressable> : null}
      </View>
      <Pressable
        accessibilityLabel="历史中新建对话"
        onPress={onNew}
        style={styles.newHistory}
      >
        <AppIcon name="add" size={18} color={LIGHT_PROMPT_COLORS.ink} />
        <Text style={styles.newHistoryText}>新对话</Text>
      </Pressable>
      {searching ? <ActivityIndicator accessibilityLabel="正在搜索对话" /> : searchError ? <Pressable accessibilityRole="button" style={{ minHeight: 48 }} onPress={() => setSearchRetry(value => value + 1)}><Text accessibilityRole="alert">{searchError}</Text></Pressable> : null}
      <SectionList
        keyboardShouldPersistTaps="handled"
        sections={sections}
        ListEmptyComponent={<Text accessibilityLiveRegion="polite" style={styles.historyMeta}>{query ? '没有匹配的对话，试试其他关键词' : '暂无对话，点击新对话开始'}</Text>}
        style={styles.historyList}
        ListFooterComponent={paging ? <ActivityIndicator accessibilityLabel="正在加载更多对话" /> : pageError ? <Pressable accessibilityRole="button" accessibilityLabel="重试读取更多对话" style={{ minHeight: 48 }} onPress={loadMore}><Text accessibilityRole="alert">读取更多对话失败，点击重试</Text></Pressable> : null}
        onEndReached={() => { if (!pageError) loadMore(); }}
        keyExtractor={(thread) => thread.threadId}
        renderSectionHeader={({ section }) => <Text style={styles.groupLabel}>{section.title}</Text>}
        renderItem={({ item: thread }) => (
          <Pressable
            accessibilityRole="button" accessibilityState={{ selected: thread.threadId === activeThreadId }} onPress={() => onSelect(thread.threadId)}
            style={[styles.historyItem, thread.threadId === activeThreadId && styles.historyItemActive]}
          >
            <View style={styles.historyItemMain}>
              <Text numberOfLines={1} style={styles.historyTitle}>{sessionDisplayTitle(thread, threads)}</Text>
              <Text style={styles.historyMeta}>{sessionMessageCount(thread)} 条消息 · {sessionRunLabel(thread.state) || new Date(thread.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`管理会话 ${sessionTitle(thread)}`} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }} onPress={() => Alert.alert('管理会话', sessionTitle(thread), [
              { text: '取消', style: 'cancel' },
              { text: '重命名', onPress: () => { setRenameError(''); setRenameTarget(thread); setRenameValue(sessionTitle(thread)); } },
              { text: '删除', style: 'destructive', onPress: () => Alert.alert('删除会话', '删除后无法恢复本机会话记录；此会话正在运行的请求也会停止。', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => onDelete(thread.threadId) }]) },
            ])}><Text style={styles.more}>•••</Text></Pressable>
          </Pressable>
        )}
      />
      <Modal
        visible={Boolean(renameTarget)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setRenameTarget(null)}
      >
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.renameKeyboardSurface}
        >
          <View style={styles.renameBackdrop}>
            <View style={styles.renameCard} onFocus={event => event.stopPropagation()} onBlur={event => event.stopPropagation()}>
              <Text style={styles.renameTitle}>重命名会话</Text>
              <TextInput
                autoFocus
                value={renameValue}
                onChangeText={setRenameValue}
                style={styles.renameInput}
                placeholder="输入会话名称"
                placeholderTextColor={LIGHT_PROMPT_COLORS.placeholder}
              />
              {renameError ? <Text accessibilityRole="alert" style={{ color: LIGHT_PROMPT_COLORS.danger }}>{renameError}</Text> : null}<View style={styles.renameActions}>
                <Pressable
                  onPress={() => setRenameTarget(null)}
                  style={styles.renameCancel}
                >
                  <Text style={styles.renameCancelText}>取消</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button" disabled={renaming} onPress={async () => {
                    if (renameLock.current) return;
                    if (!renameValue.trim()) { setRenameError('请输入会话名称'); return; }
                    renameLock.current = true; setRenaming(true);
                    try { if (renameTarget) await onRename(renameTarget.threadId, renameValue.trim()); setRenameTarget(null); }
                    catch { setRenameError('重命名失败，请重试'); } finally { renameLock.current = false; setRenaming(false); }
                  }}
                  style={styles.renameConfirm}
                >
                  <Text style={styles.renameConfirmText}>保存</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
