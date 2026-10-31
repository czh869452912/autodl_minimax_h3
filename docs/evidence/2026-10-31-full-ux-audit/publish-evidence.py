"""Build read-only audit deliverables from inspected captures; never operates the app."""
from pathlib import Path
import json, re, hashlib, html, xml.etree.ElementTree as ET
from PIL import Image

OUT = Path(__file__).parent
ROOT = OUT.parents[2]
BASE = '5185fe2099834d4848befd70ce20dc5bb0babfcb'

# Titles describe actual inspected pixels, even when the historical filename is wrong.
# status: accepted / visual-only / system-input / duplicate / excluded
DATA = '''
01|启动瞬态|excluded|未形成可审查的业务页面；不作为App缺陷。
02|Android System UI无响应|excluded|系统阻塞，不归因于App；点等待后可继续。
03|创作：独立视频草稿|accepted|缺AutoDL连接，生成禁用；四主入口可见。F04/F08。
04|创作：图片空画布|accepted|缺NovelAI连接时生成仍启用；没有点生成，不推断后果。F04/F08。
05|图片生成设置抽屉|accepted|参数在局部表面内可滚动；命中区与大字体仍需专项测试。F08。
06|助手首页|accepted|当前项目和输入可见；没有发送真实对话。
07|助手菜单|accepted|技能管理、助手设置可发现；入口位于二级菜单。
08|内嵌技能面板|accepted|技能与聊天输入同屏；空态。F10。
09|技能导入展开|accepted|SKILL.md/ZIP等入口可见；未安装或启用技能。F10。
10|项目列表：原KeyboardQA|accepted|新建和项目卡可达；归档未执行。
11|项目详情：空镜头页|accepted|项目页签清楚，当前无镜头。
12|项目概览|accepted|简报、进度及助手入口可见；未编辑原项目。
13|项目计划空态|accepted|尚无镜头仍显示编排表单。F13；授权风险另以源码为证。
14|项目活动|accepted|显示project.create内部命令。F07。
15|项目设置内联展开|accepted|封面说明要求跨页面操作；不是独立设置页。F06。
16|新建项目表单|accepted|列表内展开创建表单；下一步只创建审计项目。
17|已创建UX-AUDIT-1031|accepted|本地项目创建完成；审计对象保留。
18|添加镜头表单|accepted|全屏编辑任务；只写入审计镜头。
19|已创建AUDIT-Shot-01|accepted|空镜头有选择参考图和制作新图两个直接入口。F01前态。
20|镜头更多操作|accepted|编辑、选图、选视频、另建草稿、移除；没有执行移除。
21|空图片版本选择器|accepted|目标镜头清楚，确认禁用；缺直接导入/生成出口。F02。
22|镜头来源的图片草稿|accepted|来源条含项目/镜头；未生成直接返回。F01中间态。
23|全局素材空态|accepted|管理/导入等入口；没有项目内容。
24|仍是素材空态|duplicate|点击导入时目标匹配失败；此图不能证明导入面板已经打开。
25|素材导入面板：仅截图有效|visual-only|相册/文件/新建Prompt入口视觉可见；当时dump失败后读到旧树，拒绝此文件XML和JSON作为控件证据。
28|素材管理菜单|accepted|存储、历史作品、创作草稿、迁入入口。
29|存储与数据管理|accepted|完整备份/数据库备份/清理/清除同区同色。F11；未执行维护写入。
30|最近任务浮层|accepted|空收件箱与全部任务入口；不是全部任务页。
31|仍是最近任务浮层|duplicate|设置目标未找到；此图不能证明已进入设置。
32|全部任务空队列|accepted|刷新/持续监控/筛选可见；没有真实任务或开启监控。
33|设置分类|accepted|分类入口已走通；分区成功不等于设置保存成功。
34|助手模型设置|accepted|端点为已有假地址，密钥掩码；未保存或验证连接。
35|工作流设置|accepted|内置包v1.0.1与同步入口；未执行同步。
36|视频播放设置|accepted|自动/硬件/软件解码选项；未修改，未验证视频播放。
37|显示与诊断设置|accepted|诊断开关可见；未改配置。
38|创作账号面板|accepted|NovelAI/AutoDL均未连接；没有连接真实账号。F04。
41|创作草稿列表|accepted|两个图片新草稿无法从标题区分项目/镜头。F05。
42|旧历史作品空态|accepted|历史作品/结果双重命名；无旧视频可播放。
43|创作记录浮层|accepted|Prompt/未命名标题缺项目镜头归属。F05。
44|添加视频参考图来源弹窗|accepted|设备/素材库来源；只测了设备路径。
45|Android系统相册选择器|system-input|当前系统输入过程；格子内是旧测试图，内部UI不作为本轮App证据。
46|系统选择器再次观察|duplicate|扫描测试WebP后仍是同一选择器；不额外证明App路径。
47|系统相册已选一图|system-input|选择已有86.png，Done可见；不是本轮生成图，也不是推送WebP。
48|视频草稿带一张参考图|accepted|系统Done返回原草稿；自动归档素材，未生成。
49|素材库出现导入项86.png|accepted|全局库能看到导入输入；图片内容本身不作为当前UI证据。
50|内嵌素材详情v1|accepted|导出/加入项目/更多与文件事实可见；独立素材路由未在本轮打开。
51|仍是素材详情|duplicate|滚动未改变有效状态；不是素材操作菜单证据。
52|素材操作菜单|accepted|信息、增强/放大、保存相册、设默认等可见；导出未执行。F09。
53|加入项目内嵌区域|accepted|项目搜索与固定版本加入入口；尚未证明写入。
54|已加入审计项目|accepted|本地加入成功，封面入口藏在此区域；区域仍保持展开。F06。
55|增强/放大与下层菜单同时保留|accepted|两层Sheet与加入区域同时保留；没有启动处理。F03。
56|系统返回后仍在素材操作菜单|accepted|真实状态是素材菜单，不是文件名所称选择器；证明返回层级。F03。
57|有图片草稿的镜头卡|accepted|真实状态不是选图页；主入口已变为继续已有草稿，选图退至更多。F01后态。
58|非空图片版本选择器|accepted|从镜头更多选定图片进入；项目已有86.png v1可用。
59|已选v1待确认采用|accepted|显示具体版本及确认；选中与采用分开。
60|镜头已采用图片固定版本|accepted|显式确认后采用成功；主动作变制作视频。F01边界：采用后动作正常。
61|镜头来源的视频草稿|accepted|另建视频草稿成功且带采用图片；没有提交任务。
62|视频提示词协作抽屉|accepted|用途、预设、历史和输入可见；未发送对话。
63|原独立视频的参考图移除菜单|accepted|仅对本次新增参考引用做清理，不删除原素材。
64|原独立视频参考图恢复0/9|accepted|通过UI移除此引用；不声明数据库字节/更新时间完全恢复。
65|缺失任务结果|accepted|有未找到说明、返回和任务中心；成功/失败任务未测。
66|不完整成果链接|accepted|首次取证URI被shell拆分导致缺参数；页面有明确说明，不作为App缺陷。
67|旧视频不存在|accepted|稳定显示作品不存在或已删除及返回；有效旧视频播放未测。
68|从对话提炼技能初态|accepted|证据选择/脱敏说明/目标/禁用发送可见；未提炼。
69|参数完整但指定版本不存在|accepted|修复URI引用后再次打开；明确版本不可用，没有替换其他版本。
70|独立技能页空态|accepted|全屏route可达；添加/记录/搜索可见，未安装技能。
'''

