# 송파바로 케어 노트 · 인투벳 LIS 결과 자동 감지 (서버 PC용)  [SB-LIS]
# 하는 일: IntoVET_LIS 창 아래 상태줄의 "자료 수신 Unit[..] ID[동물번호]" 글자만 읽어서
#          케어 노트 검사 오더에 "결과 도착"을 표시하고, 필요한 기계 결과가 다 오면 검사실 완료로 바꿉니다.
# 인투벳·LIS 프로그램과 그 DB에는 아무것도 쓰지 않습니다. (화면 글자 읽기만)
param([switch]$Diag)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try { $Host.UI.RawUI.WindowTitle = 'SongpaBaro LIS' } catch {}
$KEY  = 'AIzaSyB7SmDVueDq1ghmIbNTjcHGxMM2vpHSvWw'
$DB   = 'https://songpabaro-default-rtdb.asia-southeast1.firebasedatabase.app'
$ROOM = 'songpa-baro-care'
$NAME = '서버PC LIS 연동'
$DIR  = Join-Path $env:APPDATA 'songpabaro-lis'
New-Item -ItemType Directory -Force -Path $DIR | Out-Null
$AUTHF = Join-Path $DIR 'auth.json'
$LOGF  = Join-Path $DIR 'log.txt'

function Log([string]$m) {
  $l = "$(Get-Date -Format 'MM-dd HH:mm:ss')  $m"
  Write-Host $l
  try { Add-Content -Path $LOGF -Value $l -Encoding UTF8 } catch {}
}
function NowMs { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }

# ---------- 자동 업데이트: 저장소에 새 버전이 올라오면 스스로 바꾸고 다시 시작 ----------
$SELF = $PSCommandPath
$script:MTX = New-Object System.Threading.Mutex($false, 'Global\SongpaBaroLIS')
$got = $false
try { $got = $script:MTX.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $got = $true }
if (-not $got) {
  Write-Host '이미 실행 중이에요. 작업표시줄의 SongpaBaro LIS 창을 닫고 다시 실행해 주세요.'
  Start-Sleep -Seconds 8; exit
}
$UPURL = 'https://songpabaro-care.github.io/songpabaro-care/lis/sb-lis.ps1'
function Try-Update {
  try {
    $tmp = Join-Path $env:TEMP 'sb-lis.new.ps1'
    Invoke-WebRequest -UseBasicParsing -Uri ($UPURL + '?v=' + (NowMs)) -OutFile $tmp
    $len = (Get-Item $tmp).Length
    if ($len -lt 3000) { return }
    $txt = [IO.File]::ReadAllText($tmp, [Text.Encoding]::UTF8)
    if ($txt -notmatch '\[SB-LIS\]') { return }
    if ((Get-FileHash $tmp -Algorithm SHA256).Hash -eq (Get-FileHash $SELF -Algorithm SHA256).Hash) { return }
    Copy-Item $tmp $SELF -Force
    Log '새 버전을 받았어요 · 다시 시작합니다'
    try { $script:MTX.ReleaseMutex() } catch {}
    $args2 = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $SELF + '"')); if ($Diag) { $args2 += '-Diag' } else { $args2 = @('-WindowStyle', 'Minimized') + $args2 }
    Start-Process powershell -ArgumentList $args2
    exit
  } catch { Log "업데이트 확인 실패: $($_.Exception.Message)" }
}

