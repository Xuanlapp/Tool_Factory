param([string]$Root = 'D:\FFACTORY\Arcylic')
$ErrorActionPreference = 'Stop'
$assetRoot = Split-Path -Parent $PSScriptRoot
$setupVersion = '2026-08-22.1'
$runtime = Join-Path $Root '.runtime'
$resultPath = Join-Path $runtime 'machine-setup.json'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$steps = [System.Collections.Generic.List[object]]::new()
function Save-Progress {
  [pscustomobject]@{ status = 'running'; setupVersion = $setupVersion; updatedAt = (Get-Date).ToString('o'); steps = $steps } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $resultPath -Encoding UTF8
}
function Step($name, [scriptblock]$action) {
  try {
    & $action
    $steps.Add([pscustomobject]@{ name = $name; ok = $true; message = 'Hoàn thành' })
  } catch {
    $steps.Add([pscustomobject]@{ name = $name; ok = $false; message = $_.Exception.Message })
    Save-Progress
    throw
  }
  Save-Progress
}
try {
  Step 'Tạo toàn bộ thư mục dữ liệu' {
    @('Images','images_error','images_processed','imgaes_done','wait','output_ai','output_front','output_back','output_lazer','template','.runtime','.runtime\operations','.runtime\wait-assets','.runtime\wait-previews','.runtime\png-cache') | ForEach-Object { New-Item -ItemType Directory -Force -Path (Join-Path $Root $_) | Out-Null }
  }
  Step 'Sao chép template mặc định' {
    $templateSource = Join-Path $assetRoot 'app-assets\templates'
    $templateTarget = Join-Path $Root 'template'
    if (Test-Path -LiteralPath $templateSource) { Get-ChildItem -LiteralPath $templateSource -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $templateTarget $_.Name) -Force } }
  }
  Step 'Kiểm tra hoặc cài Node.js' {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { if (Get-Command winget -ErrorAction SilentlyContinue) { winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements } else { throw 'Thiếu Node.js và máy không có winget.' } }
    node --version
  }
  Step 'Kiểm tra hoặc cài Python' {
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) { if (Get-Command winget -ErrorAction SilentlyContinue) { winget install Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements } else { throw 'Thiếu Python và máy không có winget.' } }
    python --version
  }
  Step 'Cài Pillow cho Python' { python -m pip install --upgrade pillow }
  Step 'Cài package của ứng dụng' { Push-Location $Root; npm install; Pop-Location }
  Step 'Cài package của Tool' { Push-Location (Join-Path $Root 'Tool'); npm install; Pop-Location }
  Step 'Build Tool' { Push-Location (Join-Path $Root 'Tool'); npm run build; Pop-Location }
  Step 'Build giao diện ứng dụng' { Push-Location $Root; npm --workspace @acrylic/web run build; Pop-Location }
  $illustratorInstalled = [bool](Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Illustrator.exe' -ErrorAction SilentlyContinue)
  $payload = [pscustomobject]@{ status = 'completed'; setupVersion = $setupVersion; updatedAt = (Get-Date).ToString('o'); steps = $steps; illustratorInstalled = $illustratorInstalled }
} catch {
  $payload = [pscustomobject]@{ status = 'error'; setupVersion = $setupVersion; updatedAt = (Get-Date).ToString('o'); message = $_.Exception.Message; steps = $steps; illustratorInstalled = $false }
}
$payload | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $resultPath -Encoding UTF8

