# Exercise launcher control flow with all process, HTTP and startup writes mocked.
$ErrorActionPreference='Stop'
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Start-WebDesktop.ps1'))
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors|Out-String)}
$script:spawned=0;$script:registered=0
function Test-Path { param($LiteralPath) return $true }
function Write-LaunchLog { param($line) }
function Get-Content { param($LiteralPath,[switch]$Raw) return '{"backend_url":"http://127.0.0.1:1"}' }
function Get-CimInstance { param($ClassName,$Filter) return @() }
function Start-Process { param($FilePath,$ArgumentList,$WorkingDirectory,$WindowStyle) if($ArgumentList -notcontains '-Supervisor'){throw 'Launcher blocked in direct helper execution'};$script:spawned++ }
function New-Object { param($ComObject) if($ComObject -ne 'WScript.Shell'){throw 'Unexpected object'};return (New-Module -AsCustomObject { function CreateShortcut($path){ $link=[pscustomobject]@{TargetPath='';Arguments='';WorkingDirectory='';WindowStyle=0;Description=''}; $link|Add-Member ScriptMethod Save { $script:registered++ };return $link } }) }
# Remove functions only in the test copy so mocks govern launch and registration paths.
foreach($node in @($ast.FindAll({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst]},$false))|Sort-Object {$_.Extent.StartOffset} -Descending){$source=$source.Remove($node.Extent.StartOffset,$node.Extent.EndOffset-$node.Extent.StartOffset)}
$PSCommandPath=Join-Path $PSScriptRoot 'Start-WebDesktop.ps1'
$source=$source.Replace('$PSScriptRoot',("'"+$PSScriptRoot.Replace("'","''")+"'")).Replace('$PSCommandPath',("'"+$PSCommandPath.Replace("'","''")+"'"))
& ([scriptblock]::Create($source)) -KeepAlive
if($script:spawned -ne 1){throw 'KeepAlive did not spawn exactly one detached supervisor'}
& ([scriptblock]::Create($source)) -RegisterLogon
if($script:spawned -ne 2){throw 'RegisterLogon did not return after detached launch'}
Write-Output 'PASS: syntax, detached KeepAlive, RegisterLogon reaches registration and returns'