# ---------- 로그인 (케어 노트와 같은 기기 승인 방식) ----------
$script:A = $null; $script:tok = $null; $script:exp = [datetime]::MinValue
function Get-Tok {
  if ($script:tok -and (Get-Date) -lt $script:exp) { return $script:tok }
  if (-not $script:A -and (Test-Path $AUTHF)) { $script:A = Get-Content $AUTHF -Raw -Encoding UTF8 | ConvertFrom-Json }
  if ($script:A) {
    $r = Invoke-RestMethod -Method Post -Uri "https://securetoken.googleapis.com/v1/token?key=$KEY" -ContentType 'application/x-www-form-urlencoded' -Body "grant_type=refresh_token&refresh_token=$($script:A.rt)"
    $script:A.rt = $r.refresh_token; $script:tok = $r.id_token; $script:exp = (Get-Date).AddSeconds([int]$r.expires_in - 120)
  } else {
    $r = Invoke-RestMethod -Method Post -Uri "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$KEY" -ContentType 'application/json' -Body '{"returnSecureToken":true}'
    $script:A = [pscustomobject]@{ uid = $r.localId; rt = $r.refreshToken }
    $script:tok = $r.idToken; $script:exp = (Get-Date).AddSeconds([int]$r.expiresIn - 120)
  }
  $script:A | ConvertTo-Json | Set-Content -Path $AUTHF -Encoding UTF8
  return $script:tok
}
function Fb([string]$method, [string]$path, $body) {
  $u = "$DB/$path.json?auth=$(Get-Tok)"
  if ($null -ne $body) {
    $j = if ($body -is [string]) { $body } else { $body | ConvertTo-Json -Depth 8 -Compress }
    return Invoke-RestMethod -Method $method -Uri $u -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($j))
  }
  return Invoke-RestMethod -Method $method -Uri $u
}
function JsonStr([string]$s) { ($s | ConvertTo-Json -Compress) }

Get-Tok | Out-Null
$uid = $script:A.uid
$code = $uid.Substring([Math]::Max(0, $uid.Length - 6)).ToUpper()
Fb 'Put' "devices/$uid/name" (JsonStr $NAME) | Out-Null
Fb 'Put' "devices/$uid/t" (NowMs) | Out-Null
while ($true) {
  $ok = $false
  try { $ok = (Fb 'Get' "devices/$uid/ok" $null) -eq $true } catch {}
  if ($ok) { break }
  Log "승인 대기 중 · 케어 노트 🔐 기기 관리에서 '$NAME' (코드 $code) 를 승인해 주세요"
  Start-Sleep -Seconds 10
}
Log "승인됨 · LIS 감시를 시작합니다 (코드 $code)"
$script:startToast = $true

# ---------- LIS 화면 글자 읽기 (윈도우 UI Automation) ----------
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$AE = [Windows.Automation.AutomationElement]
$TS = [Windows.Automation.TreeScope]
$script:SE = $null
function Find-Lis {
  $c = New-Object Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [Windows.Automation.ControlType]::Window)
  foreach ($w in $AE::RootElement.FindAll($TS::Children, $c)) { if ($w.Current.Name -like 'IntoVET_LIS*') { return $w } }
  return $null
}
# 윈도우 기본 방식(WM_GETTEXT)으로 자식 창 글자 읽기 · UI Automation이 글자를 잘라 읽는 경우 대비
Add-Type -TypeDefinition @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class SbW32 {
  public delegate bool EP(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr p, EP f, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, StringBuilder l, uint f, uint t, out IntPtr r);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint f, uint t, out IntPtr r);
  public static List<string> Texts(IntPtr top) {
    var res = new List<string>();
    EP cb = (h, l) => {
      IntPtr n; SendMessageTimeout(h, 0x000E, IntPtr.Zero, IntPtr.Zero, 2, 200, out n);
      int len = (int)n;
      if (len > 0 && len < 4000) { var sb = new StringBuilder(len + 2); IntPtr r2; SendMessageTimeout(h, 0x000D, (IntPtr)(len + 1), sb, 2, 200, out r2); res.Add(sb.ToString()); }
      return true;
    };
    EnumChildWindows(top, cb, IntPtr.Zero); GC.KeepAlive(cb);
    return res;
  }
}
"@
function Read-Status($w) {
  $t = New-Object System.Collections.Generic.List[string]
  try { foreach ($x in [SbW32]::Texts([IntPtr]$w.Current.NativeWindowHandle)) { if ($x -match '자료\s*수신') { $t.Add($x) } } } catch {}
  if ($t.Count -and (($t -join ' ') -match 'ID\[\d+\]')) { return ($t -join ' | ') }
  try {
    $c = New-Object Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [Windows.Automation.ControlType]::StatusBar)
    $sb = $w.FindFirst($TS::Descendants, $c)
    if ($sb) {
      $t.Add($sb.Current.Name)
      foreach ($e in $sb.FindAll($TS::Descendants, [Windows.Automation.Condition]::TrueCondition)) { $t.Add($e.Current.Name) }
    }
  } catch {}
  if (-not (($t -join ' ') -match '자료\s*수신')) {
    if (-not $script:SE) {
      foreach ($e in $w.FindAll($TS::Descendants, [Windows.Automation.Condition]::TrueCondition)) {
        try { if ($e.Current.Name -match '자료\s*수신') { $script:SE = $e; break } } catch {}
      }
    }
    if ($script:SE) { try { $t.Add($script:SE.Current.Name) } catch { $script:SE = $null } }
  }
  return ($t -join ' | ')
}
function UnitKey([string]$u) {
  if ($u -match 'NX\s*700') { return 'NX700' }
  if ($u -match '2800') { return 'BC2800' }
  if ($u -match 'AU10|IMMUNO') { return 'AU10V' }
  if ($u -match 'Smart') { return 'ISMART' }
  if ($u -match 'AniKo') { return 'ANIKO' }
  return $null
}

