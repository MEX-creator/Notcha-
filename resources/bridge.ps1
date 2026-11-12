# Notch system bridge
# ---------------------------------------------------------------------------
# A single long-lived Windows PowerShell 5.1 process.
#
#   stdout : one JSON object per line  {"t":"ready"|"sys"|"media"|"error","data":{...}}
#   stdin  : one JSON command per line {"cmd":"playpause"|"next"|"prev"|"seek","value":12.5}
#
# Windows PowerShell is required: the WinRT projections used for the Windows
# media session APIs are not available in PowerShell 7.
# ---------------------------------------------------------------------------
param([switch]$Once, [int]$OnceCount = 3)

$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

try {
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
} catch { }

Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
Add-Type -AssemblyName System.Core | Out-Null

# --- WinRT async helper ----------------------------------------------------
$script:asTaskMethod = $null
foreach ($m in [System.WindowsRuntimeSystemExtensions].GetMethods()) {
  if ($m.Name -eq 'AsTask' -and $m.GetParameters().Count -eq 1 -and
      $m.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1') {
    $script:asTaskMethod = $m
    break
  }
}

function Await-Result($operation, [Type]$resultType, [int]$timeoutMs = 8000) {
  if ($null -eq $operation) { return $null }
  if ($null -eq $script:asTaskMethod) { return $null }
  try {
    $task = $script:asTaskMethod.MakeGenericMethod($resultType).Invoke($null, @($operation))
    if (-not $task.Wait($timeoutMs)) { return $null }
    return $task.Result
  } catch {
    return $null
  }
}

# --- Core Audio interop ----------------------------------------------------
$audioSource = @'
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
internal class MMDeviceEnumeratorComObject { }

