use anyhow::Result;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    App, Manager,
};

use crate::hotkey;

pub fn setup(app: &mut App) -> Result<()> {
    let open_item = MenuItem::with_id(app, "toggle_window", "Open / Hide", true, None::<&str>)?;
    let startup_item =
        MenuItem::with_id(app, "toggle_startup", "Launch at Login", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &startup_item, &quit_item])?;

    let icon = app.default_window_icon().cloned();
    let mut builder = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle_window" => {
                let _ = hotkey::toggle_main_window(app);
            }
            "toggle_startup" => {
                if let Some(state) = app.try_state::<crate::app_state::SharedState>() {
                    if let Ok(mut storage) = state.lock() {
                        let enabled = !storage.settings().launch_on_startup;
                        let _ = crate::commands::apply_launch_on_startup(app, &mut storage, enabled);
                    }
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        });

    if let Some(icon) = icon {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}
