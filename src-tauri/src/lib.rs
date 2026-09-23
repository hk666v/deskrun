mod app_state;
mod commands;
mod discovery;
mod hotkey;
mod icons;
mod launcher;
mod models;
mod storage;
mod tray;

use anyhow::Result;
use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_global_shortcut::{Builder as GlobalShortcutBuilder, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(error) = run_app() {
        report_startup_failure(&error);
    }
}

fn run_app() -> Result<()> {
    tauri::Builder::default()
        // Registered first so a second launch hands off to the running instance
        // instead of fighting it for the global hotkey and then dying.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = hotkey::show_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            GlobalShortcutBuilder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let _ = hotkey::toggle_main_window(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let state = app_state::AppState::new(app.handle())?;

            let (hotkey, window_width, window_height) = {
                let mut storage = state.lock().map_err(anyhow::Error::msg)?;
                if let Ok(enabled) = app.autolaunch().is_enabled() {
                    let _ = storage.set_launch_on_startup(enabled);
                }
                let settings = storage.settings();
                (
                    settings.hotkey.clone(),
                    settings.window_width,
                    settings.window_height,
                )
            };

            // A hotkey conflict degrades to "no hotkey" — the tray still opens the
            // launcher, so this must not abort the boot.
            if let Some(warning) = hotkey::register_hotkey_or_warn(app.handle(), &hotkey) {
                state.set_startup_warning(warning);
            }

            hotkey::apply_window_size(app.handle(), window_width, window_height)?;

            app.manage(state);
            tray::setup(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }

            match event {
                WindowEvent::Moved(position) => {
                    hotkey::remember_window_position(window.app_handle(), position.x, position.y);
                }
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = hotkey::hide_main_window(window.app_handle());
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_bootstrap_data,
            commands::create_item,
            commands::update_item,
            commands::delete_item,
            commands::reorder_items,
            commands::create_group,
            commands::rename_group,
            commands::delete_group,
            commands::reorder_groups,
            commands::launch_item,
            commands::launch_item_as_admin,
            commands::duplicate_item,
            commands::toggle_favorite,
            commands::import_paths,
            commands::scan_discovery_candidates,
            commands::import_discovery_candidates,
            commands::set_hotkey,
            commands::set_launch_on_startup,
            commands::set_close_on_launch,
            commands::set_display_mode,
            commands::sync_window_size,
            commands::set_config_directory,
            commands::export_config,
            commands::import_config,
            commands::open_config_directory,
            commands::hide_main_window,
            commands::read_icon,
        ])
        .run(tauri::generate_context!())?;

    Ok(())
}

/// A `windows_subsystem = "windows"` binary has no console, so an error escaping
/// `run` would look to the user like "double-clicked and nothing happened".
#[cfg(target_os = "windows")]
fn report_startup_failure(error: &anyhow::Error) {
    use windows::core::HSTRING;
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

    let text = HSTRING::from(format!("{error:#}"));
    let caption = HSTRING::from("DeskRun failed to start");
    unsafe {
        MessageBoxW(None, &text, &caption, MB_OK | MB_ICONERROR);
    }
}

#[cfg(not(target_os = "windows"))]
fn report_startup_failure(error: &anyhow::Error) {
    eprintln!("deskrun failed to start: {error:#}");
}
