import { View } from 'react-native';
import { ListAction } from '../ui/ListPageUI';
import { TextAction } from './WorkbenchUI';
import { creativeUI as s } from './creativeUI';

export function ResultActionBar({primaryLabel,onPrimary,onEdit,onProcess,disabled}:{primaryLabel:string;onPrimary:()=>void;onEdit?:()=>void;onProcess?:()=>void;disabled:boolean}) {
  return <View style={s.footer}>
    {onEdit || onProcess?<View style={s.row}>
      {onEdit?<TextAction label="调整画面" icon="edit" disabled={disabled} onPress={onEdit} />:null}
      {onProcess?<TextAction label="增强 / 放大" icon="auto_awesome" disabled={disabled} onPress={onProcess} />:null}
    </View>:null}
    <ListAction label={primaryLabel} disabled={disabled} onPress={onPrimary} />
  </View>;
}
