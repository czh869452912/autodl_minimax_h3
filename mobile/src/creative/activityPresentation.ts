const commands:Record<string,string>={
'project.create':'创建项目','project.update':'修改项目简报','project.archive':'更新项目归档状态','project.setCover':'更新项目封面',
'shot.create':'添加镜头','shot.update':'修改镜头','shot.delete':'移除镜头','shot.reorder':'调整镜头顺序','shot.selectOutput':'更新镜头采用版本',
'draft.createImage':'创建图片草稿','draft.createVideo':'创建视频草稿','draft.createUpscale':'创建放大草稿','draft.updateImage':'保存图片草稿','draft.updateVideo':'保存视频草稿','draft.discard':'丢弃草稿',
'asset.import':'导入素材','asset.linkToProject':'素材加入项目','asset.unlinkFromProject':'素材移出项目','asset.pinProjectVersion':'固定项目素材版本','asset.export':'保存到手机','asset.setDefaultVersion':'更新素材默认版本',
'plan.createSelection':'创建选图计划','plan.resolveSelection':'选定计划图片','plan.resume':'继续计划','plan.cancel':'取消计划','change.resolve':'处理修改建议'};
export const activityLabel=(name:string)=>commands[name]??'更新创作内容';
export const activityState=(state:string)=>({QUEUED:'等待执行',RUNNING:'执行中',UNKNOWN:'结果未知，待核查',FAILED:'执行失败',CANCELLED:'已取消',ACTIVE:'进行中',COMPLETED:'已完成',QUARANTINED:'恢复后已隔离'} as Record<string,string>)[state]??state;
