# 송파바로 케어 노트 · 인투벳 LIS 결과 자동 감지 (서버 PC용)  [SB-LIS]
# 하는 일: IntoVET_LIS 창 아래 상태줄의 "자료 수신 Unit[..] ID[동물번호]" 글자만 읽어서
#          케어 노트 검사 오더에 "결과 도착"을 표시하고, 필요한 기계 결과가 다 오면 검사실 완료로 바꿉니다.
# 인투벳·LIS 프로그램과 그 DB에는 아무것도 쓰지 않습니다. (화면 글자 읽기만)
param([switch]$Diag, [switch]$JDiag, [switch]$Reception, [switch]$DbDiag)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try { $Host.UI.RawUI.WindowTitle = 'SongpaBaro LIS' } catch {}
$KEY  = 'AIzaSyB7SmDVueDq1ghmIbNTjcHGxMM2vpHSvWw'
$DB   = 'https://songpabaro-default-rtdb.asia-southeast1.firebasedatabase.app'
$ROOM = 'songpa-baro-care'
$NAME = if ($Reception) { '접수실 인투벳 연동' } else { '서버PC LIS 연동' }
$DIR  = Join-Path $env:APPDATA 'songpabaro-lis'
New-Item -ItemType Directory -Force -Path $DIR | Out-Null
$AUTHF = Join-Path $DIR $(if ($Reception) { 'auth-r.json' } else { 'auth.json' })
$LOGF  = Join-Path $DIR 'log.txt'

function Log([string]$m) {
  $l = "$(Get-Date -Format 'MM-dd HH:mm:ss')  $m"
  Write-Host $l
  try { Add-Content -Path $LOGF -Value $l -Encoding UTF8 } catch {}
}
function NowMs { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }

