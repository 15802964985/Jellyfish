# 在独立资料目录中手工使用官网；本脚本不控制生成、验证码或下载按钮。
param([string]$AccountId,[switch]$Preview)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (-not $AccountId) { $AccountId=Read-Host '请输入网页平台账号页面中的账号编号' }
if ($AccountId -notmatch '^[a-zA-Z0-9_-]{1,64}$') { throw '账号编号格式不正确' }
$configPath=Join-Path $projectRoot 'local-browser/runner-config.json'
$config=if (Test-Path -LiteralPath $configPath) { Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
$backendUrl=if ($config -and $config.backend_url) { [uri]$config.backend_url } else { [uri]'http://127.0.0.1:8000' }
if ($backendUrl.Host -notin @('127.0.0.1','localhost') -or $backendUrl.Scheme -notin @('http','https')) { throw '只允许连接本机 Jellyfish' }
$accounts=Invoke-RestMethod -Uri ([uri]::new($backendUrl,'/api/v1/studio/web-generation/accounts')) -TimeoutSec 15
$account=@($accounts | Where-Object id -EQ $AccountId)
if ($account.Count -ne 1) { throw '找不到该账号，请先在 Jellyfish 登记' }
# 固定官方入口，绝不将后端返回的任意网址直接交给浏览器启动。
$entries=@{doubao='https://www.doubao.com/chat/';jimeng='https://jimeng.jianying.com/';kling='https://app.klingai.com/cn/';wanxiang='https://tongyi.aliyun.com/wan/';yuanbao='https://yuanbao.tencent.com/';hailuo='https://hailuoai.com/';zhipu='https://chatglm.cn/'}
$entry=$entries[$account[0].platform]
if (-not $entry) { throw '尚未核对该平台官方入口' }
$runtimeRoot=[IO.Path]::GetFullPath((Join-Path $projectRoot 'local-browser'))
$relative=if ($config -and $config.profiles -and $config.profiles.PSObject.Properties[$AccountId]) { [string]$config.profiles.PSObject.Properties[$AccountId].Value } else { "accounts/$AccountId/edge" }
$profilePath=[IO.Path]::GetFullPath((Join-Path $runtimeRoot $relative))
if (-not $profilePath.StartsWith($runtimeRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw '浏览器资料目录必须位于项目 local-browser 内' }
$edgePaths=@((Join-Path ${env:ProgramFiles(x86)} 'Microsoft/Edge/Application/msedge.exe'),(Join-Path $env:ProgramFiles 'Microsoft/Edge/Application/msedge.exe'))
$edge=@($edgePaths | Where-Object {Test-Path -LiteralPath $_}) | Select-Object -First 1
if (-not $edge) { throw '未找到 Microsoft Edge' }
Write-Host ('账号：'+$account[0].display_name+'；平台：'+$account[0].platform)
Write-Host '请在此资料目录中保持同一账号，按 Jellyfish 交接单操作；不要同时启动同账号自动执行器。'
if ($Preview) { Write-Host ('预览：'+$entry+'；资料目录：'+$profilePath); return }
# 此窗口供用户交互登录和创作，因此显式显示；不读取浏览器密码或Cookie。
Start-Process -FilePath $edge -ArgumentList @(('--user-data-dir="'+$profilePath+'"'),'--new-window',$entry)
