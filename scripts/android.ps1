param(
    [string]$Sdk = $env:ANDROID_HOME,
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$ApiUrl = 'http://localhost:3000',
    [string]$Device,
    [switch]$Install,
    [switch]$PublishDownload
)
$ErrorActionPreference = 'Stop'
if (!$Sdk -or !(Test-Path "$Sdk/platform-tools/adb.exe")) {
    throw 'Set ANDROID_HOME or pass -Sdk with an installed Android SDK 36.'
}
if (!$JavaHome -or !(Test-Path "$JavaHome/bin/jlink.exe")) {
    throw 'Set JAVA_HOME or pass -JavaHome with a full JDK 21 installation including jlink.'
}
if ($ApiUrl -notmatch '^https://[^/]+' -and $ApiUrl -notmatch '^http://localhost:\d+/?$') {
    throw 'Use an HTTPS API URL or http://localhost:<port> for local debug builds.'
}
if ($PublishDownload -and $ApiUrl -notmatch '^https://') {
    throw 'Published APKs require an HTTPS backend. Pass -ApiUrl https://nearwork-api.vercel.app.'
}
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $Sdk
$env:VITE_API_BASE_URL = $ApiUrl
$previousNativeBuild = $env:NEARWORK_NATIVE_BUILD
$env:NEARWORK_NATIVE_BUILD = '1'
$repo = Split-Path $PSScriptRoot -Parent
Push-Location $repo
try {
    npm run android:sync
    if ($LASTEXITCODE) { throw 'Android web build/sync failed.' }
    & ./apps/mobile/android/gradlew.bat -p apps/mobile/android assembleDebug --console=plain
    if ($LASTEXITCODE) { throw 'Android compilation failed.' }
    $apk = Join-Path $repo 'apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($apk)
    try {
        $entry = $archive.Entries | Where-Object FullName -Match '^assets/public/assets/index-.*\.js$' | Select-Object -First 1
        if (!$entry) { throw 'The APK is missing its bundled application.' }
        $reader = [IO.StreamReader]::new($entry.Open())
        try { $bundle = $reader.ReadToEnd() } finally { $reader.Dispose() }
        if (!$bundle.Contains($ApiUrl.TrimEnd('/'))) {
            throw 'APK endpoint verification failed. Another build may have replaced the native assets.'
        }
        if ($archive.Entries.FullName -match '^assets/public/downloads/') {
            throw 'The APK must not contain the website APK download.'
        }
    } finally { $archive.Dispose() }
    Write-Host "APK: $apk"
    if ($PublishDownload) {
        $downloads = Join-Path $repo 'apps/mobile/public/downloads'
        New-Item -ItemType Directory -Force $downloads | Out-Null
        Copy-Item -LiteralPath $apk -Destination (Join-Path $downloads 'nearwork.apk')
        $hash = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
        Set-Content -LiteralPath (Join-Path $downloads 'nearwork.apk.sha256') -Value "$hash  nearwork.apk" -Encoding ascii
    }
    if ($Install) {
        $target = @()
        if ($Device) { $target = @('-s', $Device) }
        if ($ApiUrl -match '^http://localhost:(\d+)/?$') {
            $apiPort = $Matches[1]
            & "$Sdk/platform-tools/adb.exe" @target reverse "tcp:$apiPort" "tcp:$apiPort"
            if ($LASTEXITCODE) { throw 'Could not forward the device localhost port to the local backend.' }
        }
        & "$Sdk/platform-tools/adb.exe" @target install -r $apk
        if ($LASTEXITCODE) { throw 'APK installation failed. Select a running emulator with -Device.' }
        & "$Sdk/platform-tools/adb.exe" @target shell am force-stop com.nearwork.app
        & "$Sdk/platform-tools/adb.exe" @target shell am start -n com.nearwork.app/.MainActivity
        if ($LASTEXITCODE) { throw 'App launch failed.' }
    }
} finally {
    $env:NEARWORK_NATIVE_BUILD = $previousNativeBuild
    Pop-Location
}