# A trace is terminal-state reachability, not an assertion that every intermediate
# control is present in the source screenshot. Multi-action traces say "via".
TRACES = '''
03|图片|04|模式切换|已到图片工作台
04|生成设置|05|局部表面|已打开参数抽屉
05|关闭；via 底栏助手|06|组合跳转|已到助手；保留图片输入
06|助手菜单|07|局部菜单|已打开菜单
07|技能管理|08|局部表面|内嵌技能面板
08|添加技能|09|展开|导入选项可见，未安装
09|关闭技能；via 项目|10|组合跳转|已到项目列表
10|KeyboardQA|11|项目卡|已到项目镜头页
11|概览|12|页签|概览可达
12|计划|13|页签|计划空态可达
13|活动|14|页签|活动可达
14|项目设置|15|内联展开|项目设置内容展开
15|返回；via 新建项目|16|组合跳转|新建表单可见
16|填写UX-AUDIT-1031并创建|17|本地写入|创建完成
17|添加镜头|18|编辑表面|镜头编辑可达
18|填写AUDIT-Shot-01并保存|19|本地写入|镜头创建完成
19|更多操作|20|局部菜单|镜头动作展开
20|选定图片|21|选择任务|空版本选择器
21|取消；via 制作新的参考图|22|组合跳转|项目图片草稿可达，未生成
22|返回；via 素材|23|组合跳转|素材空库；镜头草稿已保留
23|导入（首次目标匹配失败后重新定位）|25|局部表面|导入截图可见，树无效；未从此面板导入
23|via 关闭导入、素材管理|28|组合跳转|管理菜单可达
28|存储与清理|29|直达设置|存储分区可达；返回来源另已观察
29|返回来源；via 创作、任务入口|30|组合跳转|最近任务浮层可达
30|全部任务|32|队列|任务页可达
32|via 设置入口|33|组合跳转|设置分类可达
33|助手模型|34|设置分区|模型字段可见；未保存
34|返回分类；via 工作流|35|组合跳转|工作流设置可达；未同步
35|返回分类；via 视频播放|36|组合跳转|播放设置可达；未改解码
36|返回分类；via 显示与诊断|37|组合跳转|显示设置可达；未改开关
37|via 创作账号|38|组合跳转|创作账号面板可达；未连接
38|via 素材、管理、创作草稿|41|组合跳转|草稿列表可达
41|返回；via 历史作品|42|组合跳转|旧作品空态可达
42|via 创作、创作记录|43|组合跳转|创作记录可达
43|关闭；via 视频、添加参考图|44|组合跳转|来源弹窗可见
44|从设备选择|45|系统输入|系统相册可达
45|via 重新观察、选择已有图|47|系统输入|一项已选；具体格子由新树bounds定位
47|Done|48|系统返回|回原视频草稿，参考图1/9
48|素材|49|主导航|导入项自动归档可见
49|86.png素材卡|50|对象检查器|具体版本v1详情
50|素材操作|52|局部菜单|操作菜单可见；未执行导出
52|关闭；via 加入项目|53|组合跳转|加入项目区域展开
53|加入UX-AUDIT-1031|54|本地写入|项目引用建立；非镜头采用
54|via 素材操作、增强/放大|55|组合跳转|处理表面可达但菜单仍保留，F03
55|Android系统返回|56|返回|回下层素材操作菜单，F03
56|via 关闭、项目、UX-AUDIT-1031、镜头|57|组合跳转|主动作继续已有草稿，F01
57|更多；via 选定图片|58|组合跳转|非空版本选择器
58|86.png v1|59|选择|版本选中，尚未采用
59|确认采用|60|本地写入|镜头固定图片版本，成功
60|更多；via 另建视频草稿|61|组合跳转|项目视频草稿，已带图
61|帮我写提示词|62|局部工具|提示词助手可见，未发送
62|via 关闭、返回项目、返回列表、创作、参考图菜单|63|组合跳转|回原独立keyboard视频草稿，准备移除新增引用
63|移除引用|64|本地写入|参考图0/9；未删素材原件
64|deep link creative-task/audit-missing|65|缺失态|未找到任务，可靠说明
65|deep link creative-output（首次缺参数）|66|不完整链接|明确链接不完整
66|deep link video/audit-missing|67|缺失态|旧作品不存在
67|deep link agent-skill-extract|68|独立路由|提炼初态；无模型请求
68|deep link creative-output（asset/job/draft完整）|69|缺失态|指定版本不可用，未替换
69|deep link agent-skills|70|独立路由|全屏技能空态
'''

