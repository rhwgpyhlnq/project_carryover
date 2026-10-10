 



### 客户版本功能同步（2026-10-10，0.0.2）

已迁移 project1 提交 f9597a6 的前端功能，保留 projectcarryover 应用命名空间、应用标题、Launchpad 入口、客户服务元数据及四个 UI5 YAML 配置。

- Simulate voucher（模拟）：按公司、年度、期间、分类账、WBS 和币种去重；弹窗展示后端直接返回的分录及借贷合计，关闭后不保存模拟历史，不显示来源科目列。
- Posting voucher（创建）：调用客户 RAP Posting 动作，显示过账凭证号、过账日期并刷新数据；默认凭证类型 SA。
- Offset voucher（冲销）：调用客户 RAP OffsetVoucher 动作；冲销原因隐藏并默认 01，仅提示冲销过账日期。

真实过账、重复过账检查、冲销成功后删除 ZPC_POSTLOG 等逻辑由 MY201604 的 ZFI002 ADT 后端负责，本次只同步前端。公司代码搜索帮助继续使用客户服务元数据。

 
在 BAS 项目根目录执行 git pull，再执行 npm ci、npm test、npm run build；预览核对后执行 npm run deploy。GitHub 更新不会自动部署 SAP 系统。