# ---------- 윈도우 우측 아래 알림 ----------
$script:NI = $null
function Toast([string]$title, [string]$body) {
  try {
    [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
    [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
    $t = [Security.SecurityElement]::Escape($title); $b = [Security.SecurityElement]::Escape($body)
    $x = New-Object Windows.Data.Xml.Dom.XmlDocument
    $x.LoadXml("<toast duration='long'><visual><binding template='ToastGeneric'><text>$t</text><text>$b</text></binding></visual><audio silent='true'/></toast>")
    $n = [Windows.UI.Notifications.ToastNotification]::new($x)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe').Show($n)
  } catch {
    try {
      if (-not $script:NI) {
        Add-Type -AssemblyName System.Windows.Forms, System.Drawing
        $script:NI = New-Object System.Windows.Forms.NotifyIcon
        $script:NI.Icon = [System.Drawing.SystemIcons]::Information
        $script:NI.Visible = $true
      }
      $script:NI.ShowBalloonTip(20000, $title, $body, [System.Windows.Forms.ToolTipIcon]::Info)
    } catch { Log "알림 표시 실패: $($_.Exception.Message)" }
  }
}
# 케어 노트로 알림 보내기 (모든 PC에 알림 문구, 소리는 소리 켠 PC만)
function Ev([string]$kind, [string]$title, [string]$body) {
  try { Fb 'Put' "rooms/$ROOM/lis/ev" (@{ t = @{ '.sv' = 'timestamp' }; kind = $kind; title = $title; body = $body }) | Out-Null } catch { Log "알림 전송 실패: $($_.Exception.Message)" }
}
function PetName([string]$id) {
  foreach ($r in 'care_patients', 'checkup_patients') {
    try {
      $ps = Fb 'Get' "rooms/$ROOM/$r" $null
      if ($ps) { foreach ($p in $ps.PSObject.Properties) { $v = $p.Value; if ($v -and ((("" + $v.chartNo) -replace '\D', '') -eq $id)) { return $v.name } } }
    } catch {}
  }
  return $null
}
$UN = @{ NX700 = 'NX700 혈청화학'; BC2800 = 'BC-2800 CBC'; AU10V = 'AU10V 면역'; ISMART = 'i-Smart 전해질·가스'; ANIKO = 'AniKo 키트' }
# LIS 목록에서 "기계 · 날짜 · 시간 · ID[번호]" 줄 찾기
function Get-Names($w) {
  $l = New-Object System.Collections.Generic.List[string]
  try { foreach ($e in $w.FindAll($TS::Descendants, [Windows.Automation.Condition]::TrueCondition)) { try { $n = $e.Current.Name; if ($n) { $l.Add($n) } } catch {} } } catch {}
  return $l
}
$URX = '^(FDC|BC-|TTAni|i-Smart|I-Smart|IMMUNO)'
function Get-Rows($names) {
  $rows = @(); $cur = $null
  foreach ($n in $names) {
    $full = [regex]::Match($n, '(?<u>(FDC[_ ][^\s]+|BC-\S+|TTAni\S+|[iI]-Smart\S+|FDC IMMUNO \S+)).*?(?<d>\d{4}-\d{2}-\d{2}).*?(?<tm>\d{1,2}:\d{2}:\d{2}).*?ID\[(?<id>\d+)\]')
    if ($full.Success) { $rows += [pscustomobject]@{ u = $full.Groups['u'].Value; d = $full.Groups['d'].Value; tm = $full.Groups['tm'].Value; id = $full.Groups['id'].Value }; $cur = $null; continue }
    if ($n -match $URX -and $n.Length -lt 40) { if ($cur -and $cur.id) { $rows += $cur }; $cur = [pscustomobject]@{ u = $n.Trim(); d = ''; tm = ''; id = '' }; continue }
    if ($cur) {
      if (-not $cur.d -and $n -match '^\s*(\d{4}-\d{2}-\d{2})\s*$') { $cur.d = $Matches[1]; continue }
      if (-not $cur.tm -and $n -match '^\s*(\d{1,2}:\d{2}:\d{2})\s*$') { $cur.tm = $Matches[1]; continue }
      if (-not $cur.id -and $n -match 'ID\[(\d+)\]') { $cur.id = $Matches[1]; $rows += $cur; $cur = $null; continue }
    }
  }
  if ($cur -and $cur.id) { $rows += $cur }
  return $rows
}
function Dump-Lis($w, $names) {
  try {
    $f = Join-Path $DIR 'dump.txt'
    $out = New-Object System.Collections.Generic.List[string]
    $out.Add("== LIS 화면 글자 (" + (Get-Date) + ") ==")
    $i = 0; foreach ($n in $names) { $i++; if ($i -gt 600) { break }; $out.Add("$i`t$n") }
    $roots = New-Object System.Collections.Generic.List[string]
    try {
      $pidv = $w.Current.ProcessId
      $exe = (Get-Process -Id $pidv).Path
      if (-not $exe) { $exe = (Get-CimInstance Win32_Process -Filter "ProcessId=$pidv").ExecutablePath }
      if ($exe) { $roots.Add((Split-Path $exe)); $out.Add(""); $out.Add("LIS 프로그램: $exe") } else { $out.Add("LIS 프로그램 위치를 못 찾음") }
    } catch { $out.Add("LIS 위치 확인 실패: $($_.Exception.Message)") }
    foreach ($d in 'C', 'D', 'E') { foreach ($n in 'IntoCNS', 'IntoCNS2', 'IntoVet', 'IntoVET_LIS') { $roots.Add("${d}:\$n") } }
    foreach ($r in ($roots | Select-Object -Unique)) {
      if (-not (Test-Path $r)) { continue }
      $out.Add(""); $out.Add("== 최근 바뀐 파일: $r ==")
      try {
        Get-ChildItem -Path $r -Recurse -Depth 3 -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-1) } | Sort-Object LastWriteTime -Descending | Select-Object -First 25 | ForEach-Object { $out.Add("$($_.LastWriteTime.ToString('HH:mm:ss'))  $($_.Length)B  $($_.FullName)") }
      } catch { $out.Add("읽기 실패: $($_.Exception.Message)") }
    }
    $out | Set-Content -Path $f -Encoding UTF8
    Start-Process notepad.exe $f
    Log "[진단] 화면 글자 목록을 저장했어요: $f"
  } catch { Log "진단 저장 실패: $($_.Exception.Message)" }
}
$RX = '자료\s*수신\s*Unit\[(?<u>[^\]]+)\].*?Date\[(?<d>[^\]]*)\](?:\[(?<tm>[^\]]*)\])?.*?ID\[(?<id>\d+)\]'

