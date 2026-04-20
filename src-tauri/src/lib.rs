mod app_state;
mod commands;
mod discovery;
mod hotkey;
mod icons;
mod launcher;
mod models;
mod storage;
mod tray;

use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_global_shortcut::{Builder as GlobalShortcutBuilder, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            {
                let mut storage = state.lock().map_err(anyhow::Error::msg)?;
                if let Ok(enabled) = app.autolaunch().is_enabled() {
                    let _ = storage.set_launch_on_startup(enabled);
                }
                hotkey::register_hotkey(app.handle(), &storage.settings().hotkey)?;
                hotkey::apply_window_size(
                    app.handle(),
                    storage.settings().window_width,
                    storage.settings().window_height,
                )?;
            }

            app.manage(state);
            tray::setup(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.hide();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }

            match event {
                WindowEvent::Moved(position) => {
                    let _ = hotkey::remember_window_position(&window.app_handle(), position.x, position.y);
                }
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = hotkey::hide_main_window(&window.app_handle());
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
            commands::toggle_favorite,
            commands::import_paths,
            commands::scan_discovery_candidates,
            commands::import_discovery_candidates,
            commands::set_hotkey,
            commands::set_launch_on_startup,
            commands::set_close_on_launch,
            commands::set_display_mode,
            commands::set_window_size,
            commands::sync_window_size,
            commands::set_config_directory,
            commands::export_config,
            commands::import_config,
            commands::open_config_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running deskrun");
}
