<#
.SYNOPSIS
Jellyfish Windows 日常启动、停止及个人分支提交入口。
.DESCRIPTION
从脚本位置定位仓库；启停仅操作现有七个常驻容器，不执行迁移、seed 或构建。
Push 提交全部未忽略改动，校验个人仓库及固定分支，不自动合并或强制推送。
.PARAMETER Action
Start / Stop / Push。
.PARAMETER Preview
只显示执行计划并做只读检查；不启动、停止、暂存、提交或推送。
.PARAMETER Message
Push 使用的提交说明；未指定时采用带时间的默认说明。
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Start', 'Stop', 'Push')]
    [string]$Action,
    [switch]$Preview,
    [switch]$Yes,
    [string]$Message = ('chore: save Jellyfish changes ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$expectedBranch = 'local/stable-codex-0718'
$expectedRemote = 'https://github.com/15802964985/Jellyfish.git'
$services = @('mysql', 'redis', 'rustfs', 'backend', 'celery-worker', 'celery-beat', 'front')

# 统一执行原生命令：PowerShell 5.1 不会因非零退出码自动抛错，必须主动检查。
function Invoke-Native {
    param([string]$Program, [string[]]$Arguments)
    # Git 在双击 CMD 的交互终端中可能自动打开分页器，导致停在冒号提示。
    # 仅本次 Git 调用禁用分页；不改用户全局 Git 或换行符配置。
    if ($Program -eq 'git') {
        & $Program --no-pager @Arguments
    } else {
        & $Program @Arguments
    }
    if ($LASTEXITCODE -ne 0) {
        throw "$Program 执行失败（退出码 $LASTEXITCODE），已停止后续操作。"
    }
}

# 使用 Compose 标签定位容器，避免写死容器编号，也不因移动仓库目录而隐式创建新服务。
# 验证标签中的生产目录；目录不一致时先人工核实运行归属，禁止误停另一套部署。
function Get-ServiceContainer {
    param([string]$Service)
    $ids = @(Invoke-Native 'docker' @('ps', '-aq', '--filter', 'label=com.docker.compose.project=jellyfish', '--filter', "label=com.docker.compose.service=$Service"))
    if ($ids.Count -ne 1) { throw "服务 $Service 对应 $($ids.Count) 个容器，需要恰好一个现有容器。" }
    $details = (Invoke-Native 'docker' @('inspect', '--format', '{{json .Config.Labels}}', $ids[0])) | ConvertFrom-Json
    $configuredDir = [string]$details.'com.docker.compose.project.working_dir'
    $localComposeDir = [IO.Path]::GetFullPath((Join-Path $projectRoot 'deploy/compose'))
    if (-not $configuredDir -or [IO.Path]::GetFullPath($configuredDir) -ne $localComposeDir) {
        # 当前 RustFS 是迁移前保留的数据容器。仅当业务卷和当前后端网络均匹配时接受旧标签。
        if ($Service -ne 'rustfs') { throw "服务 $Service 的 Compose 目录为 $configuredDir，与当前仓库不一致。" }
        $backendId = Get-ServiceContainer 'backend'
        $mounts = @((Invoke-Native 'docker' @('inspect', '--format', '{{json .Mounts}}', $ids[0])) | ConvertFrom-Json)
        $hasBusinessVolume = @($mounts | Where-Object { $_.Type -eq 'volume' -and $_.Name -eq 'jellyfish_rustfs_data' -and $_.Destination -eq '/data' }).Count -eq 1
        $rustNetworks = (Invoke-Native 'docker' @('inspect', '--format', '{{json .NetworkSettings.Networks}}', $ids[0])) | ConvertFrom-Json
        $backendNetworks = (Invoke-Native 'docker' @('inspect', '--format', '{{json .NetworkSettings.Networks}}', $backendId)) | ConvertFrom-Json
        $rustNetworkIds = @($rustNetworks.PSObject.Properties | ForEach-Object { $_.Value.NetworkID })
        $sharedNetwork = @($backendNetworks.PSObject.Properties | Where-Object { $_.Value.NetworkID -in $rustNetworkIds }).Count -gt 0
        if (-not $hasBusinessVolume -or -not $sharedNetwork) { throw '旧目录 RustFS 未通过业务卷/后端网络检查，已停止。' }
        Write-Host "RustFS 保留历史目录标签 $configuredDir；业务卷及当前后端网络已核对。" -ForegroundColor Yellow
    }
    return [string]$ids[0]
}

# MySQL/Redis 有健康检查；其他服务至少确认容器保持运行。
# 这只是运行检查，不能代替浏览器、真实模型生成或成片验收。
function Wait-Service {
    param([string]$Container, [string]$Service, [bool]$RequireHealth = $false)
    $deadline = (Get-Date).AddSeconds(120)
    do {
        $state = (Invoke-Native 'docker' @('inspect', '--format', '{{json .State}}', $Container)) | ConvertFrom-Json
        $ready = $state.Status -eq 'running'
        if ($RequireHealth) {
            if (-not $state.PSObject.Properties['Health']) { throw "服务 $Service 缺少预期健康检查，不能确认就绪。" }
            $ready = $ready -and $state.Health.Status -eq 'healthy'
        }
        if ($ready) { return }
        if ((Get-Date) -ge $deadline) { throw "等待 $Service 就绪超时；保留现状，请检查该容器。" }
        Start-Sleep -Seconds 2
    } while ($true)
}

# 在最终变更前要求确认；自动化调用须显式传入 -Yes，Preview 永不询问或变更。
function Confirm-Action {
    param([string]$Prompt)
    if (-not $Yes -and (Read-Host "$Prompt 输入 YES 继续，其他输入取消") -cne 'YES') {
        throw '用户取消，尚未执行本次变更。'
    }
}

# 从本机检查实际页面/API，容器 running 不能代替应用就绪；无生成或计费调用。
function Wait-Http {
    param([string]$Url)
    $deadline = (Get-Date).AddSeconds(120)
    do {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) { return }
        } catch { }
        if ((Get-Date) -ge $deadline) { throw "HTTP 就绪检查超时：$Url；容器可能已启动，请诊断，不自动回滚。" }
        Start-Sleep -Seconds 2
    } while ($true)
}