# ---------- LIS 기록 파일(C:\IntoCNS\INTOVET_LIS\Logs\일.Log) 이어 읽기 ----------
$LOGDIRS = @('C:\IntoCNS\INTOVET_LIS\Logs', 'D:\IntoCNS\INTOVET_LIS\Logs', 'E:\IntoCNS\INTOVET_LIS\Logs')
$script:LPOS = @{}
$LRX = 'Unit\[(?<u>[^\]]+)\][^\r\n]*?(?:Date\[(?<d>[^\]]*)\])?(?:\[(?<tm>[^\]]*)\])?[^\r\n]*?ID\[(?<id>\d+)\]'
function Decode([byte[]]$b) {
  $t = [Text.Encoding]::UTF8.GetString($b)
  if ($t.Contains([char]0xFFFD)) { try { $t = [Text.Encoding]::GetEncoding(949).GetString($b) } catch {} }
  return $t
}
# 기록 줄 해석: "[시각] [기계이름]" 다음 줄에 장비 원문이 16진수로 남음 → 풀어서 동물번호 찾기
$script:LUNIT = @{}
$IDRX = @(
  'R,[^,]*,\d{4}-\d{2}-\d{2},\d{1,2}:\d{2},[^,]*,\s*(?<id>\d+)\s*,',   # 후지 FDC (NX700·AU10V)
  'O\|\d*\|(?<id>\d+)\|',                                               # ASTM
  'OBR\|\d*\|(?<id>\d+)\|',                                             # HL7
  'PID\|\d*\|(?<id>\d+)\|'
)
function Parse-LogText([string]$p, [string]$txt) {
  $out = @()
  foreach ($line in ($txt -split "`r?`n")) {
    if ($line -match '\]\s*\[(?<u>(FDC|BC-|TTAni|[iI]-Smart)[^\]]*)\]\s*$') { $script:LUNIT[$p] = $Matches['u'].Trim(); continue }
    $m = [regex]::Match($line, '\]\s*\[\s*(?<h>(?:[0-9A-Fa-f]{2}\s+)+[0-9A-Fa-f]{2})\s*\]')
    if ($m.Success) {
      $bytes = [byte[]]($m.Groups['h'].Value.Trim() -split '\s+' | ForEach-Object { [Convert]::ToByte($_, 16) })
      $asc = [Text.Encoding]::ASCII.GetString($bytes)
      if ($Diag) { Log "[진단] 풀어 쓴 원문 ($($script:LUNIT[$p])): $($asc -replace '[\x00-\x1F]', '·')" }
      foreach ($rx in $IDRX) { $mm = [regex]::Match($asc, $rx); if ($mm.Success -and $script:LUNIT[$p]) { $out += [pscustomobject]@{ u = $script:LUNIT[$p]; d = ''; tm = ''; id = $mm.Groups['id'].Value.TrimStart('0') }; break } }
      continue
    }
    $m2 = [regex]::Match($line, $LRX)
    if ($m2.Success) { $out += [pscustomobject]@{ u = $m2.Groups['u'].Value; d = $m2.Groups['d'].Value; tm = $m2.Groups['tm'].Value; id = $m2.Groups['id'].Value } }
  }
  return $out
}
function LogFiles {
  $day = (Get-Date).Day.ToString()
  $fs = @()
  foreach ($d in $LOGDIRS) { if (Test-Path $d) { foreach ($n in @("$day.Log")) { $p = Join-Path $d $n; if (Test-Path $p) { $fs += $p } } } }
  return $fs
}
function Tail-Logs([switch]$init) {
  $found = @()
  foreach ($p in (LogFiles)) {
    try {
      $len = (Get-Item $p).Length
      if ($init -or -not $script:LPOS.ContainsKey($p)) {
        $script:LPOS[$p] = $len
        if ($Diag -and $false) {
          $fsx = [IO.File]::Open($p, 'Open', 'Read', 'ReadWrite'); $st0 = [Math]::Max(0, $len - 1500); $fsx.Seek($st0, 'Begin') | Out-Null
          $buf = New-Object byte[] ($len - $st0); [void]$fsx.Read($buf, 0, $buf.Length); $fsx.Close()
          $lines = (Decode $buf) -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -Last 4
          Log "[진단] $p 마지막 줄:"; foreach ($l in $lines) { Log "   $l" }
        }
        continue
      }
      $pos = $script:LPOS[$p]
      if ($len -lt $pos) { $pos = 0 }
      if ($len -eq $pos) { continue }
      $fs2 = [IO.File]::Open($p, 'Open', 'Read', 'ReadWrite'); $fs2.Seek($pos, 'Begin') | Out-Null
      $buf = New-Object byte[] ($len - $pos); [void]$fs2.Read($buf, 0, $buf.Length); $fs2.Close()
      $script:LPOS[$p] = $len
      $txt = Decode $buf
      if ($Diag) { foreach ($l in ($txt -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -First 6)) { Log "[진단] 기록: $l" } }
      $found += @(Parse-LogText $p $txt)
    } catch { Log "기록 파일 읽기 실패: $p · $($_.Exception.Message)" }
  }
  return $found
}

