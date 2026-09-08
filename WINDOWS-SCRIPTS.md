# Jellyfish Windows 一键脚本使用说明

## 2026-09-08 复查修正

启动现在不仅等待容器运行，还检查本机 API /health 与前端首页 HTTP 200，并再次核对七个容器；失败显示未就绪，不自动回滚。端口改变时需要同步脚本检查地址。此检查不替代业务生成验收。

双击停止或推送入口，在实际变更前需输入大写 YES 确认，其他输入中止。停止前人工确认任务中心没有未结束任务；脚本不自动查询/取消远端任务。Push 仍提交全部未忽略差异，不只是最近一次修改；暂存后再次检查索引中的敏感文件路径。

自动化已明确确认操作范围时，可向共享 PowerShell 脚本传 -Yes 跳过交互；-Preview 始终只读且不询问。不要未经审查给双击入口默认加 -Yes。取消或失败返回非零退出码；已有暂存/提交或已启动服务不自动撤销。

复查验证：12 项隔离模拟测试通过（新增 HTTP 失败、缺少健康检查、暂存后敏感路径、取消推送/停止），三项本机只读预览通过，两个 PowerShell 文件仍保留 UTF-8 BOM。没有实际启停、暂存、提交或推送；常见路径检查不等于完整内容密钥扫描。

## 服务清单

| 服务 | 用途 | 当前本机端口 |
| --- | --- | --- |
| mysql | 业务数据库 | 3306 |
| redis | 任务消息 | 6380 |
| rustfs | 图片、视频、音频等对象文件 | 9000 / 9001 |
| backend | API | 8000 |
| celery-worker | 后台任务执行 | 不对外 |
| celery-beat | 定时调度 | 不对外 |
| front | 页面 | 7788 |

backend-migrate、backend-seed-system-data 是一次性迁移/初始化任务，不在日常启停名单内。

## 双击使用

换电脑首次部署请先执行 [新电脑部署与数据迁移](docs/Jellyfish-新电脑部署与数据迁移.md)，完成七个常驻容器创建及验收后再使用本页脚本。脚本不能初始化空电脑，也不能从 Git 自动恢复业务数据。

日常启停与中文手册第3节使用同一入口。Start/Stop 调用 docker start/stop，不读取 deploy/compose/.env 的新值；启动沿用创建容器时配置。原配置重启为停止成功后再启动。修改 .env 需审核后重建受影响容器，修改代码需测试/构建及定向部署；不得以普通启停冒充配置更新。Compose up 是部署，down 会移除容器/网络，不是日常启停。只读 compose ps/logs 加载配置不代表把配置应用到容器。

在项目根目录双击以下文件。窗口结束后保留输出，按任意键关闭；普通 Windows 用户即可运行。

| 文件 | 行为 |
| --- | --- |
| [Start-Jellyfish.cmd](Start-Jellyfish.cmd) | 先启动现有数据容器并等 MySQL/Redis 健康，再启动后端、Worker、Beat、前端 |
| [Stop-Jellyfish.cmd](Stop-Jellyfish.cmd) | 先停止前端/API/Beat，再停止 Worker，最后停止数据容器；保留容器和数据卷 |
| [Push-Jellyfish.cmd](Push-Jellyfish.cmd) | 暂存全部未忽略改动，有变更时提交，随后推送到个人仓库固定分支 |

启动前先打开 Docker Desktop，等待 Engine running。脚本不自动启动 Docker Desktop，也不安装 Git/Docker。
启动后访问 http://127.0.0.1:7788；API 文档 http://127.0.0.1:8000/docs。
启动复用已部署镜像，不构建代码、不更新依赖、不执行迁移或 seed。容器若已被删除，应按部署流程恢复，不用本脚本初始化数据库。

停止前先等待生成任务结束。Worker 最多等待120秒，其他停止步骤最多60秒；超时后 Docker 可能强制结束进程。远端生成可能仍继续执行/计费，不承诺正在运行的任务无损恢复。
部分操作失败时立即停止后续步骤，但已完成动作不自动回滚。请读取错误，再修复重试。

## Git 提交范围与前置条件