[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDeviceEnumerator {
  int NotImpl1();
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
}

[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDevice {
  int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
}

[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioEndpointVolume {
  int NotImpl1();
  int NotImpl2();
  int GetChannelCount(out uint channelCount);
  int SetMasterVolumeLevel(float levelDb, Guid eventContext);
  int SetMasterVolumeLevelScalar(float level, Guid eventContext);
  int GetMasterVolumeLevel(out float levelDb);
  int GetMasterVolumeLevelScalar(out float level);
  int SetChannelVolumeLevel(uint channel, float levelDb, Guid eventContext);
  int SetChannelVolumeLevelScalar(uint channel, float level, Guid eventContext);
  int GetChannelVolumeLevel(uint channel, out float levelDb);
  int GetChannelVolumeLevelScalar(uint channel, out float level);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid eventContext);
  int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  int GetVolumeStepInfo(out uint step, out uint stepCount);
  int VolumeStepUp(Guid eventContext);
  int VolumeStepDown(Guid eventContext);
  int QueryHardwareSupport(out uint hardwareSupportMask);
  int GetVolumeRange(out float minDb, out float maxDb, out float incrementDb);
}

public static class NotchVolume {
  public static bool Read(ref float level, ref bool muted) {
    object endpointVolume = null;
    object deviceObject = null;
    object enumeratorObject = null;
    try {
      enumeratorObject = new MMDeviceEnumeratorComObject();
      IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)enumeratorObject;
      IMMDevice device;
      // eRender = 0, eMultimedia = 1
      if (enumerator.GetDefaultAudioEndpoint(0, 1, out device) != 0 || device == null) return false;
      deviceObject = device;
      Guid iid = typeof(IAudioEndpointVolume).GUID;
      object instance;
      // CLSCTX_ALL = 23
      if (device.Activate(ref iid, 23, IntPtr.Zero, out instance) != 0 || instance == null) return false;
      endpointVolume = instance;
      IAudioEndpointVolume volume = (IAudioEndpointVolume)instance;
      float value;
      if (volume.GetMasterVolumeLevelScalar(out value) != 0) return false;
      level = value;
      bool silent;
      volume.GetMute(out silent);
      muted = silent;
      return true;
    } catch {
      return false;
    } finally {
      if (endpointVolume != null) Marshal.ReleaseComObject(endpointVolume);
      if (deviceObject != null) Marshal.ReleaseComObject(deviceObject);
      if (enumeratorObject != null) Marshal.ReleaseComObject(enumeratorObject);
    }
  }
}
'@

$audioOk = $true
try { Add-Type -TypeDefinition $audioSource -Language CSharp -ErrorAction Stop } catch { $audioOk = $false }

# --- output ---------------------------------------------------------------
function Send-Payload($payload) {
  try {
    $json = $payload | ConvertTo-Json -Compress -Depth 8
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
  } catch { }
}

function Safe-Number($value, $fallback = 0) {
  if ($null -eq $value) { return $fallback }
  try {
    $d = [double]$value
    if ([double]::IsNaN($d) -or [double]::IsInfinity($d)) { return $fallback }
    return $d
  } catch { return $fallback }
}

# --- media session --------------------------------------------------------
$script:manager = $null
$script:asStreamForRead = $null
$script:artKey = ''
$script:art = $null
$script:artTries = 0

function Get-SmtcManager {
  if ($script:manager) { return $script:manager }
  try {
    $managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
    $script:manager = Await-Result ($managerType::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  } catch {
    $script:manager = $null
  }
  return $script:manager
}

function Get-AppName([string]$id) {
  if ([string]::IsNullOrWhiteSpace($id)) { return 'Media' }
  $lower = $id.ToLowerInvariant()
  $known = @(
    @('spotify', 'Spotify'),
    @('msedge', 'Edge'),
    @('chrome', 'Chrome'),
    @('firefox', 'Firefox'),
    @('brave', 'Brave'),
    @('opera', 'Opera'),
    @('vivaldi', 'Vivaldi'),
    @('applemusic', 'Apple Music'),
    @('amazonmusic', 'Amazon Music'),
    @('soundcloud', 'SoundCloud'),
    @('youtube', 'YouTube'),
    @('music.ui', 'Media Player'),
    @('zunemusic', 'Media Player'),
    @('wmplayer', 'Windows Media Player'),
    @('foobar2000', 'foobar2000'),
    @('tidal', 'TIDAL'),
    @('deezer', 'Deezer'),
    @('qobuz', 'Qobuz'),
    @('aimp', 'AIMP'),
    @('itunes', 'iTunes'),
    @('vlc', 'VLC')
  )
  foreach ($pair in $known) {
    if ($lower.Contains($pair[0])) { return $pair[1] }
  }

  $name = $id
  if ($name.Contains('!')) { $name = $name.Substring(0, $name.IndexOf('!')) }
  if ($name.Contains('_')) { $name = $name.Substring(0, $name.IndexOf('_')) }
  $name = $name -replace '#', '\'
  # reverse-DNS package ids (com.vendor.app) read better as the vendor/product segment
  if ($name.Contains('.') -and -not $name.Contains('\') -and -not $name.Contains(':')) {
    $segments = @($name.Split('.') | Where-Object { $_ })
    if ($segments.Count -ge 3 -and @('com', 'org', 'net', 'io', 'app', 'de', 'co', 'me') -contains $segments[0]) {
      return $segments[1]
    }
    if ($segments.Count -eq 2) { return $segments[1] }
  }
  try { $name = [System.IO.Path]::GetFileNameWithoutExtension($name) } catch { }
  if ([string]::IsNullOrWhiteSpace($name)) { return 'Media' }
  $name = $name.Substring(0, 1).ToUpperInvariant() + $name.Substring(1)
  return $name
}

function Get-Artwork($props) {
  try {
    $ref = $props.Thumbnail
    if (-not $ref) { return $null }
    $stream = Await-Result ($ref.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType]) 4000
    if (-not $stream) { return $null }

    # PowerShell cannot bind the WinRT stream extension method directly, so reflect it.
    if (-not $script:asStreamForRead) {
      $script:asStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() |
        Where-Object { $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1 } |
        Select-Object -First 1
    }
    if (-not $script:asStreamForRead) { return $null }

    $net = $script:asStreamForRead.Invoke($null, @($stream))
    if (-not $net) { return $null }
    $buffer = New-Object System.IO.MemoryStream
    $net.CopyTo($buffer)
    $bytes = $buffer.ToArray()
    $net.Dispose()
    $buffer.Dispose()
    try { $stream.Dispose() } catch { }

    if (-not $bytes -or $bytes.Length -lt 64 -or $bytes.Length -gt 4000000) { return $null }
    $mime = 'image/png'
    if ($bytes.Length -gt 2) {
      if ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8) { $mime = 'image/jpeg' }
      elseif ($bytes[0] -eq 0x52 -and $bytes[1] -eq 0x49) { $mime = 'image/webp' }
      elseif ($bytes[0] -eq 0x47 -and $bytes[1] -eq 0x49) { $mime = 'image/gif' }
    }
    return ('data:' + $mime + ';base64,' + [Convert]::ToBase64String($bytes))
  } catch {
    return $null
  }
}

function Get-BestSession($sessions) {
  if (-not $sessions) { return $null }
  $best = $null
  $bestStamp = $null
  foreach ($session in $sessions) {
    $status = ''
    try { $status = $session.GetPlaybackInfo().PlaybackStatus.ToString() } catch { continue }
    if ($status -eq 'Playing') { return $session }
    $stamp = [DateTime]::MinValue
    try { $stamp = $session.GetTimelineProperties().LastUpdatedTime.UtcDateTime } catch { }
    if (-not $best -or $stamp -gt $bestStamp) { $best = $session; $bestStamp = $stamp }
  }
  return $best
}

function Read-Media {
  $manager = Get-SmtcManager
  if (-not $manager) { return @{ active = $false } }

  $sessions = $null
  try { $sessions = $manager.GetSessions() } catch { $script:manager = $null; return @{ active = $false } }
  if (-not $sessions -or $sessions.Count -eq 0) { return @{ active = $false } }

  $session = Get-BestSession $sessions
  if (-not $session) { return @{ active = $false } }

  $props = $null
  try {
    $props = Await-Result ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]) 6000
  } catch { }
  if (-not $props) { return @{ active = $false } }

  $title = ''
  $artist = ''
  $album = ''
  try { $title = [string]$props.Title } catch { }
  try { $artist = [string]$props.Artist } catch { }
  try { $album = [string]$props.AlbumTitle } catch { }

  $status = 'none'
  $canNext = $false
  $canPrev = $false
  $canSeek = $false
  try {
    $info = $session.GetPlaybackInfo()
    switch ([string]$info.PlaybackStatus) {
      'Playing' { $status = 'playing' }
      'Paused' { $status = 'paused' }
      'Stopped' { $status = 'stopped' }
      'Opened' { $status = 'paused' }
      'Changing' { $status = 'paused' }
      'Closed' { $status = 'stopped' }
      default { $status = 'paused' }
    }
    $controls = $info.Controls
    $canNext = [bool]$controls.IsNextEnabled
    $canPrev = [bool]$controls.IsPreviousEnabled
    $canSeek = [bool]$controls.IsPlaybackPositionEnabled
  } catch { }

  $position = 0.0
  $duration = 0.0
  try {
    $timeline = $session.GetTimelineProperties()
    $position = Safe-Number $timeline.Position.TotalSeconds 0
    $duration = Safe-Number $timeline.EndTime.TotalSeconds 0
    if ($duration -le 0) { $duration = Safe-Number $timeline.MaxSeekTime.TotalSeconds 0 }
  } catch { }

  if ($position -lt 0) { $position = 0 }
  if ($duration -lt 0) { $duration = 0 }
  if ($duration -gt 0 -and $position -gt $duration) { $position = $duration }

  $appId = ''
  try { $appId = [string]$session.SourceAppUserModelId } catch { }

  $key = ('{0}|{1}|{2}|{3}|{4}' -f $appId, $title, $artist, $album, [int]$duration)

  if ($key -ne $script:artKey) {
    $script:artKey = $key
    $script:art = $null
    $script:artTries = 0
  }
  if (-not $script:art -and $script:artTries -lt 2) {
    $script:artTries = $script:artTries + 1
    $script:art = Get-Artwork $props
  }

  return @{
    active = $true
    appId = $appId
    appName = (Get-AppName $appId)
    title = $title
    artist = $artist
    album = $album
    status = $status
    position = [double]$position
    duration = [double]$duration
    canNext = $canNext
    canPrev = $canPrev
    canSeek = $canSeek
    artwork = $script:art
    trackKey = $key
    sampledAt = [long]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
  }
}

