use anyhow::{anyhow, Result};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, Position, Size,
    WebviewWindow,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::app_state::SharedState;
use crate::models::{
    MAX_WINDOW_WIDTH, MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH, Settings, WindowSizeLimits,
};

#[cfg(target_os = "windows")]
use windows::Win32::{
    Foundation::{POINT, RECT},
    Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        MONITOR_DEFAULTTONULL,
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
    remember_current_window_position(app, &window);
    window.hide()?;
    Ok(())
}

pub fn show_main_window(app: &AppHandle) -> Result<()> {
    let window = main_window(app)?;
    let settings = current_settings(app);
    place_window_for_display(app, &window, settings.as_ref())?;
    window.show()?;
    let _ = window.unminimize();
    let _ = window.set_focus();
    let _ = app.emit_to("main", "deskrun://focus-search", ());
    Ok(())
}

pub fn apply_window_size(app: &AppHandle, width: u32, height: u32) -> Result<()> {
    let window = main_window(app)?;
    let limits = active_window_size_limits(app, &window)?;
    let clamped_width = width.clamp(limits.min_width, limits.max_width);
    let clamped_height = height.clamp(limits.min_height, limits.max_height);
    apply_window_size_constraints(&window, limits.max_width, limits.max_height)?;
    window.set_size(Size::Logical(LogicalSize::new(
        clamped_width as f64,
        clamped_height as f64,
    )))?;
    keep_window_visible(app, &window, current_settings(app).as_ref())?;
    Ok(())
}

pub fn sync_window_size(app: &AppHandle, width: u32, height: u32) -> Result<WindowSizeLimits> {
    let window = main_window(app)?;
    let limits = active_window_size_limits(app, &window)?;
    let clamped_width = width.clamp(limits.min_width, limits.max_width);
    let clamped_height = height.clamp(limits.min_height, limits.max_height);
    apply_window_size_constraints(&window, limits.max_width, limits.max_height)?;

    if clamped_width != width || clamped_height != height {
        window.set_size(Size::Logical(LogicalSize::new(
            clamped_width as f64,
            clamped_height as f64,
        )))?;
    }

    keep_window_visible(app, &window, current_settings(app).as_ref())?;
    Ok(limits)
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

pub fn window_size_limits() -> Result<WindowSizeLimits> {
    #[cfg(not(target_os = "windows"))]
    {
        Ok(WindowSizeLimits {
            min_width: MIN_WINDOW_WIDTH,
            min_height: MIN_WINDOW_HEIGHT,
            max_width: MAX_WINDOW_WIDTH,
            max_height: 1080,
        })
    }

    #[cfg(target_os = "windows")]
    {
        let monitor = current_monitor_rect()?;
        let available_width = (monitor.right - monitor.left).max(MIN_WINDOW_WIDTH as i32) as u32;
        let available_height = (monitor.bottom - monitor.top).max(MIN_WINDOW_HEIGHT as i32) as u32;

        Ok(WindowSizeLimits {
            min_width: MIN_WINDOW_WIDTH,
            min_height: MIN_WINDOW_HEIGHT,
            max_width: available_width.min(MAX_WINDOW_WIDTH).max(MIN_WINDOW_WIDTH),
            max_height: available_height.max(MIN_WINDOW_HEIGHT),
        })
    }
}

pub fn remember_window_position(app: &AppHandle, x: i32, y: i32) -> Result<()> {
    let Some(state) = app.try_state::<SharedState>() else {
        return Ok(());
    };

    let mut storage = state.lock().map_err(anyhow::Error::msg)?;
    storage.set_window_position(x, y)
}

fn apply_window_size_constraints(
    window: &WebviewWindow,
    max_width: u32,
    max_height: u32,
) -> Result<()> {
    window.set_max_size(Some(Size::Logical(LogicalSize::new(
        max_width as f64,
        max_height as f64,
    ))))?;
    Ok(())
}

fn place_window_for_display(
    _app: &AppHandle,
    window: &WebviewWindow,
    settings: Option<&Settings>,
) -> Result<()> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = _app;
        let _ = settings;
        let _ = window;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        let preferred_position = settings
            .and_then(saved_window_position)
            .and_then(|(x, y)| monitor_rect_for_point(x, y, false).ok().flatten().map(|rect| (rect, x, y)));

        let monitor = preferred_position
            .map(|(rect, _, _)| rect)
            .unwrap_or(current_monitor_rect()?);
        let limits = window_size_limits_for_rect(&monitor);
        apply_window_size_constraints(window, limits.max_width, limits.max_height)?;
        clamp_window_size_to_monitor(window, &limits)?;

        let size = window.outer_size()?;
        let (x, y) = if let Some((rect, saved_x, saved_y)) = preferred_position {
            clamp_position_to_rect(&rect, size, saved_x, saved_y)
        } else {
            center_position_in_rect(&monitor, size)
        };
        window.set_position(Position::Physical(PhysicalPosition::new(x, y)))?;
        Ok(())
    }
}