function Handle([string]$unit, [string]$id) {
  $uk = UnitKey $unit
  $rk = "$uk|$id"; if (-not $script:RECENT) { $script:RECENT = @{} }
  if ($script:RECENT.ContainsKey($rk) -and ((Get-Date) - $script:RECENT[$rk]).TotalSeconds -lt 180) { return }
  $script:RECENT[$rk] = Get-Date
  if (-not $uk) { Log "알 수 없는 기계 $unit · ID $id"; $nm0 = PetName $id; Ev "done" "✅ 검사 완료 · $(if ($nm0) { "$nm0 " })#$id" "$unit 결과 도착"; return }
  $ords = Fb 'Get' "rooms/$ROOM/orders" $null
  $hit = 0; $now = NowMs
  if (-not $ords) { $ords = [pscustomobject]@{} }
  foreach ($p in $ords.PSObject.Properties) {
    $k = $p.Name; $o = $p.Value
    if (-not $o) { continue }
    if ((("" + $o.chart) -replace '\D', '') -ne $id) { continue }
    $lab = $o.parts.lab
    if (-not $lab -or $lab.s -eq 'done') { continue }
    if ($o.t -and ($now - [int64]$o.t) -gt 86400000) { continue }
    $hit++
    if (-not $o.pname) { $o | Add-Member -NotePropertyName pname -NotePropertyValue ((PetName $id) + "") -Force }
    Fb 'Put' "rooms/$ROOM/orders/$k/recv/$uk" '{".sv":"timestamp"}' | Out-Null
    $an = @($o.an | Where-Object { $_ })
    $got = @(); if ($o.recv) { $got = @($o.recv.PSObject.Properties.Name) }; $got += $uk
    $left = @($an | Where-Object { $got -notcontains $_ })
    if ($an.Count -gt 0 -and -not $o.man -and $left.Count -eq 0) {
      Fb 'Put' "rooms/$ROOM/orders/$k/parts/lab" '{"s":"done","by":"LIS 자동","auto":true,"t":{".sv":"timestamp"}}' | Out-Null
      Log "✅ $($o.pname) #$id · $uk 결과 도착 → 검사실 자동 완료"
      $tests = (@($o.tests) | Where-Object { $_ -notmatch '방사선|초음파' }) -join ', '
      Ev "done" "✅ 검사 완료 · $($o.pname) #$id" "$tests ($($UN[$uk]) 결과 도착 · 자동 완료)"
    } else {
      $why = if ($o.man) { '수기 항목 있음' } elseif ($left.Count) { "남은 기계: $($left -join ', ')" } else { '기계 정보 없는 오더' }
      Log "📥 $($o.pname) #$id · $uk 결과 도착 표시 ($why)"
      Ev "recv" "📥 결과 도착 · $($o.pname) #$id" "$($UN[$uk]) 결과 도착 · $why"
    }
  }
  if (-not $hit) {
    $nm = PetName $id
    Log "$uk · ID $id ($nm) 결과 도착 · 맞는 진행 중 오더 없음"
    $who = if ($nm) { "$nm #$id" } else { "#$id" }
    Ev "done" "✅ 검사 완료 · $who" "$($UN[$uk]) 결과 도착 (케어 노트 오더 없음)"
  }
}

