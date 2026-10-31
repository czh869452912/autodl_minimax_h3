import {Alert} from 'react-native';
import type {AppDatabase} from '../storage/appDatabase';
import {grantOutboundConsent,type OutboundScope} from './outboundConsent';
import {getDatabase} from '../storage/databaseClient';
export async function confirmOutboundScopes(db:AppDatabase,scopes:OutboundScope[]){
 const accepted=await new Promise<boolean>(resolve=>Alert.alert('允许本次素材与提示词外发',scopes.map(scope=>`${scope.provider} · ${scope.versions.length} 个素材版本\n${scope.versions.join('\n')}`).join('\n\n')+'\n将向以上生成服务发送当前已准备的提示词和所列素材。许可绑定本次请求与账号，15 分钟有效；此许可本身不授予消费额度，可在项目外发许可中撤销。',[{text:'取消',style:'cancel',onPress:()=>resolve(false)},{text:'允许这些请求外发',onPress:()=>resolve(true)}],{cancelable:true,onDismiss:()=>resolve(false)}));
 if(!accepted)throw Error('已取消素材外发');if(db!==getDatabase())throw Error('数据库已切换，请重新核对');
 for(const scope of scopes)await grantOutboundConsent(db,scope);
}