# ---------- DB 위치 찾기 (읽기만 · 비밀번호는 화면/파일에 쓰지 않음 · 케어 노트에 아무것도 보내지 않음) ----------
if ($DbDiag) {
  $out = New-Object System.Collections.Generic.List[string]
  $out.Add("== 인투벳 DB 위치 진단 (" + (Get-Date) + ") · 읽기만 함 ==")
  $MASK = '(?i)((pwd|password|passwd|pass|비밀번호)\s*[=:]\s*)[^;"''\s]+'
  $out.Add(""); $out.Add("== 이 PC의 SQL 서비스 ==")
  try { Get-Service | Where-Object { $_.Name -match 'SQL|MSSQL|MySQL|Maria|Postgre|Firebird|Oracle' } | ForEach-Object { $out.Add("$($_.Name)  $($_.Status)  $($_.DisplayName)") } } catch {}
  try { $ins = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL' -ErrorAction SilentlyContinue; if ($ins) { $ins.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { $out.Add("SQL 인스턴스: $($_.Name)") } } } catch {}
  $out.Add(""); $out.Add("== ODBC 연결 ==")
  try { Get-OdbcDsn -ErrorAction SilentlyContinue | ForEach-Object { $out.Add("$($_.Name)  $($_.DriverName)  " + (($_.Attribute.GetEnumerator() | Where-Object { $_.Key -match 'Server|Database' } | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ' ')) } } catch {}
  $srv = New-Object System.Collections.Generic.List[string]
  foreach ($root in 'C:\IntoCNS', 'D:\IntoCNS', 'E:\IntoCNS', 'C:\IntoVet', 'C:\Program Files\IntoCNS', 'C:\Program Files (x86)\IntoCNS') {
    if (-not (Test-Path $root)) { continue }
    $out.Add(""); $out.Add("== 설정 파일: $root ==")
    Get-ChildItem $root -Recurse -File -Include *.ini, *.config, *.xml, *.udl, *.cfg, *.conf, *.json -ErrorAction SilentlyContinue | Where-Object { $_.Length -lt 300KB -and $_.FullName -notmatch '\\(Logs?|Temp|Backup)\\' } | Select-Object -First 80 | ForEach-Object {
      $f = $_
      try {
        $ls = Get-Content $f.FullName -Encoding Default -ErrorAction Stop | Where-Object { $_ -match '(?i)server|data\s*source|database|catalog|\bdb|host|port|uid|user|provider|connection|ip\s*[=:]' }
        if ($ls) {
          $out.Add("-- " + $f.FullName)
          foreach ($l in ($ls | Select-Object -First 25)) {
            $m = $l -replace $MASK, '$1(가림)'
            $out.Add("   " + $m.Trim())
            $x = [regex]::Match($l, '(?i)(data\s*source|server|addr|address|host)\s*[=:]\s*([^;"''\s]+)'); if ($x.Success) { $v = $x.Groups[2].Value; if (-not $srv.Contains($v)) { $srv.Add($v) } }
          }
        }
      } catch {}
    }
  }
  foreach ($d in 'localhost', '.\SQLEXPRESS', '(local)') { if (-not $srv.Contains($d)) { $srv.Add($d) } }
  $out.Add(""); $out.Add("== 윈도우 로그인으로 접속 시험 (데이터베이스 이름만 읽음) ==")
  foreach ($sv in ($srv | Select-Object -First 8)) {
    try {
      $cn = New-Object System.Data.SqlClient.SqlConnection("Server=$sv;Integrated Security=true;Connect Timeout=3;Application Name=SongpaBaro-ReadOnly")
      $cn.Open()
      $cm = $cn.CreateCommand(); $cm.CommandText = 'SELECT name FROM sys.databases'; $rd = $cm.ExecuteReader(); $names = @(); while ($rd.Read()) { $names += $rd.GetString(0) }; $rd.Close(); $cn.Close()
      $out.Add("✅ $sv · 접속됨 · DB: " + ($names -join ', '))
    } catch { $out.Add("✖ $sv · " + ($_.Exception.Message -split "`n")[0]) }
  }
  $fj = Join-Path $DIR 'dbdump.txt'; $out | Set-Content -Path $fj -Encoding UTF8; Start-Process notepad.exe $fj
  Write-Host "진단 파일을 열었어요: $fj"; Start-Sleep -Seconds 3; exit
}

# ---------- 접수실 진단 (읽기만 · 케어 노트에 아무것도 보내지 않음) ----------
if ($JDiag) {
  $out = New-Object System.Collections.Generic.List[string]
  $out.Add("== 접수실 진단 (" + (Get-Date) + ") ==")
  try {
    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
    $AEj = [Windows.Automation.AutomationElement]; $TSj = [Windows.Automation.TreeScope]
    $cj = New-Object Windows.Automation.PropertyCondition($AEj::ControlTypeProperty, [Windows.Automation.ControlType]::Window)
    $wins = $AEj::RootElement.FindAll($TSj::Children, $cj)
    foreach ($wj in $wins) { $out.Add("창: " + $wj.Current.Name) }
    $gw = $null; foreach ($wj in $wins) { if ($wj.Current.Name -match 'IntoVet') { $gw = $wj; break } }
    if ($gw) {
      $out.Add(""); $out.Add("== 인투벳 화면에서 읽히는 글자: " + $gw.Current.Name + " ==")
      $i = 0; $all = New-Object System.Collections.Generic.List[string]
      foreach ($e in $gw.FindAll($TSj::Descendants, [Windows.Automation.Condition]::TrueCondition)) {
        try { $n = $e.Current.Name; $ct = $e.Current.ControlType.ProgrammaticName -replace 'ControlType\.', ''; $v = ''
          try { $vp = $e.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern); if ($vp) { $v = $vp.Current.Value } } catch {}
          if ($n -or $v) { $i++; $all.Add("$i`t$ct`t$n`t$v"); if ($i -ge 5000) { break } } } catch {}
      }
      # 진료대기자 목록(외래 대기 · 입원/호텔) 부분을 맨 위에 따로 모아 보여 줌
      $k = -1; for ($j = 0; $j -lt $all.Count; $j++) { if ($all[$j] -match '진료대기자|외래 대기|고객번호|접수시간') { $k = $j; break } }
      if ($k -ge 0) {
        $out.Add("== [진료대기자 목록 부분] " + $all[$k] + " 부터 =="); 
        for ($j = [Math]::Max(0, $k - 5); $j -lt [Math]::Min($all.Count, $k + 40); $j++) { $out.Add($all[$j]) }
      } else { $out.Add("== [진료대기자 목록]을 못 찾음 · 아래 전체에서 동물 이름을 찾아 주세요 ==") }
      # 2차 시도: 옛 방식(MSAA)으로 표(그리드) 안의 줄까지 읽어 보기 — 읽기만 함
      try {
        if (-not ('SbAcc2' -as [type])) {
          Add-Type -ReferencedAssemblies Accessibility -TypeDefinition @"
using System; using System.Collections.Generic; using System.Runtime.InteropServices; using Accessibility;
public static class SbAcc2 {
  [DllImport("oleacc.dll")] static extern int AccessibleObjectFromWindow(IntPtr h, uint id, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out object o);
  [DllImport("oleacc.dll")] static extern int AccessibleChildren(IAccessible p, int start, int cnt, [Out] object[] ch, out int got);
  public static List<string> Dump(IntPtr h, int max) {
    var L = new List<string>(); Guid g = new Guid("618736E0-3C3D-11CF-810C-00AA00389B71"); object o;
    if (AccessibleObjectFromWindow(h, 0xFFFFFFFC, ref g, out o) != 0 || o == null) return L;
    Walk((IAccessible)o, 0, L, max); return L;
  }
  static void Walk(IAccessible a, int d, List<string> L, int max) {
    if (L.Count >= max || d > 30) return;
    int n = 0; try { n = a.accChildCount; } catch {} if (n <= 0) return; if (n > 800) n = 800;
    var ch = new object[n]; int got = 0; try { AccessibleChildren(a, 0, n, ch, out got); } catch { return; }
    for (int i = 0; i < got && L.Count < max; i++) {
      var c = ch[i] as IAccessible; string nm = "", v = ""; int r = 0;
      try { nm = c != null ? c.get_accName(0) : a.get_accName(ch[i]); } catch {}
      try { v = c != null ? c.get_accValue(0) : a.get_accValue(ch[i]); } catch {}
      try { r = Convert.ToInt32(c != null ? c.get_accRole(0) : a.get_accRole(ch[i])); } catch {}
      // 제목줄·메뉴·스크롤바 같은 잡음은 건너뜀
      if (r == 1 || r == 2 || r == 3 || r == 11 || r == 12 || r == 13 || r == 43) continue;
      string tag = (r == 24 ? "[표]" : r == 28 ? "[줄]" : r == 29 ? "[칸]" : r == 33 ? "[목록]" : r == 34 ? "[항목]" : r == 35 ? "[트리]" : r == 36 ? "[트리항목]" : r == 25 ? "[열머리]" : r == 26 ? "[줄머리]" : "");
      if (!String.IsNullOrEmpty(nm) || !String.IsNullOrEmpty(v) || tag != "") L.Add(new String(' ', Math.Min(d, 20)) + tag + nm + "\t" + v);
      if (c != null) Walk(c, d + 1, L, max);
    }
  }
}
"@
        }
        $ma = [SbAcc2]::Dump([IntPtr]$gw.Current.NativeWindowHandle, 30000)
        $out.Add(""); $out.Add("== [MSAA] 읽힌 줄 수: $($ma.Count) ==")
        $hit = @(); for ($j = 0; $j -lt $ma.Count; $j++) { if ($ma[$j] -match '\[(표|줄|칸|목록|항목|트리항목|열머리)\]|Feline|입원실|접수시간|고객번호|동물명') { $hit += $j } }
        $out.Add("== [MSAA] 진료대기자 목록 후보 ([표]/[줄]/[칸]/Feline/입원실 근처) ==")
        $shown = @{}
        foreach ($h in ($hit | Select-Object -First 60)) { for ($j = [Math]::Max(0, $h - 6); $j -le [Math]::Min($ma.Count - 1, $h + 6); $j++) { if (-not $shown[$j]) { $shown[$j] = 1; $out.Add("$j`t" + ($ma[$j] -replace '\d{2,3}-\d{3,4}-\d{4}', '***-****-****')) } } ; $out.Add("   ---") }
        $out.Add(""); $out.Add("== [MSAA 전체] ==")
        for ($j = 0; $j -lt $ma.Count; $j++) { $out.Add("$j`t" + ($ma[$j] -replace '\d{2,3}-\d{3,4}-\d{4}', '***-****-****')) }
      } catch { $out.Add("MSAA 읽기 실패: $($_.Exception.Message)") }
      $out.Add(""); $out.Add("== [UIA 전체] ==")
      foreach ($x in $all) { $out.Add($x) }
    } else { $out.Add("IntoVet 창을 못 찾음 (인투벳을 켠 상태에서 실행해 주세요)") }
  } catch { $out.Add("화면 읽기 실패: $($_.Exception.Message)") }
  foreach ($ld in 'C:\IntoCNS\log', 'D:\IntoCNS\log', 'E:\IntoCNS\log') {
    if (-not (Test-Path $ld)) { continue }
    $out.Add(""); $out.Add("== 오늘 기록 파일: $ld ==")
    Get-ChildItem $ld -File | Where-Object { $_.LastWriteTime -gt (Get-Date).Date } | Sort-Object LastWriteTime -Descending | Select-Object -First 8 | ForEach-Object {
      $out.Add("-- $($_.Name)  $($_.Length)B  $($_.LastWriteTime.ToString('HH:mm:ss'))")
      try { $lines = Get-Content $_.FullName -Tail 12 -Encoding Default; foreach ($l in $lines) { $out.Add("   " + ($l -replace '\d{2,3}-\d{3,4}-\d{4}', '***-****-****')) } } catch {}
    }
  }
  $fj = Join-Path $DIR 'jdump.txt'; $out | Set-Content -Path $fj -Encoding UTF8; Start-Process notepad.exe $fj
  Write-Host "진단 파일을 열었어요: $fj"; Start-Sleep -Seconds 3; exit
}

# ---------- 자동 업데이트: 저장소에 새 버전이 올라오면 스스로 바꾸고 다시 시작 ----------
$SELF = $PSCommandPath
$script:MTX = New-Object System.Threading.Mutex($false, ('Global\SongpaBaroLIS' + $(if ($Reception) { 'R' } else { '' })))
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
    Restart-Self
  } catch { Log "업데이트 확인 실패: $($_.Exception.Message)" }
}
function Restart-Self {
  try { $script:MTX.ReleaseMutex() } catch {}
  $args2 = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $SELF + '"')); if ($Reception) { $args2 += '-Reception' }; if ($Diag) { $args2 += '-Diag' } else { $args2 = @('-WindowStyle', 'Minimized') + $args2 }
  Start-Process powershell -ArgumentList $args2
  exit
}
# 같은 오류가 계속되면 스스로 회복: 3번째 실패 → 로그인 새로 받기, 약 2분 계속 → 프로그램 다시 시작 (10분에 한 번까지)
$script:FAILS = 0
function On-Ok { if ($script:FAILS -ge 3) { Log "✔ 다시 정상으로 연결됐어요" }; $script:FAILS = 0 }
function On-Fail($er) {
  $script:FAILS++
  Log "오류: $(ErrTxt $er) · 10초 후 다시 시도"
  if ($script:FAILS -eq 3) {
    Log "↻ 계속 실패해서 로그인을 새로 받아요"
    $script:tok = $null; $script:exp = [datetime]::MinValue; $script:A = $null
  }
  if ($script:FAILS -ge 12) {
    $rf = Join-Path $DIR 'restart.txt'; $last = [datetime]::MinValue
    try { if (Test-Path $rf) { $last = [datetime](Get-Content $rf -Raw).Trim() } } catch {}
    if (((Get-Date) - $last).TotalMinutes -ge 10) {
      try { Set-Content -Path $rf -Value (Get-Date -Format 'o') } catch {}
      Log "↻ 2분 넘게 계속 실패해서 프로그램을 다시 시작합니다"
      Restart-Self
    } elseif ($script:FAILS -eq 12) {
      Log "⚠ 다시 시작해도 계속 실패해요 · 이 창 사진을 보내 주세요 (계속 재시도 중)"
      try { Toast "⚠ 송파바로 LIS 연동 오류" "자동 회복이 안 돼요. LIS 창 사진을 보내 주세요" } catch {}
    }
  }
}

