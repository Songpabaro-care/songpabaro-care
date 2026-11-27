using System; using System.Text; using System.Runtime.InteropServices;
public static class SbIntoVet {
  delegate bool EP(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EP f, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern void keybd_event(byte v, byte s, uint f, UIntPtr e);
  [STAThread] public static void Main(string[] a) {
    if (a.Length > 0 && (a[0].IndexOf("dockoff", StringComparison.OrdinalIgnoreCase) >= 0 || a[0].IndexOf("dockon", StringComparison.OrdinalIgnoreCase) >= 0)) {
      string f = System.IO.Path.Combine(System.IO.Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location), "dock-off.flag");
      try { if (a[0].IndexOf("dockoff", StringComparison.OrdinalIgnoreCase) >= 0) System.IO.File.WriteAllText(f, "off"); else System.IO.File.Delete(f); } catch {}
      return;
    }
    if (a.Length > 0 && a[0].IndexOf("diag", StringComparison.OrdinalIgnoreCase) >= 0) {
      string dir = System.IO.Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
      try { System.Diagnostics.Process.Start(System.IO.Path.Combine(dir, "sbdock.exe"), "diag"); } catch {}
      return;
    }
    IntPtr hit = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      StringBuilder sb = new StringBuilder(512); GetWindowText(h, sb, 512);
      if (sb.ToString().StartsWith("IntoVet GE", StringComparison.OrdinalIgnoreCase)) { hit = h; return false; }
      return true; }, IntPtr.Zero);
    if (hit == IntPtr.Zero) return;
    if (IsIconic(hit)) ShowWindow(hit, 9);
    keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero);
    SetForegroundWindow(hit);
  }
}