def dump(name, value):
    (OUT/name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def esc(s):
    return str(s).replace('|', '\\|').replace('\n', ' ')

def source_matches(label):
    if not label or len(label)>70:
        return []
    exact = [c for c in source if c.get('label','').strip('"\'{} ') == label]
    return [{'id': c['id'], 'file': c['file'], 'line': c['line']} for c in exact[:6]]

source = json.loads((OUT/'source-controls.json').read_text(encoding='utf-8'))
transitions=[]
for i,line in enumerate(TRACES.strip().splitlines(),1):
    a,action,b,kind,result=line.split('|')
    transitions.append(dict(id=f'T{i:03}',source=a,action=action,target=b,kind=kind,result=result))
dump('transitions.json', transitions)

items=[]
all_controls=[]
for line in DATA.strip().splitlines():
    number,title,status,note=line.split('|')
    files=sorted(OUT.glob(number+'-*.png'))
    assert len(files)==1,(number,files)
    png=files[0]
    with Image.open(png) as im:
        dimensions=list(im.size)
    xml=png.with_suffix('.xml')
    js=png.with_suffix('.json')
    tree_ok=status in ('accepted','system-input') and xml.exists()
    item=dict(id=number,title=title,status=status,note=note,png=png.name,dimensions=dimensions,
              xml=xml.name if xml.exists() else None,treeAccepted=tree_ok,
              health=('需优化/条件可用' if re.search(r'F\d+',note) else '当前状态可达；相关执行分支未全验') if status=='accepted' else
                     {'excluded':'排除','duplicate':'重复/状态未达，不计新验证','visual-only':'只接纳视觉证据','system-input':'系统输入可达'}[status],
              sha256={p.name:sha(p) for p in [png,xml,js] if p.exists()},controls=[])
    if tree_ok:
        for n in ET.parse(xml).getroot().iter('node'):
            cls=n.get('class','')
            if n.get('clickable')!='true' and not any(k in cls for k in ('EditText','Button','Switch','CheckBox','Spinner','SeekBar')):
                continue
            label=n.get('content-desc') or n.get('text')
            if not label:
                labels=[c.get('content-desc') or c.get('text') for c in n.iter('node') if c is not n and (c.get('content-desc') or c.get('text'))]
                label=' / '.join(dict.fromkeys(labels))[:180] or '(无可访问名称)'
            b=list(map(int,re.findall(r'\d+',n.get('bounds',''))))
            dp=[round((b[2]-b[0])/2.625,1),round((b[3]-b[1])/2.625,1)] if len(b)==4 else None
            relevant=[t for t in transitions if t['source']==number and label in t['action']]
            c=dict(id=f'U{number}-{len(item["controls"])+1:03}',capture=number,label=label,
                   kind=cls.split('.')[-1],enabled=n.get('enabled'),bounds=n.get('bounds'),visibleBoundsDp=dp,
                   checked=n.get('checked'),selected=n.get('selected'),
                   verification=('有该起点操作轨迹 '+','.join(t['id'] for t in relevant)+'；见轨迹中的终态与组合动作说明') if relevant else '仅可见/树中声明，未证明点击执行成功',
                   sourceCandidates=source_matches(label))
            item['controls'].append(c)
            all_controls.append(c)
    items.append(item)

manifest=dict(date='2026-10-31',timezone='Asia/Shanghai',baseline=BASE,device='emulator-5554',package='com.example.autodlh3',
              versionName='1.5.0-preview.4',versionCode=70,apkSha256='75175292d9b0b7149f43aadeb130fece6c34c4df72020bdf8e7b56fdb9aa028c',
              rules=['只有treeAccepted=true可作该画面控件结构证据','UI节点与源码候选基于文字匹配，不等于确认运行调用栈',
                     '默认按钮状态是可见未执行；轨迹只证明所述终态可达，组合动作并非单次点击',
                     '样本86.png内的旧UI不构成当前App证据','截图编号缺26/27/39/40是取证失败，未补造'],
              counts=dict(captures=len(items),byStatus={s:sum(i['status']==s for i in items) for s in sorted(set(i['status'] for i in items))},
                          uiNodeInstances=len(all_controls),sourceInteractionDeclarations=len(source),navigationCalls=112,routeFiles=22,transitionTraces=len(transitions)),captures=items)
dump('manifest.json',manifest)
dump('ui-controls.json',all_controls)
dump('baseline.json',{k:manifest[k] for k in ['date','timezone','baseline','device','package','versionName','versionCode','apkSha256','counts']})

md=['# 逐状态按钮、输入与控件台账','',
    '本台账按当前截图UI树逐节点列出。节点实例数包括重复出现在不同状态的同一按钮，不是独立功能数。只记录当前视口与树中节点；滚动外、条件分支、原生调用、手势另见静态索引与待补验证。',
    '', '源码位置是**同名候选**，并非运行栈证明；没有候选不表示没有实现。完整事件处理器和JSX见 [source-controls.json](source-controls.json)，候选ID与其一一对应。',
    '', 'bounds是物理像素，尺寸按420dpi换算可见bounds的dp；不包含hitSlop，也不能独自证明实际命中范围。默认“仅可见”不算按钮验证通过。',
    '', '[页面分析](../../reviews/2026-10-31-full-product-ux-audit.md) · [操作轨迹](navigation-trace.md) · [源码声明清单](source-index.md)','']
steps=['# 逐步截图与健康度','',
       '按取证顺序列出每个状态。accepted=接纳画面及对应树，visual-only=仅截图；接纳不是全功能通过。每步仅描述本次所见。通用未覆盖：TalkBack、大字体/键盘/宽屏、收费生成、多版本真实任务及数据破坏操作。',
       '', '[主报告与问题卡](../../reviews/2026-10-31-full-product-ux-audit.md) · [跳转轨迹](navigation-trace.md) · [按钮台账](ui-controls.md)','']
for item in items:
    num=item['id']
    md += [f'## {num} · {item["title"]}', '',f'状态：{item["status"]}。{item["note"]}', '']
    steps += [f'## 步骤 {num} · {item["title"]}', '',f'健康度：**{item["health"]}**。{item["note"]}', '']
    if item['status'] not in ('excluded','duplicate'):
        steps += [f'![{num} {item["title"]}]({item["png"]})','']
    else:
        steps += [f'[保留原图，不计有效业务状态]({item["png"]})','']
    if not item['treeAccepted']:
        md += ['此状态不生成有效控件台账；见排除/视觉限制说明。','']
        continue
    md += ['| 控件ID | 名称/内容 | 类型 | 启用 | bounds / 可见dp尺寸 | 执行证据 | 源码同名候选 |',
           '| --- | --- | --- | --- | --- | --- | --- |']
    for c in item['controls']:
        candidates='; '.join(f'{s["id"]}: {s["file"]}:{s["line"]}' for s in c['sourceCandidates']) or '需结合页面组件定位，见source-index'
        md.append('| '+' | '.join(map(esc,[c['id'],c['label'],c['kind'],c['enabled'],f'{c["bounds"]} / {c["visibleBoundsDp"]}',c['verification'],candidates]))+' |')
    md.append('')
(OUT/'ui-controls.md').write_text('\n'.join(md),encoding='utf-8')
(OUT/'evidence-steps.md').write_text('\n'.join(steps),encoding='utf-8')

trace_md=['# 导航与操作轨迹','',
           'T为操作记录，数字为截图编号。含“via”的行有未单独截图的中间动作，只证明此路径终态可达，不表示来源截图内存在所有列出的按钮。未执行按钮见ui-controls.md；不能将表中没有的操作标为通过。',
           '', '| ID | 起点 | 动作/中间路径 | 终点 | 类别 | 本次结果 |','| --- | --- | --- | --- | --- | --- |']
by_id={i['id']:i for i in items}
for t in transitions:
    a,b=by_id[t['source']],by_id[t['target']]
    trace_md.append('| '+' | '.join([t['id'],f'[{a["id"]} {a["title"]}]({a["png"]})',esc(t['action']),f'[{b["id"]} {b["title"]}]({b["png"]})',t['kind'],esc(t['result'])])+' |')
(OUT/'navigation-trace.md').write_text('\n'.join(trace_md)+'\n',encoding='utf-8')

# Individual static declaration ledger: exact event text is the evidence; the
# checklist category is only a triage suggestion, never runtime verification.
behavior=['# 源码逐交互行为台账','',
          '762项是JSX交互声明与action/field/option工厂调用；有复用组件、动态模板与组合回调，不等于762个可见按钮。每项列当前事件表达式，便于逐个追踪；函数引用需到所列文件阅读函数体。静态定位不证明可用。',
          '', '“同名UI”仅字符串候选，可能对应不同宿主或同名控件；运行结果以navigation-trace.md明确记录为准。条件分支、长按、失败态尚未全测。','']
for c in source:
    events=json.dumps(c['events'],ensure_ascii=False,indent=2)
    expr=' '.join(c['events'].values())
    if re.search('delete|remove|trash|clear|restore|reset|archive|discard',expr,re.I):
        check='生命周期/影响核对：确认目标、引用保护、取消、失败、恢复隔离。命中词仅提示人工复核，可能只是清空输入。'
    elif re.search('submit|generate|authorize|dispatch|send|run|enqueue',expr,re.I):
        check='执行核对：就绪条件、参数/具体版本、授权、提交中防重、未知先核查、重启。命中词不是已证明发生消费。'
    elif re.search(r'router\.|navigate|open|select|choose|set.*(Visible|Open)',expr,re.I):
        check='跳转/表面核对：目标对象、来源锚点、局部/全屏、取消/系统返回、无历史兜底。'
    else:
        check='状态/输入核对：默认值、禁用原因、持久化、取消、错误反馈；必要时继续追踪回调。'
    related=[u['id'] for u in all_controls if any(s['id']==c['id'] for s in u['sourceCandidates'])]
    behavior += [f'## {c["id"]} · {c["file"]}:{c["line"]}', '',
                 f'组件：`{c["component"]}`。声明名称：`{c["label"].replace(chr(10)," ")}`。',
                 '',f'禁用表达式：`{c["disabled"] or "未在此声明；可能由宿主决定"}`。',
                 '', '证据状态：**源码已定位；未作该声明实机通过断言**。',
                 '',f'同名UI候选：{", ".join(related) or "未匹配；可能未进入此条件分支或名称动态"}。',
                 '',check,'','```json',events,'```','']
(OUT/'source-behavior.md').write_text('\n'.join(behavior),encoding='utf-8')

report=(ROOT/'docs/reviews/2026-10-31-full-product-ux-audit.md').read_text(encoding='utf-8')
findings=[]
for match in re.finditer(r'^### (F\d+) · (P\d) · ([^\n]+)\n(.*?)(?=^### |^## |\Z)',report,re.M|re.S):
    ident,priority,title,body=match.groups()
    findings.append(dict(id=ident,priority=priority,title=title,assessment=body.strip(),
                         evidenceBasis='S:源码风险/设计判断，非消费复现' if ident=='F12' else 'V+S+D；具体边界见问题正文',
                         captures=[i['id'] for i in items if ident in i['note']]))
assert len(findings)==14,len(findings)
dump('findings.json',findings)

# Embedding data avoids fetch/CORS requirements when opened as a local HTML file.
payload=json.dumps(manifest,ensure_ascii=False).replace('</','<\\/')
source_payload=json.dumps(source,ensure_ascii=False).replace('</','<\\/')
template='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>2026-10-31 App UX/UI 审计证据</title>
<style>body{font:15px/1.65 system-ui,sans-serif;background:#f4f6f5;color:#203a33;margin:0}header{background:#fff;padding:24px;position:relative;border-bottom:1px solid #ccd6d2}h1{font-size:25px;margin:0 0 8px}a{color:#126b5a}input,select{font:inherit;padding:10px;border:1px solid #91a99f;border-radius:6px}nav{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;padding:22px;align-items:start}.card{background:#fff;padding:16px;border:1px solid #cdd8d3;border-radius:8px}.card img{display:block;max-width:100%;max-height:580px;margin:auto;object-fit:contain}.card h2{font-size:18px}.status{font:12px monospace;background:#eaf1ee;padding:4px 8px;border-radius:5px}.excluded,.duplicate{opacity:.8}.note{min-height:80px}table{border-collapse:collapse;font-size:12px;width:100%}td,th{border:1px solid #d7e1dc;padding:5px;text-align:left;vertical-align:top;overflow-wrap:anywhere}details{margin-top:12px;overflow:auto}summary{cursor:pointer;font-weight:600}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 monospace}.toolbar{display:flex;gap:10px;flex-wrap:wrap}small{color:#526b60}button{padding:5px 8px;color:#126b5a;border:1px solid #b3c7bb;background:#fff;cursor:pointer}</style>
<header><h1>当前 App UX/UI · 原始证据浏览器</h1><p>基线5185fe2 · Android code70 · 1080×2400/420dpi。接纳截图不等于所有按钮实测通过。默认控件为“仅可见未执行”；同名源码只是候选。86.png内部旧画面不用于本轮UI判断。</p>
<nav><a href="../../reviews/2026-10-31-full-product-ux-audit.md">主报告</a><a href="../../reviews/2026-10-31-ux-execution-handoff.md">执行交接</a><a href="evidence-steps.md">逐步截图/健康度</a><a href="ui-controls.md">按钮台账</a><a href="navigation-trace.md">操作轨迹</a><a href="source-behavior.md">762项逐交互行为</a><a href="manifest.json">哈希清单</a></nav>
<div class="toolbar"><input id="q" placeholder="查页面、F01、按钮名称…" aria-label="搜索证据"><select id="status" aria-label="筛选证据状态"><option value="">全部状态</option><option>accepted</option><option>visual-only</option><option>system-input</option><option>duplicate</option><option>excluded</option></select><span id="count"></span></div><small>25仅截图有效；01/02排除；24/31/46/51重复；56/57按真实画面命名。点击原图查看完整分辨率。无需网络或服务器。</small></header><main class="grid" id="grid"></main>
<script>const audit=__DATA__,source=__SOURCE__;
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(){let q=document.querySelector('#q').value.toLowerCase(),s=document.querySelector('#status').value;
let rows=audit.captures.filter(i=>(!s||i.status===s)&&JSON.stringify(i).toLowerCase().includes(q));document.querySelector('#count').textContent=rows.length+' / '+audit.captures.length+' 张';
document.querySelector('#grid').innerHTML=rows.map(i=>`<article class="card ${E(i.status)}"><span class="status">${E(i.status)}</span><h2>${E(i.id)} · ${E(i.title)}</h2><p class="note">${E(i.note)}<br><small>健康度：${E(i.health)}</small></p><a href="${E(i.png)}" target="_blank"><img loading="lazy" src="${E(i.png)}" alt="${E(i.title)}"></a><p><small>PNG SHA256 ${E(i.sha256[i.png])}</small></p>${i.treeAccepted?`<a href="${E(i.xml)}">原始UI树</a>`:'<strong>不接纳该文件UI树作为当前画面证据</strong>'}<details><summary>可见控件 ${i.controls.length} 个</summary><table><tr><th>ID / 名称</th><th>状态 / bounds / dp</th><th>执行证据</th><th>源码同名候选</th></tr>${i.controls.map(c=>`<tr><td>${E(c.id)}<br>${E(c.label)}<br>${E(c.kind)}</td><td>enabled=${E(c.enabled)}<br>${E(c.bounds)}<br>${E(c.visibleBoundsDp)}</td><td>${E(c.verification)}</td><td>${c.sourceCandidates.map(v=>`<button data-source="${E(v.id)}">${E(v.id)}</button> ${E(v.file)}:${v.line}`).join('<br>')||'见静态索引'}</td></tr>`).join('')}</table></details></article>`).join('');
document.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>{let c=source.find(x=>x.id===b.dataset.source);let w=window.open('','_blank');if(w){w.document.write('<meta charset="utf-8"><title>源码候选 '+E(c.id)+'</title><pre style="white-space:pre-wrap">'+E(JSON.stringify(c,null,2))+'</pre>');w.document.close()}})}
document.querySelector('#q').oninput=render;document.querySelector('#status').onchange=render;render();</script></html>'''
(OUT/'evidence.html').write_text(template.replace('__DATA__',payload).replace('__SOURCE__',source_payload),encoding='utf-8')

readme=f'''# 本轮审计证据

先打开 [证据浏览器](evidence.html) 或 [主报告](../../reviews/2026-10-31-full-product-ux-audit.md)。本目录仅文档/取证，不修改产品。

- {len(items)}张原始PNG：状态统计见manifest.json；编号跳号是捕获失败，不补造。
- {len(all_controls)}个UI树控件实例：包括跨截图重复出现的控件；不是独立按钮数，也不是通过数。
- {len(transitions)}条实际路径/组合操作记录：见navigation-trace.md。
- {len(source)}项源码交互声明/工厂调用、112处router调用、22个route文件：见source-controls.json/source-navigation.json/source-routes.json及[source-behavior.md](source-behavior.md)逐项回调与验收提示。
- [逐步截图](evidence-steps.md)、[按钮台账](ui-controls.md)、[执行交接](../../reviews/2026-10-31-ux-execution-handoff.md)。

状态/真实画面名/文件SHA256以manifest.json为准。25的XML/JSON是已知旧树，保留取证失败痕迹但拒绝用于该面板证明。01/02不算App状态；24/31/46/51不算新验证。56是真实素材操作菜单，57是真实镜头卡。系统选择器45/47格子中的旧截图只作输入素材。

capture.py用于adb操作与捕获；source-inventory.cjs做静态索引；make-sheets.py拼接原始图供视觉核对；publish-evidence.py生成本交付。后续修改截图或数据后需重跑生成器和验证，不能沿用原哈希。
'''
(OUT/'README.md').write_text(readme,encoding='utf-8')
print(json.dumps(manifest['counts'],ensure_ascii=False,indent=2))