# --- system snapshot ------------------------------------------------------
$script:brightness = $null
$script:brightnessAt = [DateTime]::MinValue
# WMI brightness costs ~200ms, so it is sampled off the main loop: a brightness
# key press has to reach the notch inside a couple of hundred milliseconds.
$script:brightnessState = $null
$script:network = @{ online = $true; name = $null }
$script:networkAt = [DateTime]::MinValue
$script:devices = @{ mic = $false; micApps = @(); camera = $false; cameraApps = @() }
$script:devicesAt = [DateTime]::MinValue
$script:foreground = $null
$script:foregroundAt = [DateTime]::MinValue

function Get-DeviceName([string]$raw) {
  if ([string]::IsNullOrWhiteSpace($raw)) { return 'Unknown app' }
  $name = $raw -replace '#', '\'
  if ($name.Contains('_')) { $name = $name.Substring(0, $name.IndexOf('_')) }
  try {
    $file = [System.IO.Path]::GetFileNameWithoutExtension($name)
    if (-not [string]::IsNullOrWhiteSpace($file)) { $name = $file }
  } catch { }
  return $name
}

function Get-DeviceUse([ValidateSet('microphone', 'webcam')][string]$kind) {
  $active = $false
  $apps = New-Object System.Collections.Generic.List[string]
  $root = "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\$kind"
  if (-not (Test-Path $root)) { return @{ active = $false; apps = @() } }
  try {
    $entries = @(Get-ChildItem -Path $root -ErrorAction SilentlyContinue)
    foreach ($entry in $entries) {
      $candidates = @($entry)
      $nested = @(Get-ChildItem -Path $entry.PSPath -ErrorAction SilentlyContinue)
      foreach ($n in $nested) { $candidates += $n }
      foreach ($candidate in $candidates) {
        $props = Get-ItemProperty -Path $candidate.PSPath -ErrorAction SilentlyContinue
        if (-not $props) { continue }
        if (-not ($props.PSObject.Properties.Name -contains 'LastUsedTimeStart')) { continue }
        $start = $props.LastUsedTimeStart
        if (-not $start -or $start -eq 0) { continue }
        $stop = 0
        if ($props.PSObject.Properties.Name -contains 'LastUsedTimeStop') { $stop = $props.LastUsedTimeStop }
        if ($stop -ne 0) { continue }
        $active = $true
        $app = Get-DeviceName $candidate.PSChildName
        if ($app -and -not $apps.Contains($app)) { $apps.Add($app) }
      }
    }
  } catch { }
  return @{ active = $active; apps = @($apps.ToArray()) }
}

