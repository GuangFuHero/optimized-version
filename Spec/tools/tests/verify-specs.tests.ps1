$ErrorActionPreference = 'Stop'

$toolsRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$verifier = Join-Path $toolsRoot 'verify-specs.ps1'
$powerShellHost = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell' }
$script:failures = [System.Collections.Generic.List[string]]::new()

function Write-Utf8File {
    param(
        [Parameter(Mandatory)] [string] $Path,
        [Parameter(Mandatory)] [string] $Content
    )

    $parent = Split-Path -Parent $Path
    if ($parent) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

# Scenario vocabulary is built from code points so this test file stays ASCII.
$script:scenarioBaseline = [string]([char]0x967D) + [char]0x5149
$script:scenarioAnomaly = [string]([char]0x7570) + [char]0x5E38
$script:scenarioFrequent = [string]([char]0x9AD8) + [char]0x983B
$script:scenarioSeparator = [string][char]0x00B7
$script:scenarioConclusion = [string]([char]0x7D50) + [char]0x8AD6

$script:scenarioBlockTemplate = @'
### {0}
`{1}` {2} `{3}` {2} `{4}`

**{5}**: A plain-language rule. ({6} {2} {7})
'@

function New-ScenarioBlock {
    param(
        [string] $Title = 'A baseline situation',
        [string] $Type = $script:scenarioBaseline,
        [string] $Handle = 'S-01',
        [string] $Decision = 'D1',
        [string] $Criterion = 'AC-01'
    )

    return $script:scenarioBlockTemplate -f $Title, $Type, $script:scenarioSeparator, $script:scenarioFrequent, $Handle, $script:scenarioConclusion, $Decision, $Criterion
}

function Get-ScenariosPath {
    param([Parameter(Mandatory)] [string] $Root)
    return Join-Path $Root 'product-areas\task-management\features\TM-FEAT-001-custom-fields\scenarios.md'
}

function New-ValidFixture {
    $fixture = Join-Path ([System.IO.Path]::GetTempPath()) ("wanguard-spec-test-" + [guid]::NewGuid().ToString('N'))
    $featureDir = Join-Path $fixture 'product-areas\task-management\features\TM-FEAT-001-custom-fields'

    Write-Utf8File -Path (Join-Path $fixture 'ACTIVE_VERSION') -Content "v0.1.0`n"
    Write-Utf8File -Path (Join-Path $fixture 'versions\v0.1.0.md') -Content @'
# v0.1.0: Trial release

## Included Features

- [TM-FEAT-001](../product-areas/task-management/features/TM-FEAT-001-custom-fields/feature.md)
'@
    Write-Utf8File -Path (Join-Path $fixture 'product-areas\task-management\README.md') -Content @'
# Task Management

## Minimum reading path

- [v0.1.0](../../versions/v0.1.0.md)
- [TM-FEAT-001](./features/TM-FEAT-001-custom-fields/feature.md)
- [Governance](../../_shared/governance.md)
'@
    Write-Utf8File -Path (Join-Path $fixture '_shared\governance.md') -Content @'
# Governance

Canonical entry points must not link to status: legacy-unreconciled documents.
'@
    Write-Utf8File -Path (Join-Path $featureDir 'feature.md') -Content @'
---
feature: TM-FEAT-001
title: Custom fields
status: Draft
owner: Product Owner
target_version: v0.1.0
---

# TM-FEAT-001: Custom fields

## Open decisions

None.

## Acceptance criteria

- **AC-01:** An administrator can create a field and a user can observe it on the task form.
'@
    Write-Utf8File -Path (Join-Path $featureDir 'spec.md') -Content @'
# TM-FEAT-001 product rules

## Rules

### TM-CF-101: Display configured field

The task form displays an active configured field.

## Traceability

| Acceptance criterion | Spec rules |
|---|---|
| AC-01 | TM-CF-101 |
'@
    Write-Utf8File -Path (Join-Path $featureDir 'flow.md') -Content @'
# TM-FEAT-001 flow

1. The administrator configures a field. (`TM-CF-101`)
2. The user observes the field. (`TM-CF-101`)
'@
    Write-Utf8File -Path (Join-Path $featureDir 'validation.md') -Content @'
# TM-FEAT-001 validation

**Immutable build or commit:** Not tested

- [ ] **AC-01 / TM-CF-101:** The configured field is observable.
'@
    Write-Utf8File -Path (Join-Path $fixture 'product-areas\task-management\decisions.md') -Content @'
# Task Management decisions

| ID | Decision |
|---|---|
| D1 | A field keeps its identity when renamed. |
'@
    Write-Utf8File -Path (Join-Path $featureDir 'scenarios.md') -Content ((New-ScenarioBlock) + "`n")

    return $fixture
}

function Invoke-Verifier {
    param([Parameter(Mandatory)] [string] $Fixture)

    $output = & $powerShellHost -NoProfile -ExecutionPolicy Bypass -File $verifier -Root $Fixture 2>&1 | Out-String
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $output }
}

