param([switch]$NoOpen)
$ErrorActionPreference = 'Stop'
# Docker emits UTF-8 even when a Windows CMD window starts with code page 936.
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

# Read only Docker inventory. Never capture container environment variables or mount credentials.
function Read-DockerJson([string[]]$Arguments) {
    $result = & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Docker 查询失败，请确认 Docker Desktop 已启动。旧清单不会被覆盖。' }
    if ($Arguments -contains '--format') { return @($result | ForEach-Object { $_ | ConvertFrom-Json }) }
    return ($result -join "`n" | ConvertFrom-Json)
}

# Explain known project image families; unknown images remain explicitly unclassified.
function Get-ImagePurpose([string[]]$Tags) {
    $name = $Tags -join ' '
    switch -Regex ($name) {
        'jellyfish-front:' { return '网页界面服务：提供 Jellyfish 页面和静态资源' }
        'jellyfish-backend-migrate:' { return '数据库结构升级工具，部署时一次性执行' }
        'jellyfish-backend-seed-system-data:' { return '系统基础数据初始化工具，一次性执行' }
        'jellyfish-backend-init-db:' { return '历史数据库初始化工具' }
        'jellyfish-backend:' { return '后端业务接口：项目、资产、文件和生成业务' }
        'jellyfish-celery-worker:' { return '后台任务执行：图片、视频生成与其他异步任务' }
        'jellyfish-celery-beat:' { return '定时任务调度：触发系统计划任务' }
        '(^|/)mysql:' { return 'MySQL 业务数据库运行环境' }
        '(^|/)redis:' { return 'Redis 缓存和后台任务消息队列' }
        'rustfs/rustfs:' { return 'RustFS 对象存储：保存图片、视频等素材' }
        '(^|/)python:' { return 'Python 后端构建基础环境' }
        '(^|/)node:' { return 'Node.js 前端编译基础环境' }
        '(^|/)nginx:' { return 'Nginx 网页服务器基础环境' }
        default { return '用途待核对，不根据名称猜测是否可删除' }
    }
}
try {
    $context = (& docker context show) -join ''
    if ($LASTEXITCODE -ne 0) { throw '无法读取 Docker context。' }
    $ids = @(& docker image ls -q --no-trunc | Sort-Object -Unique)
    if ($LASTEXITCODE -ne 0) { throw '无法读取镜像，请启动 Docker Desktop 后重试。' }
    $containers = @(& docker container ls -aq)
    if ($LASTEXITCODE -ne 0) { throw '容器清单查询失败，旧快照保留。' }
    # Container ls emits JSON lines. Fetch only names, immutable image IDs and runtime status.
    $refs = @()
    foreach ($container in $containers) {
        $ref = Read-DockerJson @('container','inspect','--format','{"name":{{json .Name}},"image":{{json .Image}},"status":{{json .State.Status}}}', $container)
        $refs += $ref
    }
    $rows = @()
    foreach ($id in $ids) {
        $item = @(Read-DockerJson @('image','inspect',$id))[0]
        $tags = @($item.RepoTags | Where-Object { $_ -ne '<none>:<none>' })
        $used = @($refs | Where-Object { $_.image -eq $item.Id })
        $running = @($used | Where-Object { $_.status -eq 'running' }).Count
        $status = if ($running) { '运行中引用' } elseif ($used.Count) { '非运行容器引用' } else { '未被容器引用' }
        $names = $tags -join ' '
        $reason = if ($used.Count) { '有容器引用，保留；停止状态也不代表可以删除。' }
          elseif ($names -match 'rollback-generation-governance-20260909') { '迁移边界回滚版本，按项目台账保留。' }
          elseif ($names -match 'rollback-preparation-edit-20260909') { '已登记的回滚版本，按项目台账保留。' }
          elseif ($names -match 'rollback') { '回滚候选，需核对对应版本及台账后决定。' }
          elseif ($names -match '(^|/)(python|node|nginx):') { '构建基础镜像；可重新下载，保留可减少后续构建等待。' }
          elseif ($names -match 'jellyfish-backend-(migrate|seed-system-data|init-db):') { '部署或历史初始化工具；无引用不代表已废弃，使用前需核对版本。' }
          elseif (-not $tags.Count) { '无标签且无容器引用，可列入清理候选，仍需核对构建用途。' }
          else { '暂无法确认保留原因，需人工核对；不自动删除。' }
        $rows += [ordered]@{id=$item.Id;tags=$tags;purpose=(Get-ImagePurpose $tags);status=$status;references=@($used | ForEach-Object { ($_.name.TrimStart('/')) + ' · ' + $_.status });reason=$reason;size=[math]::Round($item.Size/1MB,1);created=$item.Created}
    }
    $data = [ordered]@{collected=(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz');context=$context;rows=@($rows);unresolved=@($refs | Where-Object { $_.image -notin @($rows | ForEach-Object { $_.id }) } | ForEach-Object { $_.name.TrimStart('/') })}
    # Escape HTML-significant characters before embedding JSON in a script element.
    $json = ConvertTo-Json -InputObject $data -Depth 8 -Compress
    $json = $json.Replace('<','\u003c').Replace('>','\u003e').Replace('&','\u0026')
    $template = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'docker-images.template.html'))
    $output = Join-Path $root 'local-reports/docker-images.html'
    [IO.Directory]::CreateDirectory((Split-Path $output -Parent)) | Out-Null
    # Publish JSON atomically for the read-only web view; never expose the reports directory.
    $jsonPath = Join-Path $root 'local-reports/docker-inventory.json'
    [IO.File]::WriteAllText(($jsonPath + '.tmp'), $json, [Text.UTF8Encoding]::new($false))
    if ([IO.File]::Exists($jsonPath)) { [IO.File]::Replace(($jsonPath + '.tmp'), $jsonPath, [NullString]::Value) } else { [IO.File]::Move(($jsonPath + '.tmp'), $jsonPath) }
    [IO.File]::WriteAllText($output, $template.Replace('__INVENTORY_JSON__',$json), [Text.UTF8Encoding]::new($false))
    Write-Host "已更新中文镜像清单：$output"
    if (-not $NoOpen) { Start-Process -FilePath $output }
} catch {
    Write-Error $_
    exit 1
}
