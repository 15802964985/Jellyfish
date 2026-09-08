<# 用模拟 Git/Docker 验证实际入口，不操作真实服务或仓库。 #>
$ErrorActionPreference = 'Stop'
$source = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Jellyfish.ps1'))
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw '主脚本语法错误。' }
$native = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-Native' }, $true)
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('jellyfish-script-test-' + [guid]::NewGuid().ToString('N'))
$scriptDir = Join-Path $testRoot 'scripts/windows'
New-Item -ItemType Directory -Path $scriptDir -Force | Out-Null
$testScript = Join-Path $scriptDir 'Jellyfish.ps1'
$logFile = Join-Path $testRoot 'calls.txt'
$mock = @'
# 模拟 HTTP 与确认输入，禁止测试访问真实服务。
function Invoke-WebRequest {
    param($Uri, [switch]$UseBasicParsing, $TimeoutSec)
    if ('CASE' -eq 'http-fail') { throw 'Simulated HTTP failure' }
    return @{ StatusCode = 200 }
}
function Read-Host { param($Prompt) return 'NO' }
# 替换外部命令入口并记录参数；其余主脚本代码原样执行。
function Invoke-Native {
    param([string]$Program, [string[]]$Arguments)
    $commandText = $Program + ' ' + ($Arguments -join ' ')
    Add-Content -LiteralPath (Join-Path $projectRoot 'calls.txt') -Value $commandText
    if ($Program -eq 'git') {
        switch -Wildcard ($Arguments -join ' ') {
            'rev-parse --show-toplevel' { return $projectRoot }
            'branch --show-current' { return 'local/stable-codex-0718' }
            'remote get-url*' { if ('CASE' -eq 'wrong-remote') { return 'https://github.com/Forget-C/Jellyfish.git' }; return 'https://github.com/15802964985/Jellyfish.git' }
            'diff --name-only --diff-filter=U' { return }
            '*ls-files*' { if ('CASE' -eq 'secret' -or ('CASE' -eq 'staged-secret' -and $Arguments -notcontains '--others')) { return 'deploy/compose/.env' }; return 'backend/app/main.py' }
            'diff --cached --check' { if ('CASE' -eq 'diff-fail') { throw 'Simulated diff failure' }; return }
            'diff --cached --name-only' { return 'backend/app/main.py' }
            'rev-parse HEAD' { return ('a' * 40) }
            default { return }
        }
    }
    switch ($Arguments[0]) {
        'info' { return 'mock-docker' }
        'ps' { return ($Arguments[-1] -replace '^.*service=', '') }
        'inspect' {
            switch ($Arguments[2]) {
                '{{json .Config.Labels}}' { return (@{ 'com.docker.compose.project.working_dir' = (Join-Path $projectRoot 'deploy/compose') } | ConvertTo-Json -Compress) }
                '{{json .State}}' { if ('CASE' -eq 'missing-health') { return '{"Status":"running"}' }; return '{"Status":"running","Health":{"Status":"healthy"}}' }
                default { throw 'Unexpected inspect' }
            }
        }
        'stop' { if ('CASE' -eq 'stop-fail') { throw 'Simulated stop failure' }; return }
        'start' { return }
        default { throw 'Unexpected native call' }
    }
}
'@
# 独立子进程保留主入口的真实退出码、catch 和失败中止行为。
foreach ($case in @('start', 'stop', 'push', 'wrong-remote', 'secret', 'diff-fail', 'stop-fail', 'staged-secret', 'missing-health', 'http-fail', 'decline-push', 'decline-stop')) {
    $replacement = $mock.Replace('CASE', $case)
    $candidate = $source.Substring(0, $native.Extent.StartOffset) + $replacement + $source.Substring($native.Extent.EndOffset)
    if ($case -eq 'http-fail') { $candidate = $candidate.Replace('.AddSeconds(120)', '.AddSeconds(-1)') }
    [IO.File]::WriteAllText($testScript, $candidate, (New-Object System.Text.UTF8Encoding($true)))
    [IO.File]::WriteAllText($logFile, '')
    $action = if ($case -in @('start', 'missing-health', 'http-fail')) { 'Start' } elseif ($case -in @('stop', 'stop-fail', 'decline-stop')) { 'Stop' } else { 'Push' }
    $extra = @()
    if ($case -notlike 'decline-*') { $extra = @('-Yes') }
    $output = & powershell.exe -NoLogo -NoProfile -File $testScript -Action $action @extra 2>&1
    $code = $LASTEXITCODE
    $calls = [IO.File]::ReadAllText($logFile)
    $shouldPass = $case -in @('start', 'stop', 'push')
    if (($code -eq 0) -ne $shouldPass) { throw "场景 $case 退出码错误：$code；$output" }
    if ($case -eq 'start' -and $calls -notmatch '(?s)docker start mysql redis rustfs.*docker start backend.*docker start celery-worker.*docker start celery-beat.*docker start front') { throw '启动顺序错误' }
    if ($case -eq 'stop' -and $calls -notmatch '(?s)docker stop --time 60 front backend celery-beat.*docker stop --time 120 celery-worker.*docker stop --time 60 mysql redis rustfs') { throw '停止顺序错误' }
    if ($case -eq 'push' -and $calls -notmatch '(?s)git add -A.*git diff --cached --check.*git commit -m.*git push -u origin HEAD:refs/heads/local/stable-codex-0718') { throw '提交顺序错误' }
    if (-not $shouldPass -and $calls -match 'git push|docker stop --time 60 mysql') { throw '失败后仍执行后续变更' }
    if ($case -in @('secret', 'wrong-remote') -and $calls -match 'git add') { throw '保护检查失败后仍暂存文件' }
    if ($case -like 'decline-*' -and $calls -match 'git add|docker stop') { throw '取消确认后仍执行变更' }
    if ($case -eq 'staged-secret' -and $calls -match 'git commit|git push') { throw '索引敏感路径未阻止提交' }
    Write-Host "PASS $case"
}
# 只删除本测试明确创建的文件及空目录，不使用递归删除。
Remove-Item -LiteralPath $testScript, $logFile
Remove-Item -LiteralPath $scriptDir
Remove-Item -LiteralPath (Join-Path $testRoot 'scripts')
Remove-Item -LiteralPath $testRoot
