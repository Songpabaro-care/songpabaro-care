using System; using System.Text; using System.IO; using System.Threading;
using System.Collections.Generic; using System.Runtime.InteropServices;
public static class SbDock {
  delegate bool EP(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] static extern bool EnumWindows(EP f, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr p, EP f, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, StringBuilder l, uint f, uint t, out IntPtr r);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int k);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint f);
  [StructLayout(LayoutKind.Sequential)] struct MINFO { public int cb; public RECT rcMon; public RECT rcWork; public uint flags; }
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MINFO i);
  static RECT Work(IntPtr h) { MINFO i = new MINFO(); i.cb = Marshal.SizeOf(typeof(MINFO)); GetMonitorInfo(MonitorFromWindow(h, 2), ref i); return i.rcWork; }

  static string Title(IntPtr h) { StringBuilder sb = new StringBuilder(512); GetWindowText(h, sb, 512); return sb.ToString(); }
  static string Cls(IntPtr h) { StringBuilder sb = new StringBuilder(256); GetClassName(h, sb, 256); return sb.ToString(); }
  static string Text(IntPtr h) {
    StringBuilder sb = new StringBuilder(256); IntPtr r;
    if (SendMessageTimeout(h, 0x000D, (IntPtr)256, sb, 0x0002, 80, out r) == IntPtr.Zero) return "";
    return sb.ToString();
  }
  static RECT Rect(IntPtr h) { RECT r; GetWindowRect(h, out r); return r; }

  static IntPtr FindMain() {
    IntPtr hit = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (IsWindowVisible(h) && Title(h).StartsWith("IntoVet GE", StringComparison.OrdinalIgnoreCase)) { hit = h; return false; }
      return true; }, IntPtr.Zero);
    return hit;
  }
  // 떠 있는 "송파바로 채팅" 창 (크롬 맨 위 창)
  static IntPtr FindChat() {
    IntPtr hit = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      string t = Title(h);
      bool top = (GetWindowLong(h, -20) & 0x8) != 0;
      if (t.IndexOf("송파바로 채팅", StringComparison.Ordinal) >= 0 || (top && Cls(h).StartsWith("Chrome_WidgetWin") && t.IndexOf("케어 노트", StringComparison.Ordinal) >= 0)) { hit = h; return false; }
      return true; }, IntPtr.Zero);
    return hit;
  }
  static bool HasKey(IntPtr w, ref int budget) {
    if (Text(w).Replace(" ", "").IndexOf("수신시간", StringComparison.Ordinal) >= 0) return true;
    bool found = false; int b = budget;
    EnumChildWindows(w, delegate(IntPtr h, IntPtr l) {
      if (b <= 0) return false; b--;
      if (!IsWindowVisible(h)) return true;
      if (Text(h).Replace(" ", "").IndexOf("수신시간", StringComparison.Ordinal) >= 0) { found = true; return false; }
      return true; }, IntPtr.Zero);
    budget = b; return found;
  }
  static Dictionary<IntPtr, DateTime> NO = new Dictionary<IntPtr, DateTime>();
  // 수신 창 후보: 인투벳 안(또는 인투벳이 띄운) 창 중, 오른쪽 아래에 있는 적당한 크기의 창
  static List<IntPtr> Cands(IntPtr main) {
    List<IntPtr> all = new List<IntPtr>();
    uint pid; GetWindowThreadProcessId(main, out pid);
    EnumChildWindows(main, delegate(IntPtr h, IntPtr l) { all.Add(h); return true; }, IntPtr.Zero);
    EnumWindows(delegate(IntPtr h, IntPtr l) { uint p; GetWindowThreadProcessId(h, out p); if (p == pid && h != main) all.Add(h); return true; }, IntPtr.Zero);
    RECT m = Rect(main); int mw = m.R - m.L, mh = m.B - m.T;
    List<IntPtr> c = new List<IntPtr>();
    foreach (IntPtr h in all) {
      if (!IsWindowVisible(h)) continue;
      RECT r = Rect(h); int w = r.R - r.L, hh = r.B - r.T;
      if (w < 250 || hh < 120 || w > 1400 || hh > 800) continue;
      if (r.L < m.L + mw * 45 / 100 || r.B < m.T + mh * 60 / 100) continue;
      c.Add(h);
    }
    c.Sort(delegate(IntPtr a, IntPtr b) { RECT ra = Rect(a), rb = Rect(b); return ((ra.R - ra.L) * (ra.B - ra.T)).CompareTo((rb.R - rb.L) * (rb.B - rb.T)); });
    return c;
  }
  static IntPtr FindPopup(IntPtr main) {
    int budget = 400; DateTime now = DateTime.Now;
    List<IntPtr> cs = Cands(main);
    foreach (IntPtr h in cs) if (Cls(h).IndexOf("CID", StringComparison.OrdinalIgnoreCase) >= 0) return h;
    foreach (IntPtr h in cs) {
      DateTime until; if (NO.TryGetValue(h, out until) && until > now) continue;
      if (HasKey(h, ref budget)) return h;
      NO[h] = now.AddSeconds(15);
      if (budget <= 0) break;
    }
    if (NO.Count > 500) NO.Clear();
    return IntPtr.Zero;
  }
  static bool Overlap(RECT a, RECT b) { return a.L < b.R && b.L < a.R && a.T < b.B && b.T < a.B; }
  static void Move(IntPtr h, int x, int y) { SetWindowPos(h, IntPtr.Zero, x, y, 0, 0, 0x0001 | 0x0004 | 0x0010); }

  static void Diag(string dir) {
    List<string> o = new List<string>();
    o.Add("== 송파바로 채팅 자리 비키기 진단 " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " ==");
    IntPtr main = FindMain(); o.Add("인투벳 창: " + (main == IntPtr.Zero ? "못 찾음" : Cls(main)));
    bool running = false; try { Mutex.OpenExisting("SongpaBaroChatDock").Close(); running = true; } catch {}
    o.Add("자리 비키기 실행 중: " + (running ? "예" : "아니오 (Win+R → %LOCALAPPDATA%\\songpabaro-intovet\\sbdock.exe)"));
    o.Add("우측 하단 고정: " + (File.Exists(Path.Combine(dir, "dock-off.flag")) ? "끔" : "켬"));
    o.Add("자동 실행 등록: " + (File.Exists(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup), "SongpaBaro Chat Dock.lnk")) ? "있음" : "없음"));
    IntPtr chat = FindChat(); o.Add("채팅 창: " + (chat == IntPtr.Zero ? "못 찾음 (📌로 띄웠는지 확인)" : Cls(chat) + " " + Rect(chat).L + "," + Rect(chat).T));
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (IsWindowVisible(h) && Cls(h).StartsWith("Chrome_WidgetWin") && (GetWindowLong(h, -20) & 0x8) != 0) { RECT r = Rect(h); o.Add("  크롬 맨 위 창: '" + Title(h) + "' " + (r.R - r.L) + "x" + (r.B - r.T)); }
      return true; }, IntPtr.Zero);
    if (main != IntPtr.Zero) {
      RECT m = Rect(main); o.Add("인투벳 위치: " + m.L + "," + m.T + " ~ " + m.R + "," + m.B); IntPtr vc = FindVaccine(main); o.Add("백신 칸: " + (vc == IntPtr.Zero ? "못 찾음 (접힌 상자는 맨 아래에 붙음)" : "찾음 " + Rect(vc).L + "," + Rect(vc).T));
      int budget = 3000;
      foreach (IntPtr h in Cands(main)) { RECT r = Rect(h); int b = 300; bool k = HasKey(h, ref b); o.Add("  후보 " + Cls(h) + " " + r.L + "," + r.T + " " + (r.R - r.L) + "x" + (r.B - r.T) + (k ? "  ← 수신시간 있음" : "")); if (--budget <= 0) break; }
      IntPtr p = FindPopup(main); o.Add("수신 창: " + (p == IntPtr.Zero ? "못 찾음" : "찾음"));
    }
    string f = Path.Combine(dir, "dock-diag.txt"); File.WriteAllLines(f, o.ToArray(), Encoding.UTF8);
    System.Diagnostics.Process.Start("notepad.exe", "\"" + f + "\"");
  }

  // 화면 맨 아래에서 띄우는 높이 (인투벳 맨 아래 상태줄 아이콘이 보이게). dock-gap.txt에 숫자를 넣으면 바꿀 수 있음
  static int gapV = 16; static DateTime gapT = DateTime.MinValue;
  static int Gap(string dir) {
    if ((DateTime.Now - gapT).TotalSeconds < 5) return gapV;
    gapT = DateTime.Now; int g;
    try { string f = Path.Combine(dir, "dock-gap.txt"); gapV = File.Exists(f) && int.TryParse(File.ReadAllText(f).Trim(), out g) && g >= 0 && g < 400 ? g : 16; } catch { gapV = 16; }
    return gapV;
  }
  // 인투벳 Vaccine 칸 (T폼_vaccine). 5초마다 다시 찾음, 숨겨져 있으면 없음
  static IntPtr vacH = IntPtr.Zero; static DateTime vacT = DateTime.MinValue;
  static IntPtr FindVaccine(IntPtr main) {
    if (vacH != IntPtr.Zero && IsWindow(vacH) && (DateTime.Now - vacT).TotalSeconds < 5) return IsWindowVisible(vacH) ? vacH : IntPtr.Zero;
    vacT = DateTime.Now; IntPtr hit = IntPtr.Zero;
    EnumChildWindows(main, delegate(IntPtr h, IntPtr l) {
      if (IsWindowVisible(h) && Cls(h).IndexOf("vaccine", StringComparison.OrdinalIgnoreCase) >= 0) { hit = h; return false; }
      return true; }, IntPtr.Zero);
    vacH = hit; return hit;
  }
  static Mutex MX;
  static string lastMark = "";
  [STAThread] public static void Main(string[] a) {
    try { SetProcessDPIAware(); } catch {}
    string dir = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
    if (a.Length > 0 && a[0] == "diag") { Diag(dir); return; }
    bool created; MX = new Mutex(true, "SongpaBaroChatDock", out created);
    if (!created) return;
    IntPtr pop = IntPtr.Zero; bool docked = false, userMoved = false; RECT saved = new RECT(); int dx = 0, dy = 0;
    DateTime lastScan = DateTime.MinValue;
    while (true) {
      try {
        IntPtr main = FindMain();
        if (main == IntPtr.Zero) { pop = IntPtr.Zero; Thread.Sleep(3000); continue; }
        if (pop != IntPtr.Zero && (!IsWindow(pop) || !IsWindowVisible(pop))) pop = IntPtr.Zero;
        if (pop == IntPtr.Zero && (DateTime.Now - lastScan).TotalMilliseconds >= 1000) { lastScan = DateTime.Now; pop = FindPopup(main); }
        IntPtr chat = FindChat();
        // 우측 하단 고정 (기본): 순정 채팅처럼 오른쪽 아래, 전화 수신 창이 떠 있으면 그 위에 붙기
        if (!File.Exists(Path.Combine(dir, "dock-off.flag"))) {
          if (chat != IntPtr.Zero && (GetAsyncKeyState(0x01) & 0x8000) == 0) {
            RECT c = Rect(chat); int w = c.R - c.L, hh = c.B - c.T, tx, ty;
            // 케어 노트가 제목에 [sb:가로x세로]를 붙이면 그 크기로 키움 (최소화 → 원래 크기, 화면 아래에 붙어 있어 크롬이 못 키울 때)
            string tt = Title(chat); int mi = tt.IndexOf("[sb:", StringComparison.Ordinal);
            if (mi >= 0 && tt != lastMark) {
              lastMark = tt;
              string[] wh = tt.Substring(mi + 4).TrimEnd(']').Split('x');
              int nw, nh;
              if (wh.Length == 2 && int.TryParse(wh[0], out nw) && int.TryParse(wh[1].Split(']')[0], out nh) && nw > 100 && nh > 60) { w = nw; hh = nh; c.L = -99999; }
            } else if (mi < 0) lastMark = "";
            IntPtr vac = (c.L != -99999 && hh < 150) ? FindVaccine(main) : IntPtr.Zero;
            if (pop != IntPtr.Zero) { RECT p = Rect(pop); tx = p.R - w; ty = p.T - hh - 2; }
            else if (vac != IntPtr.Zero) { RECT v = Rect(vac); tx = v.R - w; ty = v.T - hh; }   // 접힌 💬 상자: 백신 목록 바로 위 (목록은 안 가림)
            else { RECT wa = Work(main); tx = wa.R - w; ty = wa.B - hh - Gap(dir); }
            if (ty < 0) ty = 0;
            if (c.L == -99999) SetWindowPos(chat, IntPtr.Zero, tx, ty, w, hh, 0x0004 | 0x0010);
            else if (c.L != tx || c.T != ty) Move(chat, tx, ty);
          }
          docked = false; userMoved = false;
          Thread.Sleep(120); continue;
        }
        if (pop != IntPtr.Zero && chat != IntPtr.Zero) {
          RECT p = Rect(pop), c = Rect(chat);
          if (!docked && !userMoved && Overlap(p, c)) {
            saved = c; dx = c.L; dy = p.T - (c.B - c.T) - 6; if (dy < 0) dy = 0;
            Move(chat, dx, dy); docked = true;
          } else if (docked && (c.L != dx || c.T != dy)) { docked = false; userMoved = true; }
        } else if (pop == IntPtr.Zero) {
          if (docked && chat != IntPtr.Zero) { RECT c = Rect(chat); if (c.L == dx && c.T == dy) Move(chat, saved.L, saved.T); }
          docked = false; userMoved = false;
        }
      } catch {}
      Thread.Sleep(500);
    }
  }
}
