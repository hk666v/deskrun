use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_opener::OpenerExt;

use crate::{
    app_state::SharedState,
    discovery, hotkey, launcher,
    models::{
        BootstrapData, CreateItemPayload, DiscoveryCandidate, DiscoveryCandidateImport,
        DiscoveryScanOptions, Group, LaunchItem, Settings, UpdateItemPayload,
    },
};

#[tauri::command]
pub fn get_bootstrap_data(
    app: AppHandle,
    state: State<'_, SharedState>,
) -> Result<BootstrapData, String> {
    let storage = state.lock()?;
    bootstrap_data(&app, &storage)
}

#[tauri::command]
pub fn create_item(
    state: State<'_, SharedState>,
    payload: CreateItemPayload,
) -> Result<LaunchItem, String> {
    let mut storage = state.lock()?;
    storage
        .create_item(payload)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_item(
    state: State<'_, SharedState>,
    payload: UpdateItemPayload,
) -> Result<LaunchItem, String> {
    let mut storage = state.lock()?;
    storage
        .update_item(payload)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_item(state: State<'_, SharedState>, item_id: String) -> Result<(), String> {
    let mut storage = state.lock()?;
    storage
        .delete_item(&item_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn reorder_items(
    state: State<'_, SharedState>,
    item_ids: Vec<String>,
) -> Result<Vec<LaunchItem>, String> {
    let mut storage = state.lock()?;
    storage
        .reorder_items(item_ids)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_group(state: State<'_, SharedState>, name: String) -> Result<Group, String> {
    let mut storage = state.lock()?;
    storage
        .create_group(name)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn rename_group(
    state: State<'_, SharedState>,
    group_id: String,
    name: String,
) -> Result<Vec<Group>, String> {
    let mut storage = state.lock()?;
    storage
        .rename_group(&group_id, name)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_group(state: State<'_, SharedState>, group_id: String) -> Result<Vec<Group>, String> {
    let mut storage = state.lock()?;
    storage
        .delete_group(&group_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn reorder_groups(
    state: State<'_, SharedState>,
    group_ids: Vec<String>,
) -> Result<Vec<Group>, String> {
    let mut storage = state.lock()?;
    storage
        .reorder_groups(group_ids)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn import_paths(
    state: State<'_, SharedState>,
    paths: Vec<String>,
) -> Result<Vec<LaunchItem>, String> {
    let shared = state.inner().clone();

    // Icon extraction and PNG encoding per path is slow enough to visibly freeze
    // the window, so keep it off the main thread.
    tauri::async_runtime::spawn_blocking(move || {
        let mut storage = shared.lock()?;
        storage
            .import_paths(paths)
            .map_err(|error| format!("{error:#}"))
    })
    .await
    .map_err(|error| format!("import task failed: {error}"))?
}

#[tauri::command]
pub async fn scan_discovery_candidates(
    state: State<'_, SharedState>,
    options: DiscoveryScanOptions,
) -> Result<Vec<DiscoveryCandidate>, String> {
    // Take the snapshot the scan needs, then release the lock. Holding it across
    // the scan meant a registry walk plus recursive directory listings froze the
    // window and queued the hotkey and tray callbacks behind it.
    let existing_targets = {
        let storage = state.lock()?;
        storage.discovery_target_keys()
    };

    // Registry and filesystem reads are blocking syscalls, so keep them off the
    // async worker pool as well as the main thread.
    tauri::async_runtime::spawn_blocking(move || discovery::scan(&existing_targets, &options))
        .await
        .map_err(|error| format!("discovery scan task failed: {error}"))?
        .map_err(|error| format!("{error:#}"))
}

#[tauri::command]
pub async fn import_discovery_candidates(
    state: State<'_, SharedState>,
    candidates: Vec<DiscoveryCandidateImport>,
) -> Result<Vec<LaunchItem>, String> {
    let shared = state.inner().clone();

    tauri::async_runtime::spawn_blocking(move || {
        let mut storage = shared.lock()?;
        storage
            .import_discovery_candidates(candidates)
            .map_err(|error| format!("{error:#}"))
    })
    .await
    .map_err(|error| format!("import task failed: {error}"))?
}

#[tauri::command]
pub fn launch_item(
    app: AppHandle,
    state: State<'_, SharedState>,
    item_id: String,
) -> Result<LaunchItem, String> {
    run_item(&app, &state, &item_id, false)
}

/// Launches an item elevated for this one run, whatever the item's own setting
/// says. Windows will show the UAC prompt.
#[tauri::command]
pub fn launch_item_as_admin(
    app: AppHandle,
    state: State<'_, SharedState>,
    item_id: String,
) -> Result<LaunchItem, String> {
    run_item(&app, &state, &item_id, true)
}

fn run_item(
    app: &AppHandle,
    state: &State<'_, SharedState>,
    item_id: &str,
    force_admin: bool,
) -> Result<LaunchItem, String> {
    let (item, close_on_launch) = {
        let storage = state.lock()?;
        let item = storage
            .get_item(item_id)
            .ok_or_else(|| "launch item not found".to_string())?;
        (item, storage.settings().close_on_launch)
    };

    // A declined UAC prompt comes back as an error, so the window must stay put
    // to show it rather than hiding as if the item had launched.
    launcher::launch(app, &item, force_admin).map_err(|error| format!("{error:#}"))?;

    let updated = {
        let mut storage = state.lock()?;
        storage
            .record_launch(item_id)
            .map_err(|error| format!("{error:#}"))?
    };
    if close_on_launch {
        let _ = hotkey::hide_main_window(app);
    }
    Ok(updated)
}

#[tauri::command]
pub fn duplicate_item(
    state: State<'_, SharedState>,
    item_id: String,
) -> Result<LaunchItem, String> {
    let mut storage = state.lock()?;
    storage
        .duplicate_item(&item_id)
        .map_err(|error| format!("{error:#}"))
}

#[tauri::command]
pub fn toggle_favorite(
    state: State<'_, SharedState>,
    item_id: String,
    favorite: bool,
) -> Result<LaunchItem, String> {
    let mut storage = state.lock()?;
    storage
        .toggle_favorite(&item_id, favorite)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_hotkey(
    app: AppHandle,
    state: State<'_, SharedState>,
    hotkey: String,
) -> Result<BootstrapData, String> {
    // Register before persisting. If the new combination is refused, the old one
    // is still live and settings.json still records it, so the launcher stays
    // reachable and a restart is not required to recover.
    let previous = {
        let storage = state.lock()?;
        storage.settings().hotkey.clone()
    };
    hotkey::register_hotkey(&app, Some(&previous), &hotkey)
        .map_err(|error| format!("{error:#}"))?;

    let mut storage = state.lock()?;
    storage
        .set_hotkey(hotkey)
        .map_err(|error| format!("{error:#}"))?;
    bootstrap_data(&app, &storage)
}

#[tauri::command]
pub fn set_launch_on_startup(
    app: AppHandle,
    state: State<'_, SharedState>,
    enabled: bool,
) -> Result<BootstrapData, String> {
    let mut storage = state.lock()?;
    apply_launch_on_startup(&app, &mut storage, enabled)?;
    bootstrap_data(&app, &storage)
}

#[tauri::command]
pub fn set_close_on_launch(
    app: AppHandle,
    state: State<'_, SharedState>,
    close_on_launch: bool,
) -> Result<BootstrapData, String> {
    let mut storage = state.lock()?;
    storage
        .set_close_on_launch(close_on_launch)
        .map_err(|error| error.to_string())?;
    bootstrap_data(&app, &storage)
}

#[tauri::command]
pub fn set_display_mode(
    app: AppHandle,
    state: State<'_, SharedState>,
    display_mode: String,
) -> Result<BootstrapData, String> {
    let mut storage = state.lock()?;
    storage
        .set_display_mode(display_mode)
        .map_err(|error| error.to_string())?;
    bootstrap_data(&app, &storage)
}

/// Records the size the user dragged the window to. Returns only the settings,
/// since nothing else can have changed and this runs while the mouse is moving.
#[tauri::command]
pub fn sync_window_size(
    app: AppHandle,
    state: State<'_, SharedState>,
    width: u32,
    height: u32,
) -> Result<Settings, String> {
    let limits =
        hotkey::sync_window_size(&app, width, height).map_err(|error| format!("{error:#}"))?;
    let mut storage = state.lock()?;
    storage
        .set_window_size(width, height, &limits)
        .map_err(|error| format!("{error:#}"))?;
    Ok(storage.settings().clone())
}

#[tauri::command]
pub fn set_config_directory(
    app: AppHandle,
    state: State<'_, SharedState>,
    path: Option<String>,
) -> Result<BootstrapData, String> {
    let mut storage = state.lock()?;
    let next = storage
        .relocate(&app, path.as_deref())
        .map_err(|error| error.to_string())?;
    *storage = next;
    bootstrap_data(&app, &storage)
}

#[tauri::command]
pub fn export_config(
    state: State<'_, SharedState>,
    destination_dir: String,
) -> Result<String, String> {
    let storage = state.lock()?;
    storage
        .export_to_directory(&destination_dir)
        .map(|path| path.to_string_lossy().to_string())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn import_config(
    app: AppHandle,
    state: State<'_, SharedState>,
    source_dir: String,
) -> Result<BootstrapData, String> {
    let (previous_hotkey, imported_settings) = {
        let mut storage = state.lock()?;
        let previous = storage.settings().hotkey.clone();
        storage
            .import_from_directory(&source_dir)
            .map_err(|error| format!("{error:#}"))?;
        (previous, storage.settings().clone())
    };

    // An imported config carries its own hotkey. Claim it while the current
    // binding is still live; if it is refused, restore the previous one so
    // settings.json never claims a hotkey that is not actually registered.
    if let Err(error) =
        hotkey::register_hotkey(&app, Some(&previous_hotkey), &imported_settings.hotkey)
    {
        let mut storage = state.lock()?;
        storage
            .set_hotkey(previous_hotkey)
            .map_err(|error| format!("{error:#}"))?;
        return Err(format!("{error:#}"));
    }

    hotkey::apply_window_size(
        &app,
        imported_settings.window_width,
        imported_settings.window_height,
    )
    .map_err(|error| format!("{error:#}"))?;

    let mut storage = state.lock()?;
    apply_launch_on_startup(&app, &mut storage, imported_settings.launch_on_startup)?;
    bootstrap_data(&app, &storage)
}

#[tauri::command]
pub fn open_config_directory(app: AppHandle, state: State<'_, SharedState>) -> Result<(), String> {
    // Copy the path out and drop the lock before touching the shell — holding it
    // across the spawn blocks the hotkey and tray callbacks for no reason.
    let directory = {
        let storage = state.lock()?;
        storage.current_data_dir().to_string_lossy().to_string()
    };

    app.opener()
        .open_path(directory, None::<&str>)
        .map_err(|error| format!("{error:#}"))
}

#[tauri::command]
pub fn hide_main_window(app: AppHandle) -> Result<(), String> {
    hotkey::hide_main_window(&app).map_err(|error| format!("{error:#}"))
}

/// Returns a cached icon as a `data:` URL.
///
/// The asset protocol is not enabled in this build, so `convertFileSrc` handed
/// the webview URLs it could not load and every icon fell back to a text label.
/// Going through a command also keeps the icon folder private: only files that
/// resolve to somewhere inside it are served, so a crafted `iconPath` cannot
/// read arbitrary files off disk.
#[tauri::command]
pub fn read_icon(state: State<'_, SharedState>, icon_path: String) -> Result<String, String> {
    use base64::Engine as _;

    let icons_dir = {
        let storage = state.lock()?;
        storage.icons_dir.clone()
    };

    let canonical_root = icons_dir
        .canonicalize()
        .map_err(|error| format!("{error:#}"))?;
    let canonical_icon = std::path::PathBuf::from(&icon_path)
        .canonicalize()
        .map_err(|error| format!("{error:#}"))?;

    if !canonical_icon.starts_with(&canonical_root) {
        return Err("icon path is outside the icon cache".to_string());
    }

    let bytes = std::fs::read(&canonical_icon).map_err(|error| format!("{error:#}"))?;
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

pub fn apply_launch_on_startup(
    app: &AppHandle,
    storage: &mut crate::storage::StorageState,
    enabled: bool,
) -> Result<(), String> {
    if enabled {
        app.autolaunch()
            .enable()
            .map_err(|error| error.to_string())?;
    } else {
        app.autolaunch()
            .disable()
            .map_err(|error| error.to_string())?;
    }

    storage
        .set_launch_on_startup(enabled)
        .map_err(|error| error.to_string())
}

fn bootstrap_data(
    app: &AppHandle,
    storage: &crate::storage::StorageState,
) -> Result<BootstrapData, String> {
    let mut data = storage.bootstrap();
    data.startup_warning = app
        .try_state::<SharedState>()
        .and_then(|state| state.startup_warning());
    Ok(data)
}
