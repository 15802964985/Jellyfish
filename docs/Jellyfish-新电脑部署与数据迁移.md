# 新电脑部署与旧电脑数据迁移

适用：当前 Jellyfish 本地二开版本、Windows + Docker Desktop Linux containers。维护：2026-09-08。与中文手册第3节“日常启停”不同：**本流程第一次创建容器和数据库，完成后才可用 Start/Stop-Jellyfish.cmd。**

本次只编写并核对操作流程，没有实际迁移电脑或执行以下部署命令。每个命令成功后再进入下一步，非零退出码必须停止排查。不要整篇粘贴连续执行。

## 1. 先选择迁移方式

| 方式 | 携带内容 | 结果 |
| --- | --- | --- |
| A 全新空库 | 已审查的二开代码、重新填写的配置 | 新建空项目库及系统模板；旧项目、模型账户、素材不会自动出现 |
| B 延续原有系统（推荐换电脑时使用） | 同版本二开代码、MySQL备份、RustFS完整对象备份、受保护配置、版本和数量清单 | 恢复项目、资产关系、模型配置和文件，核对后接管 |
| 只有代码，没有备份 | 只能走 A | Git、镜像、网页缓存均不能替代数据库和素材备份 |

不要同时升级上游和换电脑：先按旧电脑已验证代码/数据版本恢复，再单独执行上游升级 SOP。恢复目标必须是确认没有业务数据的新库、新卷，不能覆盖已有 Jellyfish。

## 2. 旧电脑：准备迁移包（B 必做）

1. 等待所有排队/执行/取消中的任务结束；核对任务数据库/outbox，不只看当前页面过滤结果。维护窗口停止 front、backend、beat、worker 写入，但先保留 MySQL 和 RustFS 做备份。停止顺序遵循日常脚本，不在任务运行时强制关机。
2. 审查未提交二开与敏感信息，提交推送到个人稳定分支，记录精确 SHA。Git bundle/clone **不包含未提交或未跟踪修改**。若还不能提交，另存完整受保护工作树副本和差异清单，不谎称 GitHub 已包含本机所有二开。
3. 从实际业务库做逻辑 SQL 备份，包含业务库全部表、routines、triggers；不要导出 MySQL 系统账户库覆盖新机账户。导出命令失败必须中止，不使用可能吞掉 mysqldump 错误的无 pipefail 管道。例如维护者在已定义正确 Compose 参数后：

~~~powershell
docker compose @ComposeFiles exec -T mysql sh -lc 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --no-tablespaces --set-gtid-purged=OFF "$MYSQL_DATABASE" > /tmp/jellyfish-transfer.sql && gzip -f /tmp/jellyfish-transfer.sql'
if ($LASTEXITCODE -ne 0) { throw 'SQL备份失败，禁止继续迁移' }
docker compose @ComposeFiles cp mysql:/tmp/jellyfish-transfer.sql.gz "$BackupRoot\jellyfish-transfer.sql.gz"
if ($LASTEXITCODE -ne 0) { throw 'SQL备份复制失败' }
~~~

上面的 $ComposeFiles 按手册第9节在旧机定义，$BackupRoot 是已创建、受保护、位于代码仓库外的迁移目录。示例不会在命令文本中写明密码，但数据库工具日志可能有密码参数警告，不公开原始日志。

4. 停止 RustFS 后，对**已核实的实际业务卷**做离线完整 tar.gz 归档，保留隐藏文件及元数据。当前旧机记录为 jellyfish_rustfs_data，须现场核对挂载再使用手册第9节的归档方法；归档期间 RustFS 不可写入。先在旧机确认基础工具镜像可用，不能因网络失败留下半份归档。
5. 单独加密保存 deploy/compose/.env、secure-local 覆盖、其他自定义部署配置；记录 bucket 名称、数据库名、实际卷与挂载、精确镜像 ID/digest、架构、schema revision、关键表数量、对象数量/大小。模型 API Key 可能包含在数据库备份中，整个包都按敏感数据保护。
6. 在两台电脑核对每个迁移文件的 SHA256：Get-FileHash -Algorithm SHA256 -LiteralPath '实际文件路径'。SQL在隔离库恢复验证，归档验证可读；仅文件存在不算备份成功。
7. RustFS 使用 latest 标签，不能到新机盲拉 latest 当作同版本。建议保存已验证的 MySQL/RustFS及所需应用镜像（docker image save -o 指定归档 实际镜像引用），新机 docker image load 后核对 ID，并在迁移专用 Compose 覆盖中固定准确镜像；跨 CPU 架构不能假设可直接运行。
8. 携带 AGENTS.md、PROJECT_MEMORY.md、二开台账、全部相关 plans、中文手册、脚本及本文件。旧机保留作回滚，不删除代码/数据库/卷/备份；切换后旧机应用不得继续接收写入或执行同一批任务。

