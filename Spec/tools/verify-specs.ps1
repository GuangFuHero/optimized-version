[CmdletBinding()]
param(
    [string] $Root,
    [switch] $AllowMigrationBlockers
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = Join-Path $PSScriptRoot '..'
}
$allowedStatuses = @('Draft', 'Ready', 'In delivery', 'Validated', 'Released', 'Superseded')
$validationRequiredStatuses = @('Ready', 'In delivery', 'Validated', 'Released')
$fullyValidatedStatuses = @('Validated', 'Released')
$issues = [System.Collections.Generic.List[object]]::new()
$issueKeys = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

function Get-NormalizedFullPath {
    param([Parameter(Mandatory)] [string] $Path)
    return [System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
}

$rootPath = Get-NormalizedFullPath -Path $Root
if (-not (Test-Path -LiteralPath $rootPath -PathType Container)) {
    Write-Host "[VERSION_CONTENT] .: Specs root does not exist: $rootPath"
    exit 1
}

function Get-RelativePath {
    param([Parameter(Mandatory)] [string] $Path)
    $full = Get-NormalizedFullPath -Path $Path
    if ($full.Equals($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        return '.'
    }
    if ($full.StartsWith($rootPath + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        return $full.Substring($rootPath.Length + 1).Replace('\', '/')
    }
    return $full.Replace('\', '/')
}

function Add-Issue {
    param(
        [Parameter(Mandatory)] [string] $Code,
        [Parameter(Mandatory)] [string] $Path,
        [Parameter(Mandatory)] [string] $Message
    )
    $relativePath = Get-RelativePath -Path $Path
    $key = "$Code|$relativePath|$Message"
    if (-not $issueKeys.Add($key)) {
        return
    }
    $issues.Add([pscustomobject]@{
        Code = $Code
        Path = $relativePath
        Message = $Message
    })
}

function Get-FrontMatter {
    param([Parameter(Mandatory)] [string] $Content)
    $values = @{}
    $match = [regex]::Match($Content, '(?s)\A---\s*\r?\n(?<body>.*?)\r?\n---(?:\r?\n|\z)')
    if (-not $match.Success) {
        return $values
    }
    foreach ($line in ($match.Groups['body'].Value -split '\r?\n')) {
        $pair = [regex]::Match($line, '^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*?)\s*$')
        if ($pair.Success) {
            $values[$pair.Groups[1].Value] = $pair.Groups[2].Value.Trim('"', "'")
        }
    }
    return $values
}

function Test-IsExcludedPath {
    param([Parameter(Mandatory)] [string] $Path)
    $relative = Get-RelativePath -Path $Path
    return $relative -match '(^|/)(_archive|_template|_process)(/|$)'
}

function Get-MarkdownLinks {
    param([Parameter(Mandatory)] [string] $Content)
    $links = [System.Collections.Generic.List[string]]::new()
    foreach ($match in [regex]::Matches($Content, '!?(?:\[[^\]]*\])\((?<target>[^)]+)\)')) {
        $target = $match.Groups['target'].Value.Trim().Trim('<', '>')
        if ($target) { $links.Add($target) }
    }
    return $links
}

# Version manifests may be files only; a missing directory is also invalid.
$versionsPath = Join-Path $rootPath 'versions'
if (-not (Test-Path -LiteralPath $versionsPath -PathType Container)) {
    Add-Issue -Code 'VERSION_CONTENT' -Path $rootPath -Message 'Missing versions/ manifest directory.'
}
else {
    foreach ($entry in Get-ChildItem -LiteralPath $versionsPath -Force) {
        if ($entry.PSIsContainer -or $entry.Extension -ne '.md') {
            Add-Issue -Code 'VERSION_CONTENT' -Path $entry.FullName -Message 'versions/ may contain Markdown manifest files only.'
        }
    }
}

# Product-area names are semantic and unnumbered.
$productAreasPath = Join-Path $rootPath 'product-areas'
if (Test-Path -LiteralPath $productAreasPath -PathType Container) {
    foreach ($area in Get-ChildItem -LiteralPath $productAreasPath -Directory) {
        if ($area.Name -match '^\d{1,3}[-_]') {
            Add-Issue -Code 'NUMERIC_AREA' -Path $area.FullName -Message 'Product-area directories must use stable semantic names without numeric ordering prefixes.'
        }
    }
}

# Feature metadata, status, target Version, validation, rule references, and AC coverage.
$featureFiles = @()
if (Test-Path -LiteralPath $productAreasPath -PathType Container) {
    $featureFiles = @(Get-ChildItem -LiteralPath $productAreasPath -Recurse -File -Filter 'feature.md' | Where-Object { $_.FullName -match '[\\/]features[\\/][^\\/]+[\\/]feature\.md$' })
}

$featureIds = @{}
foreach ($featureFile in $featureFiles) {
    $featureDir = $featureFile.Directory.FullName
    $content = Get-Content -Raw -LiteralPath $featureFile.FullName
    $frontMatter = Get-FrontMatter -Content $content
    $featureId = $frontMatter['feature']
    $status = $frontMatter['status']
    $targetVersion = $frontMatter['target_version']

    if ([string]::IsNullOrWhiteSpace($featureId)) {
        Add-Issue -Code 'FEATURE_ID' -Path $featureFile.FullName -Message 'Feature frontmatter must contain feature.'
    }
    else {
        if ($featureIds.ContainsKey($featureId)) {
            Add-Issue -Code 'FEATURE_ID' -Path $featureFile.FullName -Message "Feature ID $featureId is already used by $($featureIds[$featureId])."
        }
        else {
            $featureIds[$featureId] = Get-RelativePath -Path $featureFile.FullName
        }
        if (-not $featureFile.Directory.Name.StartsWith($featureId + '-', [System.StringComparison]::OrdinalIgnoreCase)) {
            Add-Issue -Code 'FEATURE_ID' -Path $featureFile.FullName -Message "Feature folder must begin with $featureId-."
        }
    }

    if ([string]::IsNullOrWhiteSpace($targetVersion) -or $targetVersion -notmatch '^v\d+\.\d+\.\d+$') {
        Add-Issue -Code 'TARGET_VERSION' -Path $featureFile.FullName -Message 'target_version must contain exactly one Semantic Version identifier such as v0.1.0.'
    }
    elseif (-not (Test-Path -LiteralPath (Join-Path $versionsPath ($targetVersion + '.md')) -PathType Leaf)) {
        Add-Issue -Code 'TARGET_VERSION' -Path $featureFile.FullName -Message "Target Version manifest does not exist: $targetVersion.md."
    }

    if ($allowedStatuses -notcontains $status) {
        Add-Issue -Code 'STATUS_VALUE' -Path $featureFile.FullName -Message "Feature status must be one of: $($allowedStatuses -join ', ')."
    }

    $validationPath = Join-Path $featureDir 'validation.md'
    if ($validationRequiredStatuses -contains $status) {
        if (-not (Test-Path -LiteralPath $validationPath -PathType Leaf)) {
            Add-Issue -Code 'VALIDATION_REQUIRED' -Path $featureFile.FullName -Message "$status requires Feature-local validation.md."
        }
    }
    if (($fullyValidatedStatuses -contains $status) -and (Test-Path -LiteralPath $validationPath -PathType Leaf)) {
        $validationContent = Get-Content -Raw -LiteralPath $validationPath
        if ($validationContent -match '(?im)^\s*-\s*\[\s\]' -or $validationContent -notmatch '(?im)^\s*-\s*\[[xX]\]') {
            Add-Issue -Code 'VALIDATION_REQUIRED' -Path $validationPath -Message "$status requires every applicable validation checkbox to be checked."
        }
        if ($validationContent -match '(?im)^\*\*Immutable build or commit:\*\*\s*(Not tested|None|main|latest|\s*)$') {
            Add-Issue -Code 'VALIDATION_REQUIRED' -Path $validationPath -Message "$status requires an immutable build or commit."
        }
    }

    $specPath = Join-Path $featureDir 'spec.md'
    $flowPath = Join-Path $featureDir 'flow.md'
    $specContent = if (Test-Path -LiteralPath $specPath -PathType Leaf) { Get-Content -Raw -LiteralPath $specPath } else { '' }
    $validationContentForCoverage = if (Test-Path -LiteralPath $validationPath -PathType Leaf) { Get-Content -Raw -LiteralPath $validationPath } else { '' }

    if (Test-Path -LiteralPath $flowPath -PathType Leaf) {
        $flowContent = Get-Content -Raw -LiteralPath $flowPath
        if ($flowContent -match '(?im)Open decisions|待討論|^\s*(?:[-*]\s*)?Q\d+\b') {
            Add-Issue -Code 'FLOW_DECISION' -Path $flowPath -Message 'Flow may not contain Open decisions, discussion prompts, or Q-numbered decisions.'
        }

        $knownRules = @([regex]::Matches($specContent, '\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){2,}\b') | ForEach-Object { $_.Value } | Where-Object { $_ -notmatch '-FEAT-' } | Select-Object -Unique)
        $flowRules = @([regex]::Matches($flowContent, '\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){2,}\b') | ForEach-Object { $_.Value } | Where-Object { $_ -notmatch '-FEAT-' } | Select-Object -Unique)
        foreach ($rule in $flowRules) {
            if ($knownRules -notcontains $rule) {
                Add-Issue -Code 'RULE_UNRESOLVED' -Path $flowPath -Message "Flow references missing Spec rule: $rule."
            }
        }
    }

    # Scenarios are supporting material, but their shape and their citations are checked.
    $scenariosPath = Join-Path $featureDir 'scenarios.md'
    if (Test-Path -LiteralPath $scenariosPath -PathType Leaf) {
        $scenarioContent = Get-Content -Raw -Encoding UTF8 -LiteralPath $scenariosPath
        # Escaped so this script stays ASCII: five scenario types, two frequencies, separated by U+00B7.
        $tagPattern = '^`(?<type>\u967D\u5149|\u7570\u5E38|\u908A\u754C|\u885D\u7A81|\u8B8A\u9077)`\s*\u00B7\s*`(?<freq>\u9AD8\u983B|\u4F4E\u983B)`\s*\u00B7\s*`(?<id>S-\d{2})`$'
        $scenarioIds = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
        $baselineCount = 0
        $blocks = @([regex]::Split($scenarioContent, '(?m)^###\s+') | Select-Object -Skip 1)
        if ($blocks.Count -eq 0) {
            Add-Issue -Code 'SCENARIO_FORMAT' -Path $scenariosPath -Message 'No scenario heading found.'
        }
        foreach ($block in $blocks) {
            $blockLines = @($block -split '\r?\n')
            $title = $blockLines[0].Trim()
            $tagLine = ''
            foreach ($blockLine in ($blockLines | Select-Object -Skip 1)) {
                if ($blockLine.Trim()) { $tagLine = $blockLine.Trim(); break }
            }

            $tagMatch = [regex]::Match($tagLine, $tagPattern)
            if (-not $tagMatch.Success) {
                Add-Issue -Code 'SCENARIO_FORMAT' -Path $scenariosPath -Message "Scenario '$title' must be followed by a tag line carrying one type, one frequency, and one S-NN handle."
                continue
            }

            $scenarioId = $tagMatch.Groups['id'].Value
            if (-not $scenarioIds.Add($scenarioId)) {
                Add-Issue -Code 'SCENARIO_FORMAT' -Path $scenariosPath -Message "Scenario handle $scenarioId is used more than once."
            }
            if ($title -match '\bS-\d{2}\b') {
                Add-Issue -Code 'SCENARIO_FORMAT' -Path $scenariosPath -Message "Scenario heading '$title' must not carry its S-NN handle."
            }
            if ($tagMatch.Groups['type'].Value -match '^\u967D\u5149$') { $baselineCount++ }
            if ($block -notmatch '\*\*\u7D50\u8AD6\*\*') {
                Add-Issue -Code 'SCENARIO_FORMAT' -Path $scenariosPath -Message "Scenario $scenarioId is missing its conclusion line."
            }
        }
        if ($blocks.Count -gt 0 -and $baselineCount -eq 0) {
            Add-Issue -Code 'SCENARIO_FORMAT' -Path $scenariosPath -Message 'At least one scenario must carry the baseline type.'
        }

        $decisionsPath = Join-Path (Split-Path -Parent (Split-Path -Parent $featureDir)) 'decisions.md'
        $decisionsContent = if (Test-Path -LiteralPath $decisionsPath -PathType Leaf) { Get-Content -Raw -Encoding UTF8 -LiteralPath $decisionsPath } else { '' }
        foreach ($decision in @([regex]::Matches($scenarioContent, '\bD\d+\b') | ForEach-Object { $_.Value } | Select-Object -Unique)) {
            if ($decisionsContent -notmatch ('\b' + [regex]::Escape($decision) + '\b')) {
                Add-Issue -Code 'SCENARIO_REFERENCE' -Path $scenariosPath -Message "Cited decision is not recorded in the product-area decisions: $decision."
            }
        }
        foreach ($criterion in @([regex]::Matches($scenarioContent, '\bAC-\d+\b') | ForEach-Object { $_.Value } | Select-Object -Unique)) {
            if ($content -notmatch ('\b' + [regex]::Escape($criterion) + '\b')) {
                Add-Issue -Code 'SCENARIO_REFERENCE' -Path $scenariosPath -Message "Cited acceptance criterion is not in feature.md: $criterion."
            }
        }
    }

    $acceptanceCriteria = @([regex]::Matches($content, '\bAC-\d+\b') | ForEach-Object { $_.Value } | Select-Object -Unique)
    foreach ($criterion in $acceptanceCriteria) {
        $missingFrom = [System.Collections.Generic.List[string]]::new()
        if ($specContent -and $specContent -notmatch ('\b' + [regex]::Escape($criterion) + '\b')) { $missingFrom.Add('spec.md') }
        if ($validationContentForCoverage -and $validationContentForCoverage -notmatch ('\b' + [regex]::Escape($criterion) + '\b')) { $missingFrom.Add('validation.md') }
        if ($missingFrom.Count -gt 0) {
            Add-Issue -Code 'AC_UNCOVERED' -Path $featureFile.FullName -Message "$criterion is not covered by $($missingFrom -join ' and ')."
        }
    }
}

# Relative Markdown links and wiki-style product-area references.
$markdownFiles = @(Get-ChildItem -LiteralPath $rootPath -Recurse -File -Filter '*.md' | Where-Object { -not (Test-IsExcludedPath -Path $_.FullName) })
foreach ($file in $markdownFiles) {
    $content = Get-Content -Raw -LiteralPath $file.FullName
    foreach ($target in Get-MarkdownLinks -Content $content) {
        if ($target -match '^(?:[a-z][a-z0-9+.-]*:|#)' -or $target.Contains('<') -or $target.Contains('>')) { continue }
        $pathPart = ($target -split '[?#]', 2)[0]
        if ([string]::IsNullOrWhiteSpace($pathPart)) { continue }
        $decoded = [System.Uri]::UnescapeDataString($pathPart).Replace('/', '\')
        $resolvedTarget = Get-NormalizedFullPath -Path (Join-Path $file.Directory.FullName $decoded)
        if (-not (Test-Path -LiteralPath $resolvedTarget)) {
            Add-Issue -Code 'BROKEN_LINK' -Path $file.FullName -Message "Relative Markdown link does not resolve: $target."
            continue
        }

        $isCanonicalEntry = $file.FullName.StartsWith($versionsPath + '\', [System.StringComparison]::OrdinalIgnoreCase) -or $file.Name -eq 'README.md'
        if ($isCanonicalEntry) {
            $targetRelative = Get-RelativePath -Path $resolvedTarget
            $legacyTarget = $targetRelative -match '(^|/)_archive(/|$)'
            if ((Test-Path -LiteralPath $resolvedTarget -PathType Leaf) -and -not $legacyTarget) {
                $legacyTarget = (Get-Content -Raw -LiteralPath $resolvedTarget) -match '(?im)^\s*(?:status:\s*|\*\*Status:\*\*\s*)legacy-unreconciled\s*$'
            }
            if ($legacyTarget) {
                Add-Issue -Code 'LEGACY_ENTRY' -Path $file.FullName -Message "Canonical entry may not link to legacy-unreconciled material: $target."
            }
        }
    }

    foreach ($wikiMatch in [regex]::Matches($content, '\[\[(?<area>[A-Za-z0-9_-]+)\]\]')) {
        $area = $wikiMatch.Groups['area'].Value
        if (-not (Test-Path -LiteralPath (Join-Path $productAreasPath $area) -PathType Container)) {
            Add-Issue -Code 'BROKEN_LINK' -Path $file.FullName -Message "Product-area reference does not resolve: [[$area]]."
        }
    }
}

# Optional migration blocker registry: | CODE | relative/path or prefix/* | reason |
$allowedIssues = [System.Collections.Generic.List[object]]::new()
if ($AllowMigrationBlockers) {
    $registryPath = Join-Path $rootPath 'MIGRATION_BLOCKERS.md'
    if (Test-Path -LiteralPath $registryPath -PathType Leaf) {
        foreach ($line in Get-Content -LiteralPath $registryPath) {
            $match = [regex]::Match($line, '^\|\s*(?<code>[A-Z_]+)\s*\|\s*`?(?<path>[^|`]+?)`?\s*\|')
            if ($match.Success -and $match.Groups['code'].Value -ne 'Code') {
                $allowedIssues.Add([pscustomobject]@{ Code = $match.Groups['code'].Value; Path = $match.Groups['path'].Value.Trim().Replace('\', '/') })
            }
        }
    }
}

$blockingIssues = [System.Collections.Generic.List[object]]::new()
foreach ($issue in $issues) {
    $allowed = $false
    foreach ($entry in $allowedIssues) {
        if ($entry.Code -ne $issue.Code) { continue }
        if ($entry.Path.EndsWith('/*')) {
            $allowed = $issue.Path.StartsWith($entry.Path.Substring(0, $entry.Path.Length - 1), [System.StringComparison]::OrdinalIgnoreCase)
        }
        else {
            $allowed = $issue.Path.Equals($entry.Path, [System.StringComparison]::OrdinalIgnoreCase)
        }
        if ($allowed) { break }
    }

    if ($allowed) {
        Write-Host "ALLOWED [$($issue.Code)] $($issue.Path): $($issue.Message)"
    }
    else {
        $blockingIssues.Add($issue)
    }
}

foreach ($issue in $blockingIssues | Sort-Object Code, Path, Message) {
    Write-Host "[$($issue.Code)] $($issue.Path): $($issue.Message)"
}

if ($blockingIssues.Count -gt 0) {
    Write-Host "FAILED: $($blockingIssues.Count) blocking issue(s); $($issues.Count - $blockingIssues.Count) allowed migration blocker(s)."
    exit 1
}

Write-Host "PASS: product spec governance checks; $($issues.Count) allowed migration blocker(s)."
exit 0
