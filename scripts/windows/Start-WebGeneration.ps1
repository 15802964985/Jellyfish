# 本机网页执行器：一个窗口对应一个账号，浏览器使用独立登录资料。
param([string]$AccountId)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (-not $AccountId) { $AccountId = Read-Host '请输入 Jellyfish 网页平台账号页面中的账号编号' }
if ($AccountId -notmatch '^[a-zA-Z0-9_-]{1,64}$') { throw '账号编号格式不正确' }
$configPath = Join-Path $projectRoot 'local-browser/runner-config.json'
if (-not (Test-Path -LiteralPath $configPath)) { throw '尚未配置本机执行器连接，请先完成服务部署配置。' }
Push-Location $projectRoot
try {
    # 仅连接本机后端；首次使用此账号会打开独立 Edge，用户自行登录。
    # 关闭窗口不代表取消远端生成，重新运行会恢复同一任务而非重新提交。
    & node 'scripts/browser-runner/worker.mjs' $AccountId
    if ($LASTEXITCODE -ne 0) { throw '执行器停止，请查看上方错误；不要在豆包重复提交。' }
} finally { Pop-Location }