# ---------- 로그인 (케어 노트와 같은 기기 승인 방식) ----------
$script:A = $null; $script:tok = $null; $script:exp = [datetime]::MinValue
function Get-Tok {
  if ($script:tok -and (Get-Date) -lt $script:exp) { return $script:tok }
  if (-not $script:A -and (Test-Path $AUTHF)) { $script:A = Get-Content $AUTHF -Raw -Encoding UTF8 | ConvertFrom-Json }
  $script:STEP = '로그인 갱신'
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
  $script:STEP = "$method $path"
  if ($null -ne $body) {
    $j = if ($body -is [string]) { $body } else { $body | ConvertTo-Json -Depth 8 -Compress }
    return Invoke-RestMethod -Method $method -Uri $u -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($j))
  }
  return Invoke-RestMethod -Method $method -Uri $u
}
function ErrTxt($er) {
  $m = "$($er.Exception.Message)"
  if ($script:STEP) { $m = "[$($script:STEP)] $m" }
  $d = "$($er.ErrorDetails.Message)" -replace '\s+', ' '
  if ($d) { $m += " · 서버: " + $d.Substring(0, [Math]::Min(200, $d.Length)) }
  return $m
}
function JsonStr([string]$s) { ($s | ConvertTo-Json -Compress) }

# 하루 한 번 케어 노트 전체 백업 (서버 PC · 읽기만 함 · 30일 보관)
$script:lastBk = [datetime]::MinValue
function Try-Backup {
  try {
    $bd = Join-Path $DIR 'backup'; New-Item -ItemType Directory -Force -Path $bd | Out-Null
    $f = Join-Path $bd ('care-' + (Get-Date -Format 'yyyy-MM-dd') + '.json')
    if (Test-Path $f) { return }
    $tmp = "$f.part"
    Invoke-WebRequest -UseBasicParsing -Uri "$DB/rooms/$ROOM.json?auth=$(Get-Tok)" -OutFile $tmp
    if ((Get-Item $tmp).Length -lt 100) { Remove-Item $tmp -Force; return }
    Move-Item $tmp $f -Force
    Get-ChildItem $bd -Filter 'care-*.json' | Sort-Object Name -Descending | Select-Object -Skip 30 | Remove-Item -Force
    Log "💾 케어 노트 백업 저장 · $f ($([Math]::Round((Get-Item $f).Length / 1KB)) KB)"
  } catch { Log "백업 실패: $($_.Exception.Message)" }
}
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
Log "승인됨 · $(if ($Reception) { '인투벳 접수 감시' } else { 'LIS 감시' })를 시작합니다 (코드 $code)"
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
# 다른 프로그램(인투벳 등)보다 항상 뒤로 양보: 낮은 우선순위로 실행
try { (Get-Process -Id $PID).PriorityClass = 'BelowNormal' } catch {}
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
  [StructLayout(LayoutKind.Sequential)] struct LII { public uint cb; public uint t; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LII p);
  public static uint IdleMs() { var x = new LII(); x.cb = (uint)Marshal.SizeOf(x); if (!GetLastInputInfo(ref x)) return 99999; return unchecked((uint)Environment.TickCount - x.t); }
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
    Start-Process notepad.exe $f -WindowStyle Minimized
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

