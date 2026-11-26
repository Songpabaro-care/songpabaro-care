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
    Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Minimized', '-File', ('"' + $SELF + '"'))
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
function Read-Status($w) {
  $t = New-Object System.Collections.Generic.List[string]
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
$RX = '자료\s*수신\s*Unit\[(?<u>[^\]]+)\].*?Date\[(?<d>[^\]]*)\](?:\[(?<tm>[^\]]*)\])?.*?ID\[(?<id>\d+)\]'

function Handle([string]$unit, [string]$id) {
  $uk = UnitKey $unit
  if (-not $uk) { Log "알 수 없는 기계 $unit · ID $id"; Ev "recv" "📥 검사 결과 도착 · #$id" "$unit"; return }
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
    Ev "recv" "📥 검사 결과 도착 · $who" "$($UN[$uk]) 결과 도착 (케어 노트 오더 없음)"
  }
}

Try-Update
$lastUp = Get-Date
if ($script:startToast) { Toast "송파바로 LIS 연동 시작" "검사 결과가 들어오면 이 자리에 알림이 떠요" }
$seen = @{}; $first = $true; $lastHb = [datetime]::MinValue; $st = 'nolis'; $lastTxt = ''
while ($true) {
  try {
    $w = Find-Lis
    if (-not $w) { $st = 'nolis'; $script:SE = $null }
    else {
      $st = 'ok'
      $txt = Read-Status $w
      if ($Diag -and $txt -ne $lastTxt) { Log "[진단] 읽은 글자: $txt"; $lastTxt = $txt }
      foreach ($m in [regex]::Matches($txt, $RX)) {
        $key = "$($m.Groups['u'].Value)|$($m.Groups['d'].Value)|$($m.Groups['tm'].Value)|$($m.Groups['id'].Value)"
        if ($seen.ContainsKey($key)) { continue }
        $seen[$key] = 1
        if ($first) { continue }   # 시작 전에 이미 떠 있던 줄은 처리하지 않음
        Handle $m.Groups['u'].Value $m.Groups['id'].Value
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