function Read-Network {
  $online = $false
  $name = $null
  try {
    $nics = [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()
    foreach ($nic in $nics) {
      if ($nic.OperationalStatus -ne 'Up') { continue }
      if ($nic.NetworkInterfaceType -eq 'Loopback') { continue }
      $ipProps = $nic.GetIPProperties()
      $hasAddress = $false
      foreach ($addr in $ipProps.UnicastAddresses) {
        if ($addr.Address.AddressFamily -eq 'InterNetwork' -and
            -not $addr.Address.IPAddressToString.StartsWith('169.254')) { $hasAddress = $true; break }
      }
      if ($hasAddress) {
        $online = $true
        if ([string]::IsNullOrWhiteSpace($name)) { $name = $nic.Name }
      }
    }
  } catch { }
  return @{ online = $online; name = $name }
}

function Read-Brightness {
  $value = $null
  try {
    $monitors = Get-CimInstance -Namespace 'root/WMI' -ClassName WmiMonitorBrightness -ErrorAction Stop
    if ($monitors) {
      $first = @($monitors)[0]
      if ($null -ne $first.CurrentBrightness) { $value = [int]$first.CurrentBrightness }
    }
  } catch { }
  return $value
}

Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;

[StructLayout(LayoutKind.Sequential)]
public struct NotchaRect {
  public int Left;
  public int Top;
  public int Right;
  public int Bottom;
}

[StructLayout(LayoutKind.Sequential)]
public struct NotchaMonitorInfo {
  public int cbSize;
  public NotchaRect rcMonitor;
  public NotchaRect rcWork;
  public uint dwFlags;
}

public class NotchaForeground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out NotchaRect rect);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr monitor, ref NotchaMonitorInfo info);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder name, int max);
}
'@ -ErrorAction SilentlyContinue | Out-Null

# The process owning the foreground window: that is what "screen time" counts.
function Read-ForegroundApp {
  try {
    $handle = [NotchaForeground]::GetForegroundWindow()
    if ($handle -eq [IntPtr]::Zero) { return $null }
    [uint32]$owner = 0
    [void][NotchaForeground]::GetWindowThreadProcessId($handle, [ref]$owner)
    if ($owner -eq 0) { return $null }
    $process = Get-Process -Id $owner -ErrorAction Stop
    return $process.ProcessName
  } catch {
    return $null
  }
}

