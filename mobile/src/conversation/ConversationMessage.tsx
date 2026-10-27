import { memo, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { CopilotMarkdown } from '@copilotkit/react-native/components';
import { COLORS } from '../ui/theme';

const markdown = {
  paragraph: { color: COLORS.text, fontSize: 15, lineHeight: 23, marginTop: 2, marginBottom: 7 },
  h1: { color: COLORS.text }, h2: { color: COLORS.text }, h3: { color: COLORS.text },
  codeBlock: { backgroundColor: COLORS.surfaceRaised, borderRadius: 8, padding: 12, color: COLORS.text },
  code: { backgroundColor: COLORS.surfaceRaised, color: COLORS.text },
};

export const ConversationText = memo(function ConversationText({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return <CopilotMarkdown content={text} streamingAnimation={streaming} style={markdown}/>;
});

export function ConversationMessage({ role, text, streaming, children }: { role: 'user' | 'assistant'; text?: string; streaming?: boolean; children?: ReactNode }) {
  const user = role === 'user';
  return <View style={{alignSelf:user?'flex-end':'stretch',maxWidth:user?'92%':'100%',paddingHorizontal:user?12:0,paddingVertical:8,borderRadius:14,backgroundColor:user?COLORS.primarySoft:'transparent',gap:8}}>
    {text ? user ? <Text selectable style={{fontSize:15,lineHeight:23,color:COLORS.text}}>{text}</Text> : <ConversationText text={text} streaming={streaming}/> : null}
    {children}
  </View>;
}
