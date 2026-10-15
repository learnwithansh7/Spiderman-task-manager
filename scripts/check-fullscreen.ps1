param(
    [int]$width = 1920,
    [int]$height = 1080
)

$code = @"
using System;
using System.Runtime.InteropServices;

public class Win32Helper {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern IntPtr GetShellWindow();

    [DllImport("user32.dll")]
    public static extern IntPtr GetDesktopWindow();

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public static bool IsFullscreen(int w, int h) {
        IntPtr fg = GetForegroundWindow();
        if (fg == IntPtr.Zero || fg == GetShellWindow() || fg == GetDesktopWindow()) return false;
        RECT r;
        if (!GetWindowRect(fg, out r)) return false;
        int winW = r.Right - r.Left;
        int winH = r.Bottom - r.Top;
        return (winW >= w && winH >= h);
    }
}
"@

if (-not ([System.Management.Automation.PSTypeName]'Win32Helper').Type) {
    Add-Type -TypeDefinition $code
}

$res = [Win32Helper]::IsFullscreen($width, $height)
Write-Output $res