# A foreground window that covers its whole monitor is a fullscreen app: a video
# in a browser, a game, a fullscreen player. A merely maximised window only
# covers the work area, so it never matches.
function Test-FullscreenForeground {
  try {
    $handle = [NotchaForeground]::GetForegroundWindow()
    if ($handle -eq [IntPtr]::Zero) { return $false }
    if (-not [NotchaForeground]::IsWindowVisible($handle)) { return $false }
    $class = New-Object System.Text.StringBuilder 256
    [void][NotchaForeground]::GetClassName($handle, $class, 256)
    $name = $class.ToString()
    # The desktop and the taskbar span the screen without being fullscreen apps.
    if ($name -eq 'Progman' -or $name -eq 'WorkerW' -or $name -eq 'Shell_TrayWnd' -or $name -eq 'Shell_SecondaryTrayWnd') { return $false }
    $rect = New-Object NotchaRect
    if (-not [NotchaForeground]::GetWindowRect($handle, [ref]$rect)) { return $false }
    # MONITOR_DEFAULTTONEAREST = 2
    $monitor = [NotchaForeground]::MonitorFromWindow($handle, 2)
    if ($monitor -eq [IntPtr]::Zero) { return $false }
    $info = New-Object NotchaMonitorInfo
    $info.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($info)
    if (-not [NotchaForeground]::GetMonitorInfo($monitor, [ref]$info)) { return $false }
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    $monitorWidth = $info.rcMonitor.Right - $info.rcMonitor.Left
    $monitorHeight = $info.rcMonitor.Bottom - $info.rcMonitor.Top
    # One pixel of slack for a window that rounds its bounds at a scaled DPI.
    return (($width -ge ($monitorWidth - 1)) -and ($height -ge ($monitorHeight - 1)))
  } catch {
    return $false
  }
}

function Read-System {
  $volume = $null
  $muted = $false
  if ($audioOk) {
    [float]$level = 0
    [bool]$silent = $false
    if ([NotchVolume]::Read([ref]$level, [ref]$silent)) {
      $volume = [int][Math]::Round($level * 100)
      $muted = [bool]$silent
    }
  }

  $caps = $false
  try { $caps = [bool][Console]::CapsLock } catch { }

  $now = [DateTime]::UtcNow
  if ($script:brightnessState) {
    $script:brightness = $script:brightnessState.value
  } elseif (($now - $script:brightnessAt).TotalSeconds -ge 2) {
    $script:brightnessAt = $now
    $script:brightness = Read-Brightness
  }
  if (($now - $script:networkAt).TotalSeconds -ge 5) {
    $script:networkAt = $now
    $script:network = Read-Network
  }
  if (($now - $script:foregroundAt).TotalSeconds -ge 3) {
    $script:foregroundAt = $now
    $script:foreground = Read-ForegroundApp
  }
  # Fullscreen changes are felt immediately, so this is sampled four times a
  # second rather than with the slower per-app probes above.
  if (($null -eq $script:fullscreenAt) -or (($now - $script:fullscreenAt).TotalMilliseconds -ge 250)) {
    $script:fullscreenAt = $now
    $script:fullscreen = Test-FullscreenForeground
  }
  if (($now - $script:devicesAt).TotalSeconds -ge 4) {
    $script:devicesAt = $now
    $mic = Get-DeviceUse 'microphone'
    $cam = Get-DeviceUse 'webcam'
    $script:devices = @{
      mic = $mic.active; micApps = $mic.apps
      camera = $cam.active; cameraApps = $cam.apps
    }
  }

  return @{
    volume = $volume
    muted = $muted
    brightness = $script:brightness
    capsLock = $caps
    online = $script:network.online
    networkName = $script:network.name
    micActive = [bool]$script:devices.mic
    micApps = @($script:devices.micApps)
    cameraActive = [bool]$script:devices.camera
    cameraApps = @($script:devices.cameraApps)
    foreground = $script:foreground
    fullscreen = [bool]$script:fullscreen
  }
}

# --- control commands -----------------------------------------------------
function Invoke-BridgeCommand([string]$line) {
  $command = $null
  try { $command = $line | ConvertFrom-Json } catch { return }
  if (-not $command -or -not $command.cmd) { return }

  $manager = Get-SmtcManager
  if (-not $manager) { return }
  $session = $null
  try { $session = Get-BestSession ($manager.GetSessions()) } catch { return }
  if (-not $session) { return }

  try {
    switch ([string]$command.cmd) {
      'playpause' { Await-Result ($session.TryTogglePlayPauseAsync()) ([bool]) | Out-Null }
      'next' { Await-Result ($session.TrySkipNextAsync()) ([bool]) | Out-Null }
      'prev' { Await-Result ($session.TrySkipPreviousAsync()) ([bool]) | Out-Null }
      'seek' {
        $seconds = Safe-Number $command.value -1
        if ($seconds -ge 0) {
          $ticks = [long]($seconds * 10000000)
          Await-Result ($session.TryChangePlaybackPositionAsync($ticks)) ([bool]) | Out-Null
        }
      }
    }
  } catch { }
  $script:forceMedia = $true
}

