// Isolated emulator QA entry only. Never imported by index.js or release builds.
// Installs synthetic local skills and uses a loopback fixture model, no provider.
import '../src/runtimeCompatibility';
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import '../src/providers/bootstrap';
import {Text} from 'react-native';
import React, {useEffect, useState} from 'react';
import {registerRootComponent} from 'expo';
import {App} from 'expo-router/build/qualified-entry';
import {getDatabase} from '../src/storage/databaseClient';
import {creativeService} from '../src/creative/runtime';
import {saveSettings} from '../src/settings/storage';
import {createSkillStore} from '../src/agent/skills/store';
import {validateSkillPackage} from '../src/agent/skills/package';

async function prepare() {
  const probe = await getDatabase().getAllAsync('SELECT 1 AS probe');
  if (!Array.isArray(probe)) throw Error(`M1 QA async DB returned ${JSON.stringify(probe)}; sync=${JSON.stringify(getDatabase().getAllSync('SELECT 1 AS probe'))}`);
  const empty = await getDatabase().getAllAsync('SELECT * FROM creative_projects WHERE (archived_at IS NOT NULL)=? ORDER BY updated_at DESC,id DESC', 0);
  if (!Array.isArray(empty)) throw Error(`M1 QA empty result ${JSON.stringify(empty)}; sync=${JSON.stringify(getDatabase().getAllSync('SELECT * FROM creative_projects'))}; noparam=${JSON.stringify(await getDatabase().getAllAsync('SELECT * FROM creative_projects'))}`);
  if (!(await creativeService().projects()).some(p => p.title === 'M1 离线交互测试')) {
    await creativeService().execute({name: 'project.create', payload: {title: 'M1 离线交互测试', brief: '仅供本地交互验证，不含真实素材或密钥。'}}, 'm1-fixture-project');
  }
  await saveSettings({llmEndpoint: 'http://10.0.2.2:8877/v1', llmModel: 'offline-fixture', llmApiKey: 'local-fixture-not-a-secret', llmMaxRetries: '0'});
  const skills = createSkillStore(getDatabase());
  for (const [name, description] of [['scene-review', '检查主体、动作与镜头表达'], ['style-check', '核对短片中的风格一致性']]) {
    await skills.install(validateSkillPackage({'SKILL.md': `---\nname: ${name}\ndescription: ${description}\n---\n${description}。仅提供文本建议，不调用工具。`}));
  }
}
function FixtureRoot() {
  const [state, setState] = useState('准备离线测试数据…');
  useEffect(() => { prepare().then(() => setState('ready'), error => {
    console.error('M1 QA bootstrap', error.stack ?? String(error));
    setState(error.stack ?? String(error));
  }); }, []);
  return state === 'ready' ? <App/> : <Text>{state}</Text>;
}
registerRootComponent(FixtureRoot);