function Test-CleanFixture {
    $fixture = New-ValidFixture
    try {
        $result = Invoke-Verifier -Fixture $fixture
        if ($result.ExitCode -ne 0) {
            throw "Expected success but got exit $($result.ExitCode):`n$($result.Output)"
        }
    }
    finally {
        Remove-Item -LiteralPath $fixture -Recurse -Force
    }
}

function Test-DraftWithoutValidation {
    $fixture = New-ValidFixture
    try {
        Remove-Item -LiteralPath (Join-Path $fixture 'product-areas\task-management\features\TM-FEAT-001-custom-fields\validation.md')
        $result = Invoke-Verifier -Fixture $fixture
        if ($result.ExitCode -ne 0) {
            throw "A Draft without validation.md must remain valid:`n$($result.Output)"
        }
    }
    finally {
        Remove-Item -LiteralPath $fixture -Recurse -Force
    }
}

function Test-DefaultRootInvocation {
    $output = & $powerShellHost -NoProfile -ExecutionPolicy Bypass -File $verifier 2>&1 | Out-String
    if ($output -match 'Cannot bind argument|Join-Path') {
        throw "Default root initialization failed:`n$output"
    }
    if ($output -notmatch '(?m)^(PASS|FAILED):') {
        throw "Verifier did not reach a governance result:`n$output"
    }
}

function Test-ErrorCode {
    param(
        [Parameter(Mandatory)] [string] $Code,
        [Parameter(Mandatory)] [scriptblock] $Mutate
    )

    $fixture = New-ValidFixture
    try {
        & $Mutate $fixture
        $result = Invoke-Verifier -Fixture $fixture
        if ($result.ExitCode -eq 0) {
            throw "Expected failure with [$Code], but verifier succeeded."
        }
        if ($result.Output -notmatch [regex]::Escape("[$Code]")) {
            throw "Expected [$Code], got:`n$($result.Output)"
        }
    }
    finally {
        Remove-Item -LiteralPath $fixture -Recurse -Force
    }
}

