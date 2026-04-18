use anyhow::{anyhow, Result};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewWindow,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::models::{
    MAX_WINDOW_HEIGHT, MAX_WINDOW_WIDTH, MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH,
};

#[cfg(target_os = "windows")]
use windows::Win32::{
    Foundation::{POINT, RECT},
    Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    },
    UI::WindowsAndMessaging::GetCursorPos,
};

pub fn register_hotkey(app: &AppHandle, shortcut: &str) -> Result<()> {
    let parsed = Shortcut::try_from(shortcut).map_err(|error| anyhow!(error.to_string()))?;
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();
    manager
        .register(parsed)
        .map_err(|error| anyhow!(error.to_string()))
}

pub fn hide_main_window(app: &AppHandle) -> Result<()> {
    let window = main_window(app)?;
    window.hide()?;
    Ok(())
}

pub fn show_main_window(app: &AppHandle) -> Result<()> {
    let window = main_window(app)?;
    center_window_on_cursor(&window)?;
    window.show()?;
    let _ = window.unminimize();
    let _ = window.set_focus();
    let _ = app.emit_to("main", "deskrun://focus-search", ());
    Ok(())
}

pub fn apply_window_size(app: &AppHandle, width: u32, height: u32) -> Result<()> {
    let window = main_window(app)?;
    let clamped_width = width.clamp(MIN_WINDOW_WIDTH, MAX_WINDOW_WIDTH);
    let clamped_height = height.clamp(MIN_WINDOW_HEIGHT, MAX_WINDOW_HEIGHT);
    window.set_size(Size::Logical(LogicalSize::new(
        clamped_width as f64,
        clamped_height as f64,
    )))?;
    center_window_on_cursor(&window)?;
    Ok(())
}

pub fn toggle_main_window(app: &AppHandle) -> Result<()> {
    let window = main_window(app)?;
    if window.is_visible()? {
        hide_main_window(app)
    } else {
        show_main_window(app)
    }
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow> {
    app.get_webview_window("main")
        .ok_or_else(|| anyhow!("main window is missing"))
}

fn center_window_on_cursor(window: &WebviewWindow) -> Result<()> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        let size = window.outer_size()?;
        let monitor = current_monitor_rect()?;
        let x = monitor.left + ((monitor.right - monitor.left) - size.width as i32) / 2;
        let y = monitor.top + ((monitor.bottom - monitor.top) - size.height as i32) / 2;
        window.set_position(Position::Physical(PhysicalPosition::new(x, y)))?;
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn current_monitor_rect() -> Result<RECT> {
    let mut point = POINT::default();
    unsafe { GetCursorPos(&mut point)? };

    let monitor = unsafe { MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST) };
    if monitor.0.is_null() {
        return Err(anyhow!("failed to resolve current monitor"));
    }

    let mut monitor_info = MONITORINFO {
        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    let monitor_ok = unsafe { GetMonitorInfoW(monitor, &mut monitor_info).as_bool() };
    if !monitor_ok {
        return Err(anyhow!("failed to query current monitor info"));
    }

    Ok(monitor_info.rcWork)
}
