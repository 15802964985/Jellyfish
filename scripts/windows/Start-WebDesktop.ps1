# Start the outbound-only Windows helper silently. The web UI supplies account IDs automatically.
param([switch]$RegisterLogon,[switch]$KeepAlive,[switch]$Supervisor)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$config=Join-Path $projectRoot 'local-browser/runner-config.json'
if(-not(Test-Path -LiteralPath $config)){Write-Host '网页本机助手未配置，暂不启动。';return}
$script=Join-Path $projectRoot 'scripts/browser-runner/desktop-host.mjs'
# Launch diagnostics used to live only in the transient console window, so a double-click that
# failed silently left nothing on disk. Every step below is mirrored to this log.
$launchLog=Join-Path $projectRoot 'local-browser/logs/desktop-host-launch.log'
function Write-LaunchLog([string]$line){try{[IO.File]::AppendAllText($launchLog,"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $line`r`n")}catch{}}
Write-LaunchLog "=== launcher invoked (RegisterLogon=$RegisterLogon KeepAlive=$KeepAlive) user=$env:USERNAME ==="
# Resolve node: PATH first, then known install locations, so a PATH change can never abort the launch silently.
$node=$null
try{$node=(Get-Command node -ErrorAction Stop).Source}catch{}
if(-not $node){foreach($c in @('E:\work\NVMinstall\nodejs\node.exe',"$env:ProgramFiles\nodejs\node.exe")){if(Test-Path -LiteralPath $c){$node=$c;break}}}
if(-not $node){Write-LaunchLog 'FAILED: node.exe not found on PATH or known locations';Write-Host '未找到 node.exe，请确认 Node.js 已安装并在 PATH 中。';return}
Write-LaunchLog "node resolved: $node"

# 优先使用 runner-config.json 中的 backend_url，否则回退本地默认端口。
$backend='http://127.0.0.1:8000'
try{$cfg=Get-Content -LiteralPath $config -Raw|ConvertFrom-Json;if($cfg.backend_url){$backend=$cfg.backend_url}}catch{}

function Get-DesktopProcess {
    Get-CimInstance Win32_Process -Filter "name='node.exe'" | Where-Object {$_.CommandLine -and $_.CommandLine.Contains($script)}
}

function Get-HelperState {
    # 返回 'online' | 'offline' | 'unknown'（后端不可达）。
    # 服务端 online 反映本机助手心跳（最近 30 秒上报），是判断是否僵死的权威信号。
    try{
        $r=Invoke-RestMethod -Uri ($backend.TrimEnd('/')+'/api/v1/studio/web-generation/desktop/status') -TimeoutSec 3 -ErrorAction Stop
        if($r.PSObject.Properties.Match('online').Count -and $r.online){return 'online'}else{return 'offline'}
    }catch{return 'unknown'}
}

function Start-DesktopHelper {
    try{
        $p=Start-Process -FilePath $node -ArgumentList @(('"'+$script+'"')) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
        Start-Sleep -Seconds 3
        # A spawn that dies instantly used to look like success; verify before claiming startup.
        if($p.HasExited){Write-LaunchLog "FAILED: node exited immediately code=$($p.ExitCode)";Write-Host '助手进程启动后立即退出，请查看 local-browser/logs/desktop-host.log'}
        else{Write-LaunchLog "STARTED pid=$($p.Id)";Write-Host "本机助手已启动 pid=$($p.Id)"}
    }catch{Write-LaunchLog "FAILED: $($_.Exception.Message)";Write-Host "启动失败：$($_.Exception.Message)"}
}

function Assert-Running {
    # 心跳新鲜度校验：代替原"进程存在即跳过"。进程在但服务端判定离线（僵死）→ 强杀并重启。
    $existing=Get-DesktopProcess
    if(-not $existing){Write-LaunchLog 'no running desktop-host found -> spawning';Start-DesktopHelper;return}
    $proc=$existing|Select-Object -First 1
    # 刚启动的进程尚未完成首次心跳（desktop-host 每 2.5 秒上报，服务端 30 秒窗口），不误杀。
    $age=(Get-Date)-$proc.CreationDate
    if($age.TotalSeconds -lt 40){Write-LaunchLog "existing host pid=$($proc.ProcessId) is fresh (age=$([int]$age.TotalSeconds)s), skip";return}
    $state=Get-HelperState
    # 后端不可达时无法确认是否真僵死，保留原进程等待重连，避免误杀已认证窗口。
    if($state -ne 'offline'){Write-LaunchLog "existing host pid=$($proc.ProcessId) state=$state, keep";return}
    # 进程存在、已超宽限期、后端可达却判定离线 → 视为僵死，强杀后重启。
    Write-LaunchLog "existing host pid=$($proc.ProcessId) is zombie (backend offline), restarting"
    Write-Host '检测到网页本机助手进程僵死（进程存在但服务端判定离线），正在重启。'
    try{$existing|ForEach-Object{Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}}catch{}
    Start-Sleep -Seconds 2
    Start-DesktopHelper
}

if($RegisterLogon){
    # Per-user startup entry needs no administrator account; credentials remain in local-browser.
    $startup=[Environment]::GetFolderPath('Startup')
    $shell=New-Object -ComObject WScript.Shell
    $link=$shell.CreateShortcut((Join-Path $startup 'Jellyfish 网页本机助手.lnk'))
    $link.TargetPath=(Get-Command powershell.exe).Source
    $link.Arguments='-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$PSCommandPath+'" -KeepAlive'
    $link.WorkingDirectory=$projectRoot
    $link.WindowStyle=7
    $link.Description='Jellyfish 网页账号登录与执行器启动助手（含自愈）'
    $link.Save()
    Write-LaunchLog 'logon autostart shortcut registered'
}

# Registration and one-shot startup always finish; only a separate hidden supervisor loops.
if(($KeepAlive -or $RegisterLogon) -and -not $Supervisor){
    $existingSupervisor=Get-CimInstance Win32_Process -Filter "name='powershell.exe'" | Where-Object {$_.CommandLine -and $_.CommandLine.Contains($PSCommandPath) -and $_.CommandLine.Contains('-Supervisor')}
    if(-not $existingSupervisor){
        Start-Process -FilePath (Get-Command powershell.exe).Source -ArgumentList @('-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-Supervisor') -WorkingDirectory $projectRoot -WindowStyle Hidden
    }
    Write-LaunchLog 'supervisor requested; launcher returning'
    return
}

if($Supervisor){
    # A named mutex prevents simultaneous double-clicks from creating competing guardians.
    $sha=[Security.Cryptography.SHA256]::Create()
    $key=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot)))).Replace('-','')
    $mutex=New-Object Threading.Mutex($false,('Local\JellyfishDesktop-'+$key))
    $owned=$false
    try{
        try{$owned=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$owned=$true}
        if(-not $owned){return}
        while($true){
            try{Assert-Running}catch{Write-LaunchLog ('supervisor check failed: '+$_.Exception.Message)}
            Start-Sleep -Seconds 30
        }
    }finally{if($owned){$mutex.ReleaseMutex()};$mutex.Dispose();$sha.Dispose()}
}else{Assert-Running}