Try-Update
$lastUp = Get-Date
if ($script:startToast) { Toast "송파바로 LIS 연동 시작" "검사 결과가 들어오면 이 자리에 알림이 떠요" }
$script:lastScan = [datetime]::MinValue; $script:dumped = $false
Tail-Logs -init | Out-Null
$seen = @{}; $first = $true; $lastHb = [datetime]::MinValue; $st = 'nolis'; $lastTxt = ''
while ($true) {
  try {
    # 1순위: LIS 기록 파일
    foreach ($r in (Tail-Logs)) {
      $key = "$($r.u)|$($r.d)|$($r.tm)|$($r.id)"
      if ($seen.ContainsKey($key)) { continue }
      $seen[$key] = 1
      Handle $r.u $r.id
    }
    $w = Find-Lis
    if (-not $w) { $st = 'nolis'; $script:SE = $null }
    else {
      $st = 'ok'
      $txt = Read-Status $w
      $chg = $txt -ne $lastTxt
      if ($Diag -and $chg) { Log "[진단] 읽은 글자: $txt" }
      $lastTxt = $txt
      foreach ($m in [regex]::Matches($txt, $RX)) {
        $key = "$($m.Groups['u'].Value)|$($m.Groups['d'].Value)|$($m.Groups['tm'].Value)|$($m.Groups['id'].Value)"
        if ($seen.ContainsKey($key)) { continue }
        $seen[$key] = 1
        if ($first) { continue }   # 시작 전에 이미 떠 있던 줄은 처리하지 않음
        Handle $m.Groups['u'].Value $m.Groups['id'].Value
      }
      # 상태줄에 번호가 안 나오는 경우: 목록에서 기계·시간·ID 줄을 찾아 처리
      if (-not ([regex]::IsMatch($txt, $RX)) -and ($chg -or $first -or ((Get-Date) - $script:lastScan).TotalSeconds -ge 15)) {
        $script:lastScan = Get-Date
        $names = Get-Names $w
        if ($Diag -and -not $script:dumped) { $script:dumped = $true; Dump-Lis $w $names }
        $today = Get-Date -Format 'yyyy-MM-dd'
        foreach ($r in (Get-Rows $names)) {
          if ($r.d -and $r.d -ne $today) { continue }
          $key = "$($r.u)|$($r.d)|$($r.tm)|$($r.id)"
          if ($seen.ContainsKey($key)) { continue }
          $seen[$key] = 1
          if ($first) { continue }
          Handle $r.u $r.id
        }
      }
      $first = $false
    }
    if (((Get-Date) - $lastUp).TotalMinutes -ge 60) { $lastUp = Get-Date; Try-Update }
    if (((Get-Date) - $lastHb).TotalSeconds -ge 60) {
      Fb 'Put' "rooms/$ROOM/lis" (@{ hb = @{ '.sv' = 'timestamp' }; st = $st; dev = $code }) | Out-Null
      $lastHb = Get-Date
    }
  } catch {
    Log "오류: $($_.Exception.Message) · 10초 후 다시 시도"
    Start-Sleep -Seconds 7
  }
  Start-Sleep -Seconds 3
}
