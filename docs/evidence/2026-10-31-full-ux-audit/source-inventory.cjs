const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../../..');
const ts=require(path.join(root,'mobile/node_modules/typescript'));
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
let controls=[],routes=[],edges=[];
for(const f of [...walk(path.join(root,'mobile/app')),...walk(path.join(root,'mobile/src'))].filter(f=>/\.tsx?$/.test(f)&&!/(\.test\.|__fixtures__)/.test(f))){
 const text=fs.readFileSync(f,'utf8'),sf=ts.createSourceFile(f,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),file=path.relative(root,f).replaceAll('\\','/');
 const line=n=>sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1;
 if(file.startsWith('mobile/app/')&&f.endsWith('.tsx'))routes.push({file,line:1,source:text});
 function visit(n){
  if(ts.isJsxSelfClosingElement(n)||ts.isJsxOpeningElement(n)){
   const props=n.attributes.properties.filter(ts.isJsxAttribute),event=props.filter(p=>/^(onPress|onLongPress|onChange|onValueChange|onSelect|onChoose|onClose|onConfirm|onSubmit)/.test(p.name.text));
   if(event.length){const attr=k=>props.find(p=>p.name.text===k)?.initializer?.getText(sf)||'';
    controls.push({id:'C'+String(controls.length+1).padStart(4,'0'),file,line:line(n),component:n.tagName.getText(sf),label:attr('accessibilityLabel')||attr('label')||attr('title')||attr('placeholder')||'(动态/子文本)',disabled:attr('disabled'),events:Object.fromEntries(event.map(p=>[p.name.text,p.initializer?.getText(sf)||''])),jsx:n.getText(sf)});
   }
  }
  if(ts.isCallExpression(n)&&/\brouter\.(push|navigate|replace|dismissTo|back)/.test(n.expression.getText(sf)))edges.push({file,line:line(n),call:n.getText(sf)});
  if(ts.isCallExpression(n)&&/^(action|field|option)$/.test(n.expression.getText(sf))&&n.arguments.length>1)controls.push({id:'C'+String(controls.length+1).padStart(4,'0'),file,line:line(n),component:'factory:'+n.expression.getText(sf),label:n.arguments[0].getText(sf),disabled:'(由工厂/调用上下文决定)',events:{callback:n.arguments.slice(1).map(a=>a.getText(sf)).join(', ')},jsx:n.getText(sf)});
  ts.forEachChild(n,visit);
 }visit(sf);
}
fs.writeFileSync(path.join(__dirname,'source-controls.json'),JSON.stringify(controls,null,2));
fs.writeFileSync(path.join(__dirname,'source-routes.json'),JSON.stringify(routes,null,2));
fs.writeFileSync(path.join(__dirname,'source-navigation.json'),JSON.stringify(edges,null,2));
let md='# 当前源码控件与导航索引\n\n基线 5185fe2099834d4848befd70ce20dc5bb0babfcb。AST 静态清单；不是逐项实机通过证明。动态列表每个 JSX 模板计一项；回调工厂、原生控件和非 JSX 动作另需人工审阅。完整处理器见 JSON。\n\n';
for(const c of controls)md+=`- **${c.id}** ${c.file}:${c.line} · ${c.component} · ${c.label.replaceAll('\n',' ')} · ${Object.keys(c.events).join('/')} · **源码可定位，实测状态见报告与 UI 清单**\n`;
md+='\n## 导航调用\n\n';for(const e of edges)md+=`- ${e.file}:${e.line}: \`${e.call.replaceAll('\n',' ').replaceAll('`',"'")}\`\n`;
fs.writeFileSync(path.join(__dirname,'source-index.md'),md);
console.log(JSON.stringify({routes:routes.length,controls:controls.length,navigationCalls:edges.length}));

