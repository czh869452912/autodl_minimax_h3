# 外部素材去重与标签补全修复

## 外部素材

文件层原本已使用 SHA-256 CAS，重复内容共享一个真实文件。缺陷在领域层：每次 asset.import 都创建素材和版本。现在同类型、同原件内容的独立导入复用素材/版本，串行事务处理并发；新项目只增加关联，重复导入不覆盖用户标题/描述或项目固定版本，重新导入可恢复原件可用状态。

历史重复项在素材列表和选材分页之前按原件归并显示，直接引用旧素材/版本仍有效。归档到回收站/恢复按整组处理，并对组内所有引用检查，事务失败不会部分改变。生成候选、已有衍生版本或生成上下文的素材不合并，避免丢失创作历史。现有 CAS 并发与完整性测试继续验证只有一个文件目的路径。

验证：素材服务、去重、生命周期、文件导入/恢复、CAS 相关测试通过；详见 build/import-dedup-tests.log。

## 补全参考

对照日期 2026-10-30。只参考行为设计，未复制插件代码。

- [A1111 tagcomplete 插入实现](https://github.com/DominikDoom/a1111-sd-webui-tagcomplete/blob/4170882f90b47be130a0ff9314f663c230b9153d/javascript/tagAutocomplete.js)：插入前规范化文本，检查已有分隔符，以转换后的长度设置光标；另有括号转义、特殊网络标签的独立处理。
- [ComfyUI Custom Scripts 补全实现](https://github.com/pythongosssss/ComfyUI-Custom-Scripts/blob/609f3afaa74b2f88ef9ce8d939626065e3247469/web/js/common/autocomplete.js)：显式选择替换范围，插入后定位；区分前缀、包含匹配及优先级。

本应用使用 NovelAI 的权重语法，不能直接套用 WebUI 的全部括号转义或 LoRA 分支。按用户要求，只替换光标前查询文本，保留光标后文本；分隔符和权重闭合分别处理。原生输入采用 UTF-16 索引，与 JavaScript 字符串一致。

## 落地规则

- 候选窗口仍最多展示四行，但内部可滚动查看最多 40 项，带常驻滚动条；切换查询重置滚动位置，异步本地/官方结果合并，旧查询结果失效。
- 本地词库保留 140,782 个标签，v2 索引增加词边界后缀。支持空格/下划线/全角归一化、多词乱序、词中前缀、稀疏结果的包含匹配，以及现有别名和中文翻译；优先匹配程度，其次最近使用/热度。不是任意拼写纠错。数据库由约 20 MB 增至 43 MB，换取词中前缀查询可使用索引。
- 替换范围严格结束于光标；只移动到实际插入文本和分隔符之后。右侧已有中英文逗号则复用；右侧普通文本保留并补逗号；权重闭合 `::`、`}`、`]` 和换行保留，不插入会破坏结构的逗号。
- Android 在原生同一次批量编辑中设置文本及光标，避免富文本子节点更新与 JS selection 更新发生长度偏移。落笔前校验焦点、原文、选区、IME 状态；失效的候选不会修改当前输入。保留非 Android 回退路径。
- 回归覆盖中间插入、词中插入、末尾插入、已有分隔符、空白、换行、权重/artist 前缀、引号、转义、非空选区、emoji 的 UTF-16 长度和不完整代理对，以及候选超过四项的选择。

## Android 验证

Android 17 x86_64 模拟器、同源码 debug 构建：

- `blue ha| extra words, sky` 选择 blue_hair 后输入 X，得到 `blue hair, Xextra words, sky`。
- 滚动到第八项 blue_hanfu 后选择并输入 X，得到 `blue hanfu, Xmore, sky`；截图确认滚动条可见。
- `blue ha|, sky` 选择 blue_hair 后输入 X，得到 `blue hair, Xsky`，无重复逗号。
- 两条历史音频素材共享同一原件，素材库只显示一张 QA shared sound 卡片。
- 未执行收费生成；原模拟器数据库已恢复并核对 SHA-256，无 WAL 遗留。ARM 手机及不同输入法组合仍需实机验收。

证据：`build/tags-inserted-marker.xml`、`build/tags-scroll-selected.xml`、`build/tags-existing-comma.xml`、`build/tags-scrolled-more.png`、`build/tags-assets-deduplicated.png`。

最终回归：Jest 288 组 / 1797 项通过，原有 1 组 / 4 项跳过；TypeScript 通过。日志 `build/tags-final-tests.log`、`build/tags-final-typecheck.log`。素材去重提交 `2d272081`，标签与原生输入修复提交 `01bf5227`。
