import {useCallback,useRef,useState} from 'react';
import {Linking,Switch,Text,TextInput,View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {creativeAccounts} from './accountRuntime';
import {clearWalletCredential,fetchWalletBalance,saveWalletCredential,walletCredential,type WalletBalance} from './autodlWallet';
import {TextAction} from './WorkbenchUI';
import {COLORS} from '../ui/theme';

export function AutodlWalletPanel({summary=false}:{summary?:boolean}){
  const [generation,setGeneration]=useState<string>(),[configured,setConfigured]=useState(false),[balance,setBalance]=useState<WalletBalance>(),[token,setToken]=useState(''),[confirmed,setConfirmed]=useState(false),[expanded,setExpanded]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const lock=useRef(false),epoch=useRef(0);
  const read=async()=>{
    const request=++epoch.current;setBalance(undefined);setError('');
    try{const account=(await creativeAccounts().list()).find(a=>a.provider_id==='autodl');if(request!==epoch.current)return;
      setGeneration(account?.credential_generation_id);const secret=account?await walletCredential(account.credential_generation_id):undefined;if(request!==epoch.current)return;
      setConfigured(Boolean(secret));if(secret){const result=await fetchWalletBalance(secret);if(request===epoch.current)setBalance(result);}
    }catch{if(request===epoch.current)setError('余额未更新');}
  };
  useFocusEffect(useCallback(()=>{void read();return()=>{epoch.current++;};},[]));
  const save=async()=>{
    if(lock.current||!generation||!confirmed||!token.trim())return;lock.current=true;setBusy(true);setError('');
    try{const result=await fetchWalletBalance(token.trim());
      const account=(await creativeAccounts().list()).find(a=>a.provider_id==='autodl');if(account?.credential_generation_id!==generation)throw new Error('生成账号已变化，请重新进入设置');
      await saveWalletCredential(generation,token.trim());setToken('');setConfigured(true);setBalance(result);setExpanded(false);
    }catch(e){setError(e instanceof Error?e.message:'配置失败');}finally{lock.current=false;setBusy(false);}
  };
  if(summary&&!configured)return null;
  return <View style={{gap:6,paddingVertical:6}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Text style={{flex:1,fontSize:12,color:COLORS.textMuted}}>{balance?`开发者账户余额 ¥${balance.assets.toFixed(2)}`:configured?'余额暂不可用':'余额查询 · 未配置'}</Text><TextAction label={summary?(expanded?'收起余额':'余额详情'):(expanded?'收起余额配置':configured?'管理余额查询':'配置余额查询')} onPress={()=>setExpanded(!expanded)}/></View>
    {expanded?<>
      {balance?<Text style={{fontSize:12,color:COLORS.textMuted}}>代金券 ¥{balance.vouchers.toFixed(2)} · 累计消费 ¥{balance.accumulate.toFixed(2)}{ '\n'}更新于 {new Date(balance.checkedAt).toLocaleTimeString()} · 代金券适用范围以官网为准</Text>:null}
      {configured?<TextAction label="刷新余额" disabled={busy} onPress={()=>void read()}/>:null}
      {!summary?<>
        <Text style={{fontSize:12,lineHeight:18,color:COLORS.textMuted}}>可选：填写 AutoDL 开发者 Token，仅用于查询余额，不替换 ComfyUI 生成令牌。接口不能自动核验两份凭据是否属于同一账号。</Text>
        {!generation?<Text style={{color:COLORS.textMuted}}>请先绑定 AutoDL 生成凭据，再配置余额。</Text>:null}
        <TextInput accessibilityLabel="AutoDL 余额查询开发者 Token" secureTextEntry autoCapitalize="none" autoCorrect={false} value={token} onChangeText={setToken} placeholder="开发者 Token" placeholderTextColor={COLORS.textMuted} style={{padding:12,borderWidth:1,borderColor:COLORS.border,borderRadius:8,color:COLORS.text}}/>
        <View style={{flexDirection:'row',alignItems:'center'}}><Switch accessibilityLabel="确认余额与生成凭据属于同一账号" value={confirmed} onValueChange={setConfirmed}/><Text style={{flex:1,fontSize:12,color:COLORS.text}}>我已确认两份凭据属于同一 AutoDL 账号</Text></View>
        <TextAction label="验证并保存余额查询" disabled={busy||!generation||!confirmed||!token.trim()} onPress={()=>void save()}/>
        <TextAction label="获取开发者 Token" onPress={()=>void Linking.openURL('https://www.autodl.com/console/center/settings/token').catch(()=>setError('无法打开浏览器'))}/>
        {configured?<TextAction label="移除余额查询凭据" disabled={busy} onPress={()=>{void clearWalletCredential().then(()=>{epoch.current++;setConfigured(false);setBalance(undefined);}).catch(()=>setError('移除失败，请重试'));}}/>:null}
      </>:null}
    </>:null}
    {error?<Text accessibilityRole="alert" style={{fontSize:12,color:COLORS.textMuted}}>{error}</Text>:null}
  </View>;
}