# 阻止常见密钥、环境文件、备份和运行产物进入提交。
# 按文件名检查只是基础保护，不是完整的源码内容密钥扫描。
function Assert-PublishablePaths {
    param([string[]]$Paths)
    foreach ($path in $Paths) {
        $normalized = $path.Replace('\', '/')
        $leaf = ($normalized -split '/')[-1]
        $environmentFile = $leaf -match '^\.env($|\.)' -and $leaf -ne '.env.example'
        $privatePath = $normalized -match '(^|/)(backups|node_modules|\.venv|\.codex-test-tmp|\.test-tmp[^/]*)(/|$)'
        $privateFile = $leaf -match '(?i)(\.(pem|key|p12|pfx|db|sqlite|sqlite3|sql\.gz)$|^id_(rsa|ed25519)$)'
        if ($environmentFile -or $privatePath -or $privateFile) { throw "发现不应发布的文件：$path。请检查 Git 跟踪和忽略规则。" }
    }
}

# 索引锁可能属于仍在运行的 Git；只诊断，不按锁龄自动删除或继续提交。
function Assert-GitIndexUnlocked {
    $lockName = [string](Invoke-Native 'git' @('rev-parse', '--git-path', 'index.lock'))
    if (-not $lockName) { throw '无法确定 Git 索引锁位置，已停止。' }
    $lockPath = if ([IO.Path]::IsPathRooted($lockName)) { $lockName } else { Join-Path $projectRoot $lockName }
    if (Test-Path -LiteralPath $lockPath) {
        $lock = Get-Item -LiteralPath $lockPath
        throw "Git 索引被锁定：$lockPath（最后更新：$($lock.LastWriteTime)）。请先等待其他 Git 操作完成并关闭旧提交窗口；若操作已异常退出，核实没有 Git 进程后再备份移走残留锁。本脚本不会自动删除锁，尚未执行本轮暂存、提交或推送。"
    }
}

try {
    Set-Location -LiteralPath $projectRoot
    Write-Host "项目目录：$projectRoot"
    if ($Preview) { Write-Host '预览模式：只读检查，不执行变更。' -ForegroundColor Yellow }

    if ($Action -eq 'Push') {
        $gitRoot = [string](Invoke-Native 'git' @('rev-parse', '--show-toplevel'))
        if ([IO.Path]::GetFullPath($gitRoot) -ne $projectRoot) { throw 'Git 根目录与脚本所在项目不一致。' }
        $branch = [string](Invoke-Native 'git' @('branch', '--show-current'))
        if ($branch -ne $expectedBranch) { throw "当前分支为 $branch；本脚本仅提交 $expectedBranch，不自动切分支。" }
        $remoteUrls = @(Invoke-Native 'git' @('remote', 'get-url', '--push', '--all', 'origin'))
        if ($remoteUrls.Count -ne 1 -or $remoteUrls[0] -ne $expectedRemote) { throw 'origin 推送地址不是预期个人仓库。' }
        Assert-GitIndexUnlocked
        $conflicts = @(Invoke-Native 'git' @('diff', '--name-only', '--diff-filter=U'))
        if ($conflicts.Count -gt 0) { throw '存在未解决的合并冲突，请先处理。' }
        # 同时检查已跟踪及未忽略新文件，防止已跟踪密钥绕过 .gitignore。
        $paths = @(Invoke-Native 'git' @('-c', 'core.quotepath=false', 'ls-files', '--cached', '--others', '--exclude-standard'))
        Assert-PublishablePaths $paths
        Write-Host "目标：$expectedRemote / $expectedBranch"
        Invoke-Native 'git' @('-c', 'core.quotepath=false', 'status', '--short')
        Invoke-Native 'git' @('-c', 'core.quotepath=false', 'diff', '--name-status')
        Write-Host '计划：git add -A → 差异检查 → commit（有变更时）→ 普通 push。'
        Write-Host '提交前应已完成测试、LC/PL 语义审查及文档同步；脚本不会代替这些工作。'
        if (-not $Preview) {
            Confirm-Action '即将提交全部未忽略改动并推送到上方个人分支。请确认已检查密钥、差异和二开文档。'
            Assert-GitIndexUnlocked
            Invoke-Native 'git' @('add', '-A')
            # add 后再扫描实际索引，防止预检查与暂存间新加入的敏感路径绕过检查。
            Assert-PublishablePaths @(Invoke-Native 'git' @('-c', 'core.quotepath=false', 'ls-files', '--cached'))
            Invoke-Native 'git' @('diff', '--cached', '--check')
            $staged = @(Invoke-Native 'git' @('diff', '--cached', '--name-only'))
            if ($staged.Count -gt 0) { Invoke-Native 'git' @('commit', '-m', $Message) }
            Invoke-Native 'git' @('push', '-u', 'origin', "HEAD:refs/heads/$expectedBranch")
            Write-Host '推送完成，精确 HEAD（用于台账追溯）：' -ForegroundColor Green
            Invoke-Native 'git' @('rev-parse', 'HEAD')
            Write-Host '请将本批代码 SHA 登记到台账；历史分批语义映射不能由脚本自动猜测。'
        }
    } else {
        if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
            $dockerBin = 'E:\Docker\Desktop\resources\bin'
            if (Test-Path -LiteralPath (Join-Path $dockerBin 'docker.exe')) { $env:Path = "$dockerBin;$env:Path" }
        }
        Invoke-Native 'docker' @('info', '--format', '{{.ServerVersion}}')
        $containers = @{}
        # 先核对完整清单，缺失或归属不符时，在任何启停动作之前失败。
        foreach ($service in $services) {
            $containers[$service] = Get-ServiceContainer $service
            Write-Host ("{0,-15} {1}" -f $service, $containers[$service])
        }
        if ($Action -eq 'Start') {
            Write-Host '计划：启动 MySQL/Redis/RustFS → 等待健康 → 启动后端/Worker/Beat/前端。'
            if (-not $Preview) {
                Invoke-Native 'docker' (@('start') + @($containers['mysql'], $containers['redis'], $containers['rustfs']))
                Wait-Service $containers['mysql'] 'mysql' $true
                Wait-Service $containers['redis'] 'redis' $true
                Wait-Service $containers['rustfs'] 'rustfs'
                foreach ($service in @('backend', 'celery-worker', 'celery-beat', 'front')) {
                    Invoke-Native 'docker' @('start', $containers[$service])
                    Wait-Service $containers[$service] $service
                }
                Wait-Http 'http://127.0.0.1:8000/health'
                Wait-Http 'http://127.0.0.1:7788/'
                & (Join-Path $PSScriptRoot 'Start-WebDesktop.ps1') -KeepAlive
                # HTTP 检查期间应用可能退出，成功前再次核对所有常驻容器。
                foreach ($service in $services) { Wait-Service $containers[$service] $service ($service -in @('mysql', 'redis')) }
                Write-Host '容器已启动。页面：http://127.0.0.1:7788；API：http://127.0.0.1:8000/docs' -ForegroundColor Green
            }
        } else {
            Write-Host '请在生成任务结束后停止；正在执行的模型请求可能仍在远端执行/计费。' -ForegroundColor Yellow
            Write-Host '计划：停止前端/API/Beat → Worker（最多等待120秒）→ 数据服务；保留容器和数据卷。'
            if (-not $Preview) {
                Confirm-Action '即将停止本机 Jellyfish。请先确认任务中心没有未结束任务；远端任务不会因此保证取消或停止计费。'
                Invoke-Native 'docker' (@('stop', '--time', '60') + @($containers['front'], $containers['backend'], $containers['celery-beat']))
                # Worker 停止之前保留数据库、消息服务和对象存储，给任务收尾留出时间。
                # 超时后 Docker 可能强制结束进程，因此不承诺正在运行的任务无损恢复。
                Invoke-Native 'docker' @('stop', '--time', '120', $containers['celery-worker'])
                Invoke-Native 'docker' (@('stop', '--time', '60') + @($containers['mysql'], $containers['redis'], $containers['rustfs']))
                Write-Host 'Jellyfish 已停止；容器、数据库与对象存储卷均保留。' -ForegroundColor Green
            }
        }
    }
    exit 0
} catch {
    Write-Host ("操作失败：" + $_.Exception.Message) -ForegroundColor Red
    Write-Host '后续步骤已停止；已完成的步骤不会自动回滚。可修复问题后重试。'
    exit 1
}
