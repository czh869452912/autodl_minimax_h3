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
