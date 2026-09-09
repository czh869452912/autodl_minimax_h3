import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Pressable, SectionList, Text, TextInput, View } from 'react-native';
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
  onRename: (id: string, title: string) => void;
  onSearchHistory?: (query: string) => void;
  onLoadMoreHistory?: () => void;
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
  useEffect(() => {
    onRenameVisibilityChange(Boolean(renameTarget));
    return () => onRenameVisibilityChange(false);
  }, [renameTarget, onRenameVisibilityChange]);
  const search = useRef(onSearchHistory); search.current = onSearchHistory;
  useEffect(() => { if (!search.current) return; const timer = setTimeout(() => search.current?.(query), 250); return () => clearTimeout(timer); }, [query]);
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
          placeholder="搜索对话"
          placeholderTextColor={LIGHT_PROMPT_COLORS.placeholder}
          style={styles.searchInput}
        />
      </View>
      <Pressable
        accessibilityLabel="历史中新建对话"
        onPress={onNew}
        style={styles.newHistory}
      >
        <AppIcon name="add" size={18} color={LIGHT_PROMPT_COLORS.ink} />
        <Text style={styles.newHistoryText}>新对话</Text>
      </Pressable>
      <SectionList
        sections={sections}
        style={styles.historyList}
        onEndReached={onLoadMoreHistory}
        keyExtractor={(thread) => thread.threadId}
        renderSectionHeader={({ section }) => <Text style={styles.groupLabel}>{section.title}</Text>}
        renderItem={({ item: thread }) => (
          <Pressable
            onPress={() => onSelect(thread.threadId)}
            style={[styles.historyItem, thread.threadId === activeThreadId && styles.historyItemActive]}
          >
            <View style={styles.historyItemMain}>
              <Text numberOfLines={1} style={styles.historyTitle}>{sessionDisplayTitle(thread, threads)}</Text>
              <Text style={styles.historyMeta}>{sessionMessageCount(thread)} 条消息 · {sessionRunLabel(thread.state) || new Date(thread.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
            <Pressable accessibilityLabel={`管理会话 ${thread.threadId}`} onPress={() => { setRenameTarget(thread); setRenameValue(sessionTitle(thread)); }}>
              <Text style={styles.more}>•••</Text>
            </Pressable>
            <Pressable accessibilityLabel={`删除会话 ${thread.threadId}`} onPress={() => Alert.alert('删除会话', '删除后无法恢复本机会话记录。', [{ text: '取消' }, { text: '删除', style: 'destructive', onPress: () => onDelete(thread.threadId) }])}>
              <AppIcon name="delete" size={17} color={LIGHT_PROMPT_COLORS.muted} />
            </Pressable>
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
              <View style={styles.renameActions}>
                <Pressable
                  onPress={() => setRenameTarget(null)}
                  style={styles.renameCancel}
                >
                  <Text style={styles.renameCancelText}>取消</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (renameTarget && renameValue.trim())
                      onRename(renameTarget.threadId, renameValue.trim());
                    setRenameTarget(null);
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