## 3. 新电脑：安装与磁盘安排

- 安装 Git、Docker Desktop，使用 WSL2 后端和 Linux containers。仅容器化运行不要求宿主机另装 Python、Node.js、pnpm、MySQL或Redis；本地开发时再装匹配锁文件的开发工具。
- WSL/虚拟化安装、BIOS/系统功能调整可能要求管理员权限和重启，按官方说明操作，不执行旧教程里的强制注销 WSL 发行版或删除虚拟磁盘命令。
- Docker 数据盘先设置到 E:\Docker\DockerData（新机无 E 盘则选择足够空间的实际目录），再拉取/构建大镜像。Docker Desktop 程序目录与 Docker 数据磁盘是两项设置；不要手动剪切运行中的 VHDX。
- 官方安装要求按新机系统核对：[Windows 安装](https://docs.docker.com/desktop/setup/install/windows-install/)、[WSL2 与数据位置](https://docs.docker.com/desktop/features/wsl/)。本项目 secure-local 使用 !override，需要 [Compose 2.24.4 或以上](https://docs.docker.com/reference/compose-file/merge/)。
- Docker 显示 Engine running 后检查 git --version、docker version、docker compose version。找不到 docker 时使用新机实际安装位置，不默认旧机的 E:\Docker\Desktop 一定存在。
- 检查 7788/8000/3306/6380/9000/9001 端口和磁盘空间。优先保留既有默认端口；若改变前后端端口，同步 BACKEND_URL、CORS 与脚本 HTTP 检查地址。secure-local 默认仅监听127.0.0.1，不为方便访问直接开放公网。

## 4. 取得正确代码与配置

目标目录必须为空且未部署业务。示例从个人仓库取二开，不从作者 main 替代：

~~~powershell
git clone --branch local/stable-codex-0718 https://github.com/15802964985/Jellyfish.git E:\JellyfishNew
Set-Location E:\JellyfishNew
git rev-parse HEAD
git status --short
~~~

核对 HEAD 与迁移包登记 SHA。若分支后来前进，先在独立恢复分支检出登记 SHA，不能 reset 丢掉现有修改。个人账号/分支改变时相应核实 Git 远端及 Push 脚本固定目标；GitHub 登录在新机重新完成，不复制浏览器密码或把令牌写入 URL。

检查文件齐全：两份 Compose、两个 local Dockerfile、scripts/windows、AGENTS.md、PROJECT_MEMORY.md 和台账。克隆不会带 .env。

- A：从 deploy/compose/.env.example 复制为 .env（仅目标不存在时），通过本地编辑器填写；示例 change-me/rustfsadmin 不可作为正式密码。
- B：从受保护迁移包恢复与该代码版本匹配的配置，逐项校对主机路径/端口/代理，保留 bucket 和关联信息。不要打印密钥或上传 Git。
- 必填/核对：MYSQL_ROOT_PASSWORD、MYSQL_DATABASE、MYSQL_USER、MYSQL_PASSWORD、REDIS_PASSWORD、RUSTFS_ACCESS_KEY、RUSTFS_SECRET_KEY、S3_BUCKET_NAME、BACKEND_URL；本机通常 BACKEND_URL=http://127.0.0.1:8000，REDIS_PORT=6380。
- 容器访问数据库与Redis使用 mysql:3306、redis:6379，不填旧电脑局域网IP或容器内部127.0.0.1。CELERY_BROKER_URL 没有特殊需要则留空，避免覆盖自动构造的地址。
- 当前 Compose 直接拼接 MYSQL_PASSWORD 到数据库 URL；新密码优先用密码管理器生成足够长的随机字母数字，避免 @、:、/、#、$ 等转义歧义。已有复杂密码应核实 URL 编码和 Compose 插值，不擅自改变服务端密码。
- git check-ignore deploy/compose/.env 应显示被忽略；忽略规则不保护已经跟踪的密钥。不要公开 docker compose config 的完整输出。

## 5. 定义新机部署命令，先构建、只启动数据服务

以下步骤都在同一 PowerShell 窗口执行。函数只是遇错停止，不自动回滚。

~~~powershell
Set-Location E:\JellyfishNew
$ComposeFiles = @(
  '--project-name', 'jellyfish',
  '--project-directory', 'E:\JellyfishNew\deploy\compose',
  '--env-file', 'E:\JellyfishNew\deploy\compose\.env',
  '-f', 'E:\JellyfishNew\deploy\compose\docker-compose.yml',
  '-f', 'E:\JellyfishNew\deploy\compose\docker-compose.secure-local.yml'
)
function Invoke-JellyfishCompose {
  param([Parameter(ValueFromRemainingArguments=$true)][string[]]$ComposeArguments)
  & docker compose @ComposeFiles @ComposeArguments
  if ($LASTEXITCODE -ne 0) { throw 'Compose失败，请停止并排查，勿继续后续步骤' }
}
Invoke-JellyfishCompose config --quiet
Invoke-JellyfishCompose build backend-migrate backend-seed-system-data backend celery-worker celery-beat front
Invoke-JellyfishCompose up -d --no-deps mysql redis
Invoke-JellyfishCompose ps -a
~~~

需要匹配旧机镜像时，在 $ComposeFiles 最后追加经过核实的镜像覆盖文件；先导入镜像再操作。构建使用锁文件，不以升级依赖解决迁移问题。registry或构建失败先停下来排查，不能绕过 secure-local 安全覆盖。

等待 mysql/redis healthy。此时不要启动 backend、worker、beat、front。Redis 队列不跨机复制：恢复队列有重复执行/计费风险；数据库中待执行任务/outbox仍可能恢复派发，应用启动前必须审查。

## 6A. 全新空库

仅适用于确认不要旧数据的 A 路径。启动新 RustFS，然后转第7节迁移建表：

~~~powershell
Invoke-JellyfishCompose up -d --no-deps rustfs
~~~

不要期待旧模型账户、剧本或文件出现；它们需要重新创建、上传和配置。

## 6B. 恢复旧数据（不要先运行迁移/seed）

先核对目标数据库为空、目标卷为空、MySQL 与 RustFS 版本兼容。以下恢复会写目标库/卷，须确认准确目标且不存在需保留业务数据。有疑问就停止，不清库重试。

SQL 归档在新机受保护目录，例如 E:\JellyfishTransfer\jellyfish-transfer.sql.gz。仅适用于第2节所述“业务库SQL备份”，不适用于未知来源或包含系统库的脚本：

~~~powershell
Invoke-JellyfishCompose cp E:\JellyfishTransfer\jellyfish-transfer.sql.gz mysql:/tmp/jellyfish-transfer.sql.gz
Invoke-JellyfishCompose exec -T mysql sh -lc 'gzip -dc /tmp/jellyfish-transfer.sql.gz > /tmp/jellyfish-transfer.sql && mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < /tmp/jellyfish-transfer.sql'
~~~

使用容器内解压/输入重定向，避免 Windows PowerShell 5.1 管道将 SQL 转码。恢复报错不得接着迁移/启动，保留现场定位。

RustFS：先只创建不启动容器，让 Compose 创建正确命名卷：

~~~powershell
Invoke-JellyfishCompose create --no-deps rustfs
docker volume inspect jellyfish_rustfs_data --format '{{.Name}}'
if ($LASTEXITCODE -ne 0) { throw '目标卷不存在' }
~~~

确认新机 RustFS 未运行、卷名及归档匹配、卷确实为空；验证归档来自自己的受信备份，无绝对路径或 .. 路径成员。再使用可信且已核实的 alpine 工具镜像恢复完整归档：

~~~powershell
docker run --rm --mount type=volume,source=jellyfish_rustfs_data,target=/target --mount type=bind,source=E:\JellyfishTransfer,target=/backup,readonly alpine sh -lc 'test -z "$(ls -A /target)" && tar -xzf /backup/rustfs-data.tar.gz -C /target'
if ($LASTEXITCODE -ne 0) { throw '对象恢复失败或卷非空，禁止继续启动' }
Invoke-JellyfishCompose up -d --no-deps rustfs
~~~

不要覆盖非空卷、不要用 rm 清空后重试。需要换 bucket 或密钥时先完成受控映射/服务端配置；不要改对象键或重新上传产生新ID替代数据库原引用。

核对恢复后的数据库 revision、关键表计数、RustFS桶/对象数量与抽样文件。审查任务、outbox及历史运行状态，无明确恢复策略不得启动 Worker/Beat；取消中不等于已安全结束，不直接批量改成功。

## 7. 迁移、系统模板与首次应用启动

确认 A 空库或 B 已完整恢复，代码 revision 与数据库可兼容。旧版本迁移先隔离验证，禁止跳过未知版本或手动 stamp head 掩盖缺表。

~~~powershell
Invoke-JellyfishCompose run --rm --no-deps backend-migrate
Invoke-JellyfishCompose run --rm --no-deps backend-seed-system-data
Invoke-JellyfishCompose up -d --no-deps --no-build backend front
~~~

迁移负责建表/升级，seed 写系统数据；每条成功才继续。run --rm 会移除一次性容器，因此 ps 中没有 migrate/seed 容器不代表失败；记录其退出码和迁移结果。不要为了出现 Exited(0) 再运行全栈 up。

先核对 API、页面、项目/模型配置和抽样素材。确认待执行任务/outbox已按迁移计划处理，才启动调度：

~~~powershell
Invoke-JellyfishCompose up -d --no-deps --no-build celery-worker celery-beat
Invoke-JellyfishCompose ps -a
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:7788/
~~~

启动 worker/beat 可能继续派发数据库待执行任务，不只是健康检查。恢复期间禁止新旧电脑同时运行同一逻辑任务。

## 8. 验收、日常接管与回滚

- 七个常驻容器归属当前根目录、服务状态正常；mysql/redis healthy，worker可用，beat调度正常。
- schema revision 与实际代码一致；项目/章节/资产/模型/任务等关键表数量合理，系统模板正常且用户模板未丢。
- 图片预览、视频播放/下载、音频试听、文档与未关联素材查询正常；不能只检查文件表条数。
- B：旧项目与模型/默认选择仍在，原参考素材可定位；更新需要依赖原机IP的旧绝对URL时制定修复，不批量猜测替换。
- A：先创建供应商和模型，检查准确地域/套餐/权限，再完成最小业务流程。真实模型请求需要单独费用/外发同意；连接测试与官网用量不是成片验收。
- 运行三项 -Preview 核对根目录脚本；首次部署前缺容器会失败，部署完成后才应通过。以后日常只用 Start/Stop；改 .env、更新代码仍走定向部署。
- 更新 PROJECT_MEMORY.md 的实际电脑路径、分支/SHA、部署镜像、数据位置、schema与待办；同步台账、手册。新对话先读 AGENTS.md 与项目记忆。
- 新机验收失败：停止新机应用，保留现场与备份；旧机保持冻结状态，确认没有新机独有写入或完成任务后再决定回退。不能直接双机继续运行。
- 成功观察后，再列精确旧数据/备份路径请求人工批准清理；不自动删旧电脑或 Docker 卷。

## 9. 常见卡点

- 无法访问个人仓库：重新登录 GitHub，或使用经过校验的 Git bundle/工作树迁移包；作者仓库不能替代未推送二开。
- MySQL Access denied：核对新库初始化凭据、应用连接和数据库用户授权；修改 .env 不会改变已经初始化的数据卷账户。
- 素材丢失：核对是否只恢复 SQL、bucket 名称/对象卷是否匹配；不通过重建空桶冒充恢复。
- 无法启动脚本：核对七个容器是否已首次创建、Compose working_dir 是否指向当前代码目录；不删除数据容器修标签。
- 构建下载失败：先核实镜像、代理、证书、平台；不要关闭安全检查或自动改成未经核验的镜像源。
