param([string]$Architectures = 'arm64-v8a,armeabi-v7a')

$ErrorActionPreference = 'Stop'
$mobileRoot = Split-Path $PSScriptRoot -Parent
$repoRoot = Split-Path $mobileRoot -Parent
$savedEnvironment = @{}
foreach ($name in @('AUTODL_BUILD_VARIANT', 'EXPO_NO_DOTENV', 'NODE_ENV', 'CMAKE_BUILD_PARALLEL_LEVEL')) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
    $env:AUTODL_BUILD_VARIANT = 'beta'
    $env:EXPO_NO_DOTENV = '1'
    $env:NODE_ENV = 'production'
    $env:CMAKE_BUILD_PARALLEL_LEVEL = '2'
    Push-Location (Join-Path $mobileRoot 'android')
    try {
        & ./gradlew.bat :app:assembleBeta "-PreactNativeArchitectures=$Architectures" -I ../scripts/short-cxx.init.gradle --console=plain --max-workers=2 --no-parallel
        if ($LASTEXITCODE -ne 0) { throw "Beta build failed: $LASTEXITCODE" }
    } finally { Pop-Location }

    $metadata = Get-Content (Join-Path $mobileRoot 'android/app/build/outputs/apk/beta/output-metadata.json') -Raw | ConvertFrom-Json
    if ($metadata.applicationId -ne 'com.example.autodlh3.beta') { throw 'Unexpected APK applicationId' }
    $artifactDir = Join-Path $repoRoot 'build/phone-beta'
    New-Item -ItemType Directory -Path $artifactDir -Force | Out-Null
    $apk = Join-Path $artifactDir "AutoDL-H3-$($metadata.elements[0].versionName)-android.apk"
    Copy-Item -LiteralPath (Join-Path $mobileRoot 'android/app/build/outputs/apk/beta/app-beta.apk') -Destination $apk -Force
    $hash = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash
    "$hash  $([IO.Path]::GetFileName($apk))" | Set-Content -LiteralPath "$apk.sha256" -Encoding utf8
    Write-Output "APK: $apk"
    Write-Output "Application ID: $($metadata.applicationId)"
    Write-Output "SHA-256: $hash"
} finally {
    foreach ($name in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
    }
}
