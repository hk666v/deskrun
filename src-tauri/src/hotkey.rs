use anyhow::{anyhow, Result};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewWindow,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::app_state::SharedState;
use crate::models::{
    Settings, WindowSizeLimits, MAX_WINDOW_WIDTH, MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH,
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

/// Installs `next` as the global hotkey, keeping `previous` live until the new
/// binding is known to work. Registering before unregistering matters: if the
/// new combination is rejected, the old one is still there and the launcher
/// stays reachable.
pub fn register_hotkey(app: &AppHandle, previous: Option<&str>, next: &str) -> Result<()> {
    if previous == Some(next) {
        return Ok(());
    }

    let parsed =
        Shortcut::try_from(next).map_err(|error| anyhow!("invalid hotkey \"{next}\": {error}"))?;
    let manager = app.global_shortcut();

    manager.register(parsed).map_err(|error| {
        anyhow!("\"{next}\" could not be registered — another program may already own it: {error}")
    })?;

    if let Some(stale) = previous.and_then(|value| Shortcut::try_from(value).ok()) {
        if stale != parsed {
            let _ = manager.unregister(stale);
        }
    }

    Ok(())
}

/// Startup path. A hotkey conflict must not stop the app from booting, since the
/// tray is still a working way in; report it and carry on.
pub fn register_hotkey_or_warn(app: &AppHandle, next: &str) -> Option<String> {
    match register_hotkey(app, None, next) {
        Ok(()) => None,
        Err(error) => {
            eprintln!("deskrun: {error}");
            Some(error.to_string())
        }
    }
}

/// Tells the interface that the window it is drawn in has gone away.
///
/// Every way of hiding the window ends up here — the global hotkey, the tray,
/// the close button, a launch — and a window hidden from this side does not
/// report losing focus, so nothing on the other end would know. Without it the
/// query typed for the last errand is still sitting in the search box the next
/// time the launcher is summoned.
pub const WINDOW_HIDDEN_EVENT: &str = "deskrun://hidden";

pub fn hide_main_window(app: &AppHandle) -> Result<()> {
    let window = main_window(app)?;
    persist_window_state(app);
    window.hide()?;

    // After the hide, never before: the box is emptied out of sight.
    let _ = app.emit_to("main", WINDOW_HIDDEN_EVENT, ());
    Ok(())
}

/// Captures the current window position and writes settings to disk. Called on
/// the paths where the window is going away — hiding, quitting — because the
/// position is otherwise only tracked in memory.
pub fn persist_window_state(app: &AppHandle) {
    if let Ok(window) = main_window(app) {
        remember_current_window_position(app, &window);
    }
    flush_settings_to_disk(app);
}

fn flush_settings_to_disk(app: &AppHandle) {
    let Some(state) = app.try_state::<SharedState>() else {
        return;
    };
    let Ok(mut storage) = state.lock() else {
        return;
    };
    let _ = storage.flush_settings();
}

/// The interface size, applied as a webview zoom rather than as CSS: it moves
/// the CSS pixel itself, so `vh`/`vw` and every fixed px size in the layout
/// follow it without any of them having to be recomputed by hand. 1.0 is the
/// designed size.
pub fn apply_ui_scale(app: &AppHandle, scale: f64) -> Result<()> {
    main_window(app)?.set_zoom(scale)?;
    Ok(())
}

pub fn show_main_window(app: &AppHandle) -> Result<()> {
    let window = main_window(app)?;
    let settings = current_settings(app);

    // Re-applied on every show, because the scale is only worth anything on a
    // live webview: this is where a setting changed while the window was hidden
    // — and a webview that was recreated — gets picked up. The window is still
    // invisible here, so the interface never renders at the wrong size first.
    if let Some(scale) = settings.as_ref().map(|value| value.ui_scale) {
        let _ = window.set_zoom(scale);
    }

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

/// Records the size the user dragged the window to.
///
/// Only the size constraint is refreshed here. `keep_window_visible` used to run
/// on every resize event as well, which repositioned the window mid-drag and
/// fought the user's mouse.
pub fn sync_window_size(app: &AppHandle, width: u32, height: u32) -> Result<WindowSizeLimits> {
    let window = main_window(app)?;
    let limits = active_window_size_limits(app, &window)?;
    apply_window_size_constraints(&window, limits.max_width, limits.max_height)?;

    let clamped_width = width.clamp(limits.min_width, limits.max_width);
    let clamped_height = height.clamp(limits.min_height, limits.max_height);
    if clamped_width != width || clamped_height != height {
        window.set_size(Size::Logical(LogicalSize::new(
            clamped_width as f64,
            clamped_height as f64,
        )))?;
    }

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

/// The window's current DPI scale, floored so it can never be zero — dividing by
/// it would otherwise yield an infinity that clamps every size to nothing.
fn window_scale(window: &WebviewWindow) -> f64 {
    window.scale_factor().unwrap_or(1.0).max(0.1)
}

/// Updates the remembered window position in memory. Persisting is deferred to
/// [`persist_window_state`], because this fires on every move event.
pub fn remember_window_position(app: &AppHandle, x: i32, y: i32) {
    let Some(state) = app.try_state::<SharedState>() else {
        return;
    };
    let Ok(mut storage) = state.lock() else {
        return;
    };
    storage.set_window_position(x, y);
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
        // A launcher should appear where the user is looking, and on two
        // monitors that is usually not where it last was. The remembered
        // position is only consulted when following is switched off.
        let follow_cursor = settings
            .map(|value| value.follow_cursor_monitor)
            .unwrap_or(true);

        let preferred_position = if follow_cursor {
            None
        } else {
            settings.and_then(saved_window_position).and_then(|(x, y)| {
                monitor_rect_for_point(x, y, false)
                    .ok()
                    .flatten()
                    .map(|rect| (rect, x, y))
            })
        };

        // `current_monitor_rect` is the one under the pointer, which is exactly
        // the anchor this needs.
        let monitor = preferred_position
            .map(|(rect, _, _)| rect)
            .unwrap_or(current_monitor_rect()?);
        let limits = window_size_limits_for_rect(&monitor, window_scale(window));
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
        let current_position = window
            .outer_position()
            .ok()
            .map(|position| (position.x, position.y));
        let saved_position = settings.and_then(saved_window_position);
        let anchor = current_position.or(saved_position);
        let monitor = if let Some((x, y)) = anchor {
            monitor_rect_for_point(x, y, false)?.unwrap_or(current_monitor_rect()?)
        } else {
            current_monitor_rect()?
        };
        let limits = window_size_limits_for_rect(&monitor, window_scale(window));
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
        remember_window_position(app, position.x, position.y);
    }
}

fn saved_window_position(settings: &Settings) -> Option<(i32, i32)> {
    Some((settings.window_x?, settings.window_y?))
}

/// The window's usable size range, in **logical** pixels.
///
/// Everything the user sees, and everything `settings.json` stores, is logical,
/// so the limits have to be too. They used to be raw `GetMonitorInfoW` work-area
/// pixels, which on a 150%-scaled display capped `MAX_WINDOW_WIDTH` at
/// `1400 / 1.5 ≈ 933` logical pixels. With a 760-pixel minimum that left almost
/// no range at all, so dragging the window edge appeared to do nothing.
fn active_window_size_limits(app: &AppHandle, window: &WebviewWindow) -> Result<WindowSizeLimits> {
    let scale = window_scale(window);

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        let _ = window;
        Ok(WindowSizeLimits {
            min_width: MIN_WINDOW_WIDTH,
            min_height: MIN_WINDOW_HEIGHT,
            max_width: MAX_WINDOW_WIDTH,
            max_height: (2160.0 / scale).round() as u32,
        })
    }

    #[cfg(target_os = "windows")]
    {
        let settings = current_settings(app);
        let current_position = window
            .outer_position()
            .ok()
            .map(|position| (position.x, position.y));
        let saved_position = settings.as_ref().and_then(saved_window_position);
        let anchor = current_position.or(saved_position);
        let monitor = if let Some((x, y)) = anchor {
            monitor_rect_for_point(x, y, false)?.unwrap_or(current_monitor_rect()?)
        } else {
            current_monitor_rect()?
        };

        Ok(window_size_limits_for_rect(&monitor, scale))
    }
}

/// `monitor` is a work area in physical pixels; the result is in logical pixels.
#[cfg(target_os = "windows")]
fn window_size_limits_for_rect(monitor: &RECT, scale: f64) -> WindowSizeLimits {
    let to_logical = |physical: i32| ((physical as f64 / scale).round() as u32).max(1);

    let available_width = to_logical(monitor.right - monitor.left).max(MIN_WINDOW_WIDTH);
    let available_height = to_logical(monitor.bottom - monitor.top).max(MIN_WINDOW_HEIGHT);

    WindowSizeLimits {
        min_width: MIN_WINDOW_WIDTH,
        min_height: MIN_WINDOW_HEIGHT,
        max_width: available_width.clamp(MIN_WINDOW_WIDTH, MAX_WINDOW_WIDTH),
        max_height: available_height.max(MIN_WINDOW_HEIGHT),
    }
}

/// Shrinks a window that is larger than its monitor allows. Both sides are
/// converted to logical pixels first: comparing the physical `outer_size`
/// against logical limits made the window snap smaller on any scaled display,
/// which is what fought the user's drag.
fn clamp_window_size_to_monitor(window: &WebviewWindow, limits: &WindowSizeLimits) -> Result<()> {
    let scale = window_scale(window);
    let size = window.outer_size()?;
    let logical_width = ((size.width as f64 / scale).round() as u32).max(1);
    let logical_height = ((size.height as f64 / scale).round() as u32).max(1);

    if logical_width > limits.max_width || logical_height > limits.max_height {
        window.set_size(Size::Logical(LogicalSize::new(
            logical_width.min(limits.max_width) as f64,
            logical_height.min(limits.max_height) as f64,
        )))?;
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
fn monitor_rect(monitor: windows::Win32::Graphics::Gdi::HMONITOR) -> Result<RECT> {
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

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;
    use tauri::PhysicalSize;

    fn work_area(left: i32, top: i32, right: i32, bottom: i32) -> RECT {
        RECT {
            left,
            top,
            right,
            bottom,
        }
    }

    #[test]
    fn center_position_sits_in_the_middle_of_the_work_area() {
        let monitor = work_area(0, 0, 1920, 1040);
        assert_eq!(
            center_position_in_rect(&monitor, PhysicalSize::new(760, 560)),
            (580, 240)
        );
    }

    #[test]
    fn center_position_handles_a_secondary_monitor_at_negative_coordinates() {
        let monitor = work_area(-1920, 0, 0, 1040);
        assert_eq!(
            center_position_in_rect(&monitor, PhysicalSize::new(760, 560)),
            (-1340, 240)
        );
    }

    /// A position saved on a monitor that has since been unplugged must land
    /// back inside the current work area rather than off-screen.
    #[test]
    fn a_saved_position_outside_every_monitor_is_pulled_back_in() {
        let monitor = work_area(0, 0, 1920, 1040);
        assert_eq!(
            clamp_position_to_rect(&monitor, PhysicalSize::new(760, 560), -500, 9000),
            (0, 480)
        );
    }

    /// A work area smaller than the window pins it to the origin instead of
    /// producing a negative maximum and panicking inside `clamp`.
    #[test]
    fn a_window_larger_than_the_work_area_is_pinned_to_its_origin() {
        let monitor = work_area(0, 0, 800, 600);
        assert_eq!(
            clamp_position_to_rect(&monitor, PhysicalSize::new(1200, 900), 100, 100),
            (0, 0)
        );
    }

    /// A 3840x2160 work area at 150% scaling is 2560x1440 logical. The limits
    /// used to be raw physical pixels, so `MAX_WINDOW_WIDTH` capped the window at
    /// 1400 physical ≈ 933 logical — barely above the 760 minimum, which left
    /// almost no range and made dragging the window edge look broken.
    #[test]
    fn size_limits_are_logical_not_physical() {
        let monitor = work_area(0, 0, 3840, 2160);
        let limits = window_size_limits_for_rect(&monitor, 1.5);

        assert_eq!(limits.max_width, MAX_WINDOW_WIDTH);
        assert_eq!(limits.max_height, 1440);
        assert_eq!(limits.min_width, MIN_WINDOW_WIDTH);
    }

    #[test]
    fn an_unscaled_display_is_unaffected_by_the_conversion() {
        let monitor = work_area(0, 0, 1920, 1040);
        let limits = window_size_limits_for_rect(&monitor, 1.0);

        assert_eq!(limits.max_width, MAX_WINDOW_WIDTH);
        assert_eq!(limits.max_height, 1040);
    }

    #[test]
    fn a_work_area_smaller_than_the_minimum_still_offers_the_minimum() {
        let monitor = work_area(0, 0, 700, 500);
        let limits = window_size_limits_for_rect(&monitor, 1.0);

        assert_eq!(limits.max_width, MIN_WINDOW_WIDTH);
        assert_eq!(limits.max_height, MIN_WINDOW_HEIGHT);
    }
}