$tests = [ordered]@{
    'accepts a valid spec tree' = { Test-CleanFixture }
    'allows a Draft without validation' = { Test-DraftWithoutValidation }
    'uses the repository specs directory by default' = { Test-DefaultRootInvocation }
    'rejects directories in versions' = {
        Test-ErrorCode 'VERSION_CONTENT' { param($root) New-Item -ItemType Directory -Path (Join-Path $root 'versions\nested') | Out-Null }
    }
    'rejects a missing target Version' = {
        Test-ErrorCode 'TARGET_VERSION' { param($root) (Get-Content -Raw (Join-Path $root 'product-areas\task-management\features\TM-FEAT-001-custom-fields\feature.md')).Replace('target_version: v0.1.0', 'target_version: v9.9.9') | Set-Content -Encoding utf8 (Join-Path $root 'product-areas\task-management\features\TM-FEAT-001-custom-fields\feature.md') }
    }
    'rejects an invalid Feature status' = {
        Test-ErrorCode 'STATUS_VALUE' { param($root) (Get-Content -Raw (Join-Path $root 'product-areas\task-management\features\TM-FEAT-001-custom-fields\feature.md')).Replace('status: Draft', 'status: Almost done') | Set-Content -Encoding utf8 (Join-Path $root 'product-areas\task-management\features\TM-FEAT-001-custom-fields\feature.md') }
    }
    'requires validation at Ready or later' = {
        Test-ErrorCode 'VALIDATION_REQUIRED' { param($root) $feature = Join-Path $root 'product-areas\task-management\features\TM-FEAT-001-custom-fields'; (Get-Content -Raw (Join-Path $feature 'feature.md')).Replace('status: Draft', 'status: Ready') | Set-Content -Encoding utf8 (Join-Path $feature 'feature.md'); Remove-Item -LiteralPath (Join-Path $feature 'validation.md') }
    }
    'rejects decisions in Flow' = {
        Test-ErrorCode 'FLOW_DECISION' { param($root) Add-Content -Encoding utf8 -Path (Join-Path $root 'product-areas\task-management\features\TM-FEAT-001-custom-fields\flow.md') -Value "`n## Open decisions`n- Q1"
        }
    }
    'rejects unresolved Flow rule references' = {
        Test-ErrorCode 'RULE_UNRESOLVED' { param($root) Add-Content -Encoding utf8 -Path (Join-Path $root 'product-areas\task-management\features\TM-FEAT-001-custom-fields\flow.md') -Value "`n3. Unknown behavior. (`TM-CF-999`)" }
    }
    'rejects uncovered acceptance criteria' = {
        Test-ErrorCode 'AC_UNCOVERED' { param($root) Add-Content -Encoding utf8 -Path (Join-Path $root 'product-areas\task-management\features\TM-FEAT-001-custom-fields\feature.md') -Value "`n- **AC-02:** A second observable result." }
    }
    'rejects broken relative Markdown links' = {
        Test-ErrorCode 'BROKEN_LINK' { param($root) Add-Content -Encoding utf8 -Path (Join-Path $root 'product-areas\task-management\README.md') -Value "`n[Missing](./does-not-exist.md)" }
    }
    'rejects legacy material as a canonical entry' = {
        Test-ErrorCode 'LEGACY_ENTRY' { param($root) Write-Utf8File -Path (Join-Path $root '_archive\legacy.md') -Content "status: legacy-unreconciled`n"; Add-Content -Encoding utf8 -Path (Join-Path $root 'versions\v0.1.0.md') -Value "`n[Legacy](../_archive/legacy.md)" }
    }
    'rejects a scenario without a tag line' = {
        Test-ErrorCode 'SCENARIO_FORMAT' { param($root)
            $path = Get-ScenariosPath -Root $root
            $stripped = (Get-Content -Raw -Encoding UTF8 -LiteralPath $path) -replace '(?m)^`.+`\r?\n', ''
            Write-Utf8File -Path $path -Content $stripped
        }
    }
    'rejects a duplicate scenario handle' = {
        Test-ErrorCode 'SCENARIO_FORMAT' { param($root)
            $path = Get-ScenariosPath -Root $root
            $content = (Get-Content -Raw -Encoding UTF8 -LiteralPath $path) + "`n" + (New-ScenarioBlock -Title 'A second situation reusing the handle')
            Write-Utf8File -Path $path -Content $content
        }
    }
    'rejects a scenarios file with no baseline scenario' = {
        Test-ErrorCode 'SCENARIO_FORMAT' { param($root)
            $path = Get-ScenariosPath -Root $root
            Write-Utf8File -Path $path -Content ((New-ScenarioBlock -Type $script:scenarioAnomaly) + "`n")
        }
    }
    'rejects a scenario citing an unrecorded decision' = {
        Test-ErrorCode 'SCENARIO_REFERENCE' { param($root)
            $path = Get-ScenariosPath -Root $root
            $content = (Get-Content -Raw -Encoding UTF8 -LiteralPath $path) + "`n" + (New-ScenarioBlock -Title 'A situation citing a missing decision' -Handle 'S-02' -Decision 'D99')
            Write-Utf8File -Path $path -Content $content
        }
    }
    'rejects a scenario citing an unknown acceptance criterion' = {
        Test-ErrorCode 'SCENARIO_REFERENCE' { param($root)
            $path = Get-ScenariosPath -Root $root
            $content = (Get-Content -Raw -Encoding UTF8 -LiteralPath $path) + "`n" + (New-ScenarioBlock -Title 'A situation citing a missing criterion' -Handle 'S-03' -Criterion 'AC-99')
            Write-Utf8File -Path $path -Content $content
        }
    }
    'rejects numeric product-area prefixes' = {
        Test-ErrorCode 'NUMERIC_AREA' { param($root) New-Item -ItemType Directory -Force -Path (Join-Path $root 'product-areas\08-task-management') | Out-Null; Write-Utf8File -Path (Join-Path $root 'product-areas\08-task-management\README.md') -Content '# Invalid area' }
    }
}

foreach ($entry in $tests.GetEnumerator()) {
    try {
        & $entry.Value
        Write-Host "PASS: $($entry.Key)"
    }
    catch {
        $script:failures.Add("FAIL: $($entry.Key)`n$($_.Exception.Message)")
        Write-Host $script:failures[-1]
    }
}

if ($script:failures.Count -gt 0) {
    Write-Error "$($script:failures.Count) verifier test(s) failed."
    exit 1
}

Write-Host "PASS: $($tests.Count) verifier tests"