推送目标为 https://github.com/15802964985/Jellyfish.git ，分支 local/stable-codex-0718。
脚本校验 origin 的全部推送地址及当前分支；不切换分支，不改远程地址，不自动 pull/merge，不 force push。

执行 git add -A：包含所有未忽略新增文件、修改、删除，已有暂存内容也包含在提交内。
提交前先完成本批测试、git diff --name-status 语义审查、LC/PL 与项目记忆同步；脚本不判断业务测试是否充分、不自动猜测历史批次归属。
成功后输出精确 HEAD，用于维护者补录本批提交 SHA；没有自动修改历史台账的功能。
没有新增差异时仍推送已有本地提交。推送失败时，本地提交保留，不会删除；解决登录/远程差异后可以重试。

当前 .env、backups、依赖、常见测试产物已由 Git 忽略。脚本还检查已跟踪文件中的常见环境文件、私钥及数据库文件名；.env.example 可提交。
这不是完整的源码内容密钥扫描；不要把真实密钥写入源码、文档或示例配置。代码提交不备份 MySQL/RustFS 业务数据，也不部署服务。

首次推送可能弹出 GitHub 登录。若提示身份缺失，在本仓库配置实际身份后重试：
```powershell
git -C E:\JellyfishNew config user.name "你的 GitHub 用户名"
git -C E:\JellyfishNew config user.email "你的 GitHub 提交邮箱"
```
若远程分支有其他提交，普通 push 将拒绝覆盖；先审查差异再决定如何合并。
若 add 后检查/commit 失败，暂存区会保留，脚本不会擅自 reset。
不要同时运行多份提交或启停脚本。

## PowerShell 参数与只读预览

进入项目目录后执行。-Preview 只读检查现场并展示计划，不启停、不 add/commit/push，也不联网检查 GitHub。
```powershell
Set-Location E:\JellyfishNew
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Jellyfish.ps1 -Action Start -Preview
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Jellyfish.ps1 -Action Stop -Preview
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Jellyfish.ps1 -Action Push -Preview
```

自定义本次提交说明：
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Jellyfish.ps1 -Action Push -Message "fix: 修复模型总览下拉菜单"
```

-ExecutionPolicy Bypass 仅作用于当前 PowerShell 进程，不修改系统永久执行策略；组织策略仍可能阻止运行。
脚本用 UTF-8 BOM 保存，以兼容 Windows PowerShell 5.1 的中文解析。不要改成不带 BOM 的 UTF-8。
.cmd 入口通过自身位置定位共享脚本；若迁移目录，必须一起携带 scripts/windows。

## 容器归属与目录迁移

脚本按 jellyfish 项目/服务标签查找现有容器，要求每个服务恰好一个。
应用容器及 MySQL/Redis 的 Compose 目录须与当前项目一致。换目录不等于切换部署。

现场 RustFS 保留旧 E:\Jellyfish\deploy\compose 标签，但使用 jellyfish_rustfs_data 卷，并与当前后端共享网络。
只对 RustFS 允许这类旧标签：每次重新验证 /data 的业务卷及与已核实后端共享的网络；不重建它，也不改卷。
其他目录不匹配、容器缺失或重复会在启停之前中止。

## 验证记录

2026-09-08：Windows PowerShell 5.1 下三项只读预览通过；七项隔离模拟测试通过（启动顺序、停止顺序、提交顺序、错误远程、敏感路径、差异检查失败、停止失败）。
共享脚本的原生命令入口在模拟测试中被替换，真实控制流仍执行。
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Test-Jellyfish.ps1
```
本批未实际停止/启动生产服务、未暂存/提交/推送、未执行迁移或收费调用。容器 running 不等于完整业务验收。


### 提交窗口停在冒号 / 换行符警告

LF will be replaced by CRLF 是换行符提示，本身不是提交失败。旧脚本若停在底部冒号，按英文 Q 退出 Git 分页器；再次出现时再按 Q，随后按确认提示输入 YES。不要同时重复启动提交脚本。2026-09-08 已对脚本内所有 Git 调用加入 --no-pager，后续运行不会自动进入分页器，不改用户全局配置。出现“推送完成”及精确 HEAD 才代表脚本成功；若出现其他错误，应按错误诊断。12 项隔离模拟回归通过，未实际代为推送。
