# SongpaBaro: bring the "IntoVet GE" window to the front
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public class SbW {
  public delegate bool EP(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EP f, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte v, byte s, uint f, UIntPtr e);
  public static IntPtr Find(string prefix) {
    IntPtr hit = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      StringBuilder sb = new StringBuilder(512); GetWindowText(h, sb, 512);
      if (sb.ToString().StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) { hit = h; return false; }
      return true; }, IntPtr.Zero);
    return hit;
  }
}
"@
$h = [SbW]::Find('IntoVet GE')
if ($h -eq [IntPtr]::Zero) { $h = [SbW]::Find('IntoVet') }
if ($h -eq [IntPtr]::Zero) { exit }
if ([SbW]::IsIconic($h)) { [void][SbW]::ShowWindow($h, 9) }
# Alt key tap lets Windows hand focus to another program
[SbW]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [SbW]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
[void][SbW]::SetForegroundWindow($h)
