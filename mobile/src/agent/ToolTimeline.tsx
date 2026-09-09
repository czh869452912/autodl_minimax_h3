import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { toolTimelineSummary, type ToolTimelineStep } from './agentPresentation';
import { styles } from './PromptAssistantStyles';

export function ToolTimeline({ steps }: { steps: ToolTimelineStep[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.toolTimeline}>
      <Pressable
        accessibilityLabel={expanded ? '收起处理过程' : '展开处理过程'}
        onPress={() => setExpanded((value) => !value)}
        style={styles.toolSummary}
      >
        <Text style={styles.toolChevron}>{expanded ? '⌄' : '›'}</Text>
        <Text style={styles.toolSummaryText}>{toolTimelineSummary(steps)}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.toolSteps}>
          {steps.map((step, index) => (
            <View key={step.id} style={styles.toolStep}>
              <View
                style={[
                  styles.stepDot,
                  step.status === 'failed' && styles.stepDotFailed,
                ]}
              />
              <Text style={styles.stepName}>
                {index + 1}. {step.name}
              </Text>
              <Text style={styles.stepStatus}>
                {step.status === 'running'
                  ? '进行中'
                  : step.status === 'failed'
                    ? '失败'
                    : '完成'}
              </Text>
              {step.summary ? (
                <Text style={styles.stepSummary}>{step.summary}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