# --- main loop ------------------------------------------------------------
$script:forceMedia = $false

Send-Payload @{
  t = 'ready'
  data = @{
    pid = $PID
    powershell = $PSVersionTable.PSVersion.ToString()
    audio = $audioOk
  }
}

if ($Once) {
  for ($i = 0; $i -lt $OnceCount; $i++) {
    Send-Payload @{ t = 'sys'; data = (Read-System) }
    Send-Payload @{ t = 'media'; data = (Read-Media) }
    Start-Sleep -Milliseconds 400
  }
  exit 0
}

# stdin reader on its own runspace so the polling loop never blocks
$script:queue = New-Object System.Collections.Concurrent.ConcurrentQueue[object]
$script:reader = [PowerShell]::Create()
$null = $script:reader.AddScript({
  param($queue)
  while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    $trimmed = $line.Trim()
    if ($trimmed.Length -gt 0) { $queue.Enqueue($trimmed) }
  }
  $queue.Enqueue('__notch_eof__')
}).AddArgument($script:queue)
$script:readerHandle = $script:reader.BeginInvoke()

# Background brightness sampler: a shared table the main loop reads instantly.
$script:brightnessState = [hashtable]::Synchronized(@{ value = $null })
$script:brightnessReader = [PowerShell]::Create()
$null = $script:brightnessReader.AddScript({
  param($state)
  while ($true) {
    try {
      $monitors = @(Get-CimInstance -Namespace 'root/WMI' -ClassName WmiMonitorBrightness -ErrorAction Stop)
      if ($monitors.Count -gt 0 -and $null -ne $monitors[0].CurrentBrightness) {
        $state.value = [int]$monitors[0].CurrentBrightness
      }
    } catch { }
    Start-Sleep -Milliseconds 15
  }
}).AddArgument($script:brightnessState)
$script:brightnessHandle = $script:brightnessReader.BeginInvoke()

$lastSysJson = ''
$lastSysSentAt = [DateTime]::MinValue
$lastMediaSig = ''
$lastMediaSentAt = [DateTime]::MinValue
$lastSysAt = [DateTime]::MinValue
$lastMediaAt = [DateTime]::MinValue
$startedAt = [DateTime]::UtcNow

try {
  while ($true) {
    $processed = 0
    $item = $null
    while ($script:queue.TryDequeue([ref]$item)) {
      if ($item -eq '__notch_eof__') { exit 0 }
      Invoke-BridgeCommand ([string]$item)
      $item = $null
      $processed++
      if ($processed -gt 40) { break }
    }

    $now = [DateTime]::UtcNow

    if (($now - $lastSysAt).TotalMilliseconds -ge 60) {
      $lastSysAt = $now
      $system = Read-System
      $json = $system | ConvertTo-Json -Compress -Depth 6
      $due = ($now - $lastSysSentAt).TotalSeconds -ge 4
      if ($json -ne $lastSysJson -or $due) {
        $lastSysJson = $json
        $lastSysSentAt = $now
        Send-Payload @{ t = 'sys'; data = $system }
      }
    }

    if ($script:forceMedia -or ($now - $lastMediaAt).TotalMilliseconds -ge 700) {
      $lastMediaAt = $now
      $script:forceMedia = $false
      $media = Read-Media
      $sig = ''
      if ($media.active) {
        $sig = '{0}|{1}|{2}|{3}' -f $media.trackKey, $media.status, [int]$media.position, [bool]($media.artwork)
      } else {
        $sig = 'inactive'
      }
      $due = ($now - $lastMediaSentAt).TotalSeconds -ge 10
      if ($sig -ne $lastMediaSig -or $due) {
        $lastMediaSig = $sig
        $lastMediaSentAt = $now
        Send-Payload @{ t = 'media'; data = $media }
        if (-not $media.active) { $script:manager = $null }
      }
    }

    Start-Sleep -Milliseconds 20
  }
} catch {
  Send-Payload @{ t = 'error'; data = @{ message = [string]$_.Exception.Message } }
}
