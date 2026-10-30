# WBS 整组勾选

本次只修改 UI5 前端。后端 ABAP、金额小计算法、凭证生成算法和部署配置保持现有版本；前端仍由 BAS 构建、预览和部署。

## 操作规则

- 勾选一条科目明细，自动选择公司代码、会计年度、会计期间、分类账、WBS 五项都相同的明细；取消任意一条，也取消同组。
- 总账科目、结转类型、接收方、币种不参与分组选中条件。同一个 WBS 跨公司、年度、期间或分类账时，分别选择。
- 小计、合计、分组标题不作为凭证明细选中。不新增弹窗；原有操作参数和模拟预览继续使用。
- 已加载明细立即同步复选框。折叠/分页的明细加载时补选；不会为了勾选而强制展开所有分组。表头“已选择”数量是控件已加载并选中的明细数，不是未加载的全部业务明细数。
- 执行创建、冲销、模拟前，额外用上述五项条件从原 `/Runs` 分页读取完整分组，再交给已有操作入口。因此科目筛选或分页不会把同组剩余科目遗漏。读取失败不提交操作；后端原有可执行状态校验继续保留。
- 重新查询、筛选、刷新时清理组选择意图，避免旧查询的勾选自动带入新结果。

## 文件范围

| 文件 | 用途 |
| --- | --- |
| `webapp/manifest.json` | 表格多选、选择事件和重新绑定事件 |
| `webapp/ext/WbsSelection.js` | 五项键、同组选中/取消、后续加载同步 |
| `webapp/ext/WbsGroupData.js` | 操作前分页读取完整 WBS 组 |
| `webapp/ext/WbsActions.js` | 接入完整组明细，保留原操作和权限校验 |
| `webapp/i18n/i18n*.properties` | 明细已不存在的提示 |
| `tests/wbs-selection.test.cjs` | 联动和分页测试 |
| `tests/wbs-actions.test.cjs` | 既有操作及读取失败阻止提交的测试 |

不修改 `ui5-deploy.yaml`、后端 CDS 或行为实现。需要现有 WBS 小计版本（GitHub 基线 `e22ee6a`）。

## 验证及 BAS 验收

已完成 17 项 Node 单元测试、变更 JS 的 ESLint 检查和 UI5 构建。尚未在你的 BAS/SAP 实际页面中验证选择事件和真实凭证操作。

在 BAS 拉取或覆盖源文件后，执行 `npm test`、`npm run build`、`npm start`。先用模拟验收：

1. 勾选一行，确认同组其他科目一起选中；不同五项键的记录不选中。
2. 取消同组任意一行，确认整组取消。
3. 选一个组后滚动、展开其他币种，检查新增显示的同组明细补选。
4. 同时选两个不同 WBS，取消一个不影响另一个。
5. 重新查询后，确认旧选择不会恢复。
6. 用模拟按钮核对全组金额；确认后再按团队流程验收创建、冲销。

使用 UI5 1.148.10 的公开 API：

- [Context.setSelected / getBinding](https://ui5.sap.com/1.148.10/#/api/sap.ui.model.odata.v4.Context)
- [ODataListBinding.selectionChanged / getAllCurrentContexts / requestContexts](https://ui5.sap.com/1.148.10/#/api/sap.ui.model.odata.v4.ODataListBinding)
- [Table.selectionChange / getAllCurrentContexts / clearSelection](https://ui5.sap.com/1.148.10/#/api/sap.fe.macros.Table)

不访问生成控件的私有成员，也不依赖框架生成的内部表格 ID。
