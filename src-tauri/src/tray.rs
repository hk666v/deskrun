use anyhow::Result;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::TrayIconBuilder,
    App, Manager,
};

use crate::app_state::SharedState;
use crate::hotkey;

pub fn setup(app: &mut App) -> Result<()> {
    let open_item = MenuItem::with_id(app, "toggle_window", "Open / Hide", true, None::<&str>)?;

    // Start from the stored setting so the checkmark is not lying about the
    // current state the moment the menu opens.
    let launch_on_startup = app
        .try_state::<SharedState>()
        .and_then(|state| {
            state
                .lock()
                .ok()
                .map(|storage| storage.settings().launch_on_startup)
        })
        .unwrap_or(false);
    let startup_item = CheckMenuItem::with_id(
        app,
        "toggle_startup",
        "Launch at Login",
        true,
        launch_on_startup,
        None::<&str>,
    )?;

    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &startup_item, &quit_item])?;

    let icon = app.default_window_icon().cloned();
    if icon.is_none() {
        eprintln!("deskrun: the bundle carries no default window icon; the tray will be blank");
    }

    // The menu-event closure is stored for the tray's lifetime, so it needs its
    // own handle to the check item.
    let startup_item_handle = startup_item.clone();

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "toggle_window" => {
                let _ = hotkey::toggle_main_window(app);
            }
            "toggle_startup" => {
                let Some(state) = app.try_state::<SharedState>() else {
                    return;
                };
                let Ok(mut storage) = state.lock() else {
                    return;
                };
                let enabled = !storage.settings().launch_on_startup;
                match crate::commands::apply_launch_on_startup(app, &mut storage, enabled) {
                    Ok(()) => {
                        let _ = startup_item_handle.set_checked(enabled);
                    }
                    Err(error) => {
                        eprintln!("deskrun: could not change the login item: {error}");
                    }
                }
            }
            "quit" => {
                // The position is only tracked in memory now, so capture it
                // before the process goes away.
                hotkey::persist_window_state(app);
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