# ================= 접수실 모드: 인투벳 접수 → 케어 노트 외래 자동 등록 / 수납 완료 → 자동 정리 =================
if ($Reception) {
  try { $Host.UI.RawUI.WindowTitle = 'SongpaBaro Reception' } catch {}
  function Find-GE {
    $c = New-Object Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [Windows.Automation.ControlType]::Window)
    foreach ($w in $AE::RootElement.FindAll($TS::Children, $c)) { $n = $w.Current.Name; if ($n -match 'IntoVet' -and $n -notmatch 'LIS') { return $w } }
    return $null
  }
  function Parse-GE($names) {
    $L = New-Object System.Collections.Generic.List[string]
    foreach ($n in $names) { $t = $n.Trim(); if ($t -and ($L.Count -eq 0 -or $L[$L.Count - 1] -ne $t)) { $L.Add($t) } }
    $wi = -1; for ($i = 0; $i -lt $L.Count; $i++) { if ($L[$i] -match '^\d+(\.\d+)?\s*kg') { $wi = $i; break } }
    if ($wi -lt 0) { return $null }
    $r = [ordered]@{ bw = ([regex]::Match($L[$wi], '^\d+(\.\d+)?')).Value; no = ''; cust = ''; st = ''; birth = ''; sex = ''; breed = ''; sp = ''; name = '' }
    $si = -1
    for ($i = $wi + 1; $i -lt [Math]::Min($L.Count, $wi + 30); $i++) {
      $v = $L[$i]
      if ($v -match '^\d{2,7}$') { if (-not $r.no) { $r.no = $v } elseif (-not $r.cust) { $r.cust = $v }; continue }
      if ($r.cust -and -not $r.st -and $v -notmatch '\d' -and $v.Length -le 8) { $r.st = $v; continue }
      if (-not $r.birth -and $v -match '^\d{4}-\d{2}-\d{2}') { $r.birth = ($v -replace '\s+', ' '); continue }
      if (-not $r.sex -and $v -match 'Male|Female|수컷|암컷|중성') { $r.sex = $v; continue }
      if (-not $r.sp -and $v -match '^(Canine|Feline|Exotic|Avian|Rabbit|Other|Others|기타)$') { $r.sp = $v; $si = $i; continue }
      if (-not $r.breed -and $v -match '\(' -and $v -notmatch '^\d') { $r.breed = $v; continue }
    }
    if ($si -ge 0) {
      for ($i = $si + 1; $i -lt [Math]::Min($L.Count, $si + 12); $i++) {
        $v = $L[$i]
        if ($v -match '\d{2,4}-\d{3,4}-\d{3,4}' -or $v -match '^[\d\-\s]+$') { continue }          # 전화번호
        if ($v.Length -gt 12 -or $v -match '(시|구|동|로|길|읍|면)\s|\d+-\d+|아파트|빌라') { continue }   # 주소
        $r.name = $v; break
      }
    }
    if (-not $r.no) { return $null }
    return [pscustomobject]$r
  }
  # 트래픽 절약: 전체 목록은 필요할 때만(최소 15분 간격) 받고, 나머지는 환축 1마리만 확인
  $script:CI = @{}; $script:CT = [datetime]::MinValue; $script:DONE = @{}
  function Load-Idx([int]$minAge) {
    if (((Get-Date) - $script:CT).TotalMinutes -lt $minAge) { return }
    $script:CT = Get-Date; $m = @{}
    $ps = Fb 'Get' "rooms/$ROOM/care_patients" $null
    if ($ps) { foreach ($p in $ps.PSObject.Properties) { $v = $p.Value; $n = (("" + $v.chartNo) -replace '\D', ''); if ($v -and $n) { $m[$n] = $p.Name } } }
    $script:CI = $m
  }
  function Care-One($no) {
    if (-not $script:CI.ContainsKey($no)) { return $null }
    $x = Fb 'Get' "rooms/$ROOM/care_patients/$($script:CI[$no])" $null
    if (-not $x) { $script:CI.Remove($no); return $null }
    return $x
  }
  function Recent($k) { $script:DONE.ContainsKey($k) -and ((Get-Date) - $script:DONE[$k]).TotalMinutes -lt 30 }
  function Opd-Register($g, $c = '외래') {
    $k = "$($g.no)|R"; if (Recent $k) { return }; $script:DONE[$k] = Get-Date
    Load-Idx 15
    if (Care-One $g.no) { Log "이미 케어 노트에 있음 · #$($g.no) $($g.name)"; return }
    $id = "p-care-$(NowMs)"; $today = Get-Date -Format 'yyyy-MM-dd'
    $sp = if ($g.sp -eq 'Feline') { 'cat' } else { 'dog' }
    $info = (@($g.sex, $(if ($g.bw) { "$($g.bw)kg" }), $g.birth) | Where-Object { $_ }) -join ' · '
    $p = [ordered]@{ id = $id; name = $(if ($g.name) { $g.name } else { "#$($g.no)" }); room = ''; chartNo = $g.no; species = $sp; breed = $g.breed; owner = ''; dx = ''; category = $c; adm = $today; auto = 'intovet'; sex = $g.sex; bw = $g.bw; birth = $g.birth }
    Fb 'Put' "rooms/$ROOM/care_patients/$id" $p | Out-Null
    $script:CI[$g.no] = $id; $script:DONE.Remove("$($g.no)|O")
    Log "✅ $c 등록 · #$($g.no) $($p.name) ($($g.breed), $info)"
  }
  # 인투벳 상태가 입원·호텔이면 케어 노트 구분을 자동으로 바꿈 (없으면 그 구분으로 등록)
  function Opd-Cat($g, $c) {
    $k = "$($g.no)|C$c"; if (Recent $k) { return }; $script:DONE[$k] = Get-Date
    Load-Idx 15
    $x = Care-One $g.no
    if (-not $x) { Load-Idx 2; $x = Care-One $g.no }
    if ($x) {
      if ($x.category -ne $c) { Fb 'Patch' "rooms/$ROOM/care_patients/$($x.id)" (@{ category = $c; catBy = 'intovet'; catAt = @{ '.sv' = 'timestamp' } }) | Out-Null; Log "🏥 $c(으)로 바꿈 · #$($g.no) $($x.name)" }
      return
    }
    Opd-Register $g $c
  }
  function Opd-Out($g) {
    $k = "$($g.no)|O"; if (Recent $k) { return }; $script:DONE[$k] = Get-Date
    Load-Idx 15
    $x = Care-One $g.no
    if (-not $x) { Load-Idx 2; $x = Care-One $g.no }
    if (-not $x) { return }
    if ($x.category -ne '외래') { Log "입원·호텔 환축이라 자동 정리 안 함 · #$($g.no)"; return }
    $x | Add-Member -NotePropertyName dischargedAt -NotePropertyValue ((Get-Date -Format 'yyyy-MM-dd HH:mm')) -Force
    $x | Add-Member -NotePropertyName dischargedTs -NotePropertyValue (NowMs) -Force
    $x | Add-Member -NotePropertyName autoOut -NotePropertyValue $g.st -Force
    Fb 'Put' "rooms/$ROOM/discharged_patients/$($x.id)" $x | Out-Null
    Fb 'Delete' "rooms/$ROOM/care_patients/$($x.id)" $null | Out-Null
    $script:CI.Remove($g.no); $script:DONE.Remove("$($g.no)|R")
    Log "🧾 $($g.st) · 외래 정리 · #$($g.no) $($x.name)"
  }
  # PC 부담 줄이기: 처음 한 번만 화면 전체를 훑고, 환축 정보가 있는 칸만 기억해 그 부분만 읽음
  $script:GEC = $null; $script:GECt = [datetime]::MinValue; $script:nextFull = [datetime]::MinValue
  function Read-GE($w) {
    if ($script:GEC -and ((Get-Date) - $script:GECt).TotalMinutes -lt 10) {
      try { $g = Parse-GE (Get-Names $script:GEC); if ($g) { return $g } } catch {}
      $script:GEC = $null
    }
    if ((Get-Date) -lt $script:nextFull) { return $null }   # 환축 정보가 안 보일 땐 전체 읽기를 15초에 한 번만
    $nm = New-Object System.Collections.Generic.List[string]; $kg = $null
    try { foreach ($e in $w.FindAll($TS::Descendants, [Windows.Automation.Condition]::TrueCondition)) { try { $n = $e.Current.Name; if ($n) { $nm.Add($n); if (-not $kg -and $n -match '^\s*\d+(\.\d+)?\s*kg') { $kg = $e } } } catch {} } } catch {}
    $g = Parse-GE $nm
    if (-not $g) { $script:nextFull = (Get-Date).AddSeconds(15) }
    if ($g -and $kg) {
      $wk = [Windows.Automation.TreeWalker]::RawViewWalker; $p = $kg
      for ($i = 0; $i -lt 8; $i++) {
        try { $p = $wk.GetParent($p) } catch { break }
        if (-not $p) { break }
        try { $g2 = Parse-GE (Get-Names $p); if ($g2 -and $g2.no -eq $g.no -and $g2.st -eq $g.st -and $g2.name -eq $g.name -and $g2.sex -eq $g.sex) { $script:GEC = $p; $script:GECt = Get-Date; break } } catch {}
      }
    }
    return $g
  }
  $last = ''
  while ($true) {
    try {
      # 키보드·마우스를 쓰는 중이면(1초 안) 이번 차례는 쉬고 다음에 읽음 → 입력할 때 버벅임 없음
      $busy = $false; try { $busy = [SbW32]::IdleMs() -lt 1000 } catch {}
      $w = if ($busy) { $null } else { Find-GE }
      if ($w) {
        $g = Read-GE $w
        if ($g) {
          $key = "$($g.no)|$($g.st)"
          if ($key -ne $last) {
            $last = $key
            if ($Diag) { Log "[진단] 읽음 · 번호 $($g.no) / 이름 $($g.name) / 상태 $($g.st) / $($g.sp) $($g.breed) $($g.sex) $($g.bw)kg" }
            if ($g.st -match '수납\s*완료|진료\s*완료|귀가') { Opd-Out $g }
            elseif ($g.st -match '입원') { Opd-Cat $g '입원' }
            elseif ($g.st -match '호텔') { Opd-Cat $g '호텔' }
            elseif ($g.st -match '접수') { Opd-Register $g }
          }
        }
      }
      if (((Get-Date) - $lastUp).TotalMinutes -ge 60) { $lastUp = Get-Date; Try-Update }
    } catch { Log "오류: $(ErrTxt $_)"; $script:GEC = $null; Start-Sleep -Seconds 7 }
    if ($script:GEC) { Start-Sleep -Milliseconds 1500 } else { Start-Sleep -Seconds 4 }
  }
}
if ($script:startToast) { Toast "송파바로 LIS 연동 시작" "검사 결과가 들어오면 이 자리에 알림이 떠요" }
$script:lastScan = [datetime]::MinValue; $script:dumped = $false
Tail-Logs -init | Out-Null
$script:lastUia = [datetime]::MinValue
$seen = @{}; $first = $true; $lastHb = [datetime]::MinValue; $st = 'nolis'; $lastTxt = ''
while ($true) {
  try {
    $script:STEP = $null
    # 1순위: LIS 기록 파일
    foreach ($r in (Tail-Logs)) {
      $key = "$($r.u)|$($r.d)|$($r.tm)|$($r.id)"
      if ($seen.ContainsKey($key)) { continue }
      $seen[$key] = 1
      Handle $r.u $r.id
    }
    if (((Get-Date) - $script:lastUia).TotalSeconds -ge 8) {
    $script:lastUia = Get-Date
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
    }
    if (((Get-Date) - $lastUp).TotalMinutes -ge 60) { $lastUp = Get-Date; Try-Update }
    if (((Get-Date) - $script:lastBk).TotalMinutes -ge 30) { $script:lastBk = Get-Date; Try-Backup }
    if (((Get-Date) - $lastHb).TotalSeconds -ge 60) {
      Fb 'Patch' "rooms/$ROOM/lis" (@{ hb = @{ '.sv' = 'timestamp' }; st = $st; dev = $code }) | Out-Null
      $lastHb = Get-Date
    }
    On-Ok
  } catch {
    On-Fail $_
    Start-Sleep -Seconds 7
  }
  Start-Sleep -Milliseconds 1500
}