fn keep_window_visible(
    _app: &AppHandle,
    window: &WebviewWindow,
    settings: Option<&Settings>,
) -> Result<()> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = _app;
        let _ = settings;
        let _ = window;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        let current_position = window.outer_position().ok().map(|position| (position.x, position.y));
        let saved_position = settings.and_then(saved_window_position);
        let anchor = current_position.or(saved_position);
        let monitor = if let Some((x, y)) = anchor {
            monitor_rect_for_point(x, y, false)?.unwrap_or(current_monitor_rect()?)
        } else {
            current_monitor_rect()?
        };
        let limits = window_size_limits_for_rect(&monitor);
        apply_window_size_constraints(window, limits.max_width, limits.max_height)?;
        clamp_window_size_to_monitor(window, &limits)?;

        let size = window.outer_size()?;
        let (x, y) = if let Some((anchor_x, anchor_y)) = anchor {
            clamp_position_to_rect(&monitor, size, anchor_x, anchor_y)
        } else {
            center_position_in_rect(&monitor, size)
        };
        window.set_position(Position::Physical(PhysicalPosition::new(x, y)))?;
        Ok(())
    }
}

fn current_settings(app: &AppHandle) -> Option<Settings> {
    let state = app.try_state::<SharedState>()?;
    let storage = state.lock().ok()?;
    Some(storage.settings().clone())
}

fn remember_current_window_position(app: &AppHandle, window: &WebviewWindow) {
    if let Ok(position) = window.outer_position() {
        let _ = remember_window_position(app, position.x, position.y);
    }
}

fn saved_window_position(settings: &Settings) -> Option<(i32, i32)> {
    Some((settings.window_x?, settings.window_y?))
}

fn active_window_size_limits(app: &AppHandle, window: &WebviewWindow) -> Result<WindowSizeLimits> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        let _ = window;
        window_size_limits()
    }

    #[cfg(target_os = "windows")]
    {
        let settings = current_settings(app);
        let current_position = window.outer_position().ok().map(|position| (position.x, position.y));
        let saved_position = settings.as_ref().and_then(saved_window_position);
        let anchor = current_position.or(saved_position);
        let monitor = if let Some((x, y)) = anchor {
            monitor_rect_for_point(x, y, false)?.unwrap_or(current_monitor_rect()?)
        } else {
            current_monitor_rect()?
        };
        Ok(window_size_limits_for_rect(&monitor))
    }
}

fn window_size_limits_for_rect(monitor: &RECT) -> WindowSizeLimits {
    let available_width = (monitor.right - monitor.left).max(MIN_WINDOW_WIDTH as i32) as u32;
    let available_height = (monitor.bottom - monitor.top).max(MIN_WINDOW_HEIGHT as i32) as u32;

    WindowSizeLimits {
        min_width: MIN_WINDOW_WIDTH,
        min_height: MIN_WINDOW_HEIGHT,
        max_width: available_width.min(MAX_WINDOW_WIDTH).max(MIN_WINDOW_WIDTH),
        max_height: available_height.max(MIN_WINDOW_HEIGHT),
    }
}

fn clamp_window_size_to_monitor(window: &WebviewWindow, limits: &WindowSizeLimits) -> Result<()> {
    let size = window.outer_size()?;
    let next_width = size.width.min(limits.max_width);
    let next_height = size.height.min(limits.max_height);

    if next_width != size.width || next_height != size.height {
        window.set_size(Size::Physical(PhysicalSize::new(next_width, next_height)))?;
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn center_position_in_rect(monitor: &RECT, size: tauri::PhysicalSize<u32>) -> (i32, i32) {
    let x = monitor.left + ((monitor.right - monitor.left) - size.width as i32) / 2;
    let y = monitor.top + ((monitor.bottom - monitor.top) - size.height as i32) / 2;
    (x, y)
}

#[cfg(target_os = "windows")]
fn clamp_position_to_rect(
    monitor: &RECT,
    size: tauri::PhysicalSize<u32>,
    x: i32,
    y: i32,
) -> (i32, i32) {
    let max_x = (monitor.right - size.width as i32).max(monitor.left);
    let max_y = (monitor.bottom - size.height as i32).max(monitor.top);
    (x.clamp(monitor.left, max_x), y.clamp(monitor.top, max_y))
}

#[cfg(target_os = "windows")]
fn current_monitor_rect() -> Result<RECT> {
    let mut point = POINT::default();
    unsafe { GetCursorPos(&mut point)? };

    let monitor = unsafe { MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST) };
    if monitor.0.is_null() {
        return Err(anyhow!("failed to resolve current monitor"));
    }

    monitor_rect(monitor)
}

#[cfg(target_os = "windows")]
fn monitor_rect_for_point(x: i32, y: i32, nearest: bool) -> Result<Option<RECT>> {
    let flag = if nearest {
        MONITOR_DEFAULTTONEAREST
    } else {
        MONITOR_DEFAULTTONULL
    };
    let point = POINT { x, y };
    let monitor = unsafe { MonitorFromPoint(point, flag) };
    if monitor.0.is_null() {
        return Ok(None);
    }

    Ok(Some(monitor_rect(monitor)?))
}

#[cfg(target_os = "windows")]
fn monitor_rect(
    monitor: windows::Win32::Graphics::Gdi::HMONITOR,
) -> Result<RECT> {
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
