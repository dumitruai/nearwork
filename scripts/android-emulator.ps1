param(
    [string]$Sdk = $env:ANDROID_HOME,
    [string]$AvdHome = $env:ANDROID_AVD_HOME,
    [string]$Name = 'Nearwork_API_36'
)
$ErrorActionPreference = 'Stop'
if (!$Sdk -or !(Test-Path "$Sdk/emulator/emulator.exe")) {
    throw 'Pass -Sdk with your Android SDK directory.'
}
if ($AvdHome) { $env:ANDROID_AVD_HOME = $AvdHome }
$env:ANDROID_HOME = $Sdk
Start-Process -FilePath "$Sdk/emulator/emulator.exe" -ArgumentList @('-avd', $Name, '-no-snapshot', '-gpu', 'auto')
