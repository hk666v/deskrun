use tauri::{AppHandle, State};
use tauri_plugin_autostart::ManagerExt as AutostartExt;

use crate::{
    app_state::SharedState,
    hotkey,
    launcher,
    models::{BootstrapData, CreateItemPayload, Group, LaunchItem, UpdateItemPayload},
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
    storage.create_item(payload).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_item(
    state: State<'_, SharedState>,
    payload: UpdateItemPayload,
) -> Result<LaunchItem, String> {
    let mut storage = state.lock()?;
    storage.update_item(payload).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_item(state: State<'_, SharedState>, item_id: String) -> Result<(), String> {
    let mut storage = state.lock()?;
    storage.delete_item(&item_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn reorder_items(
    state: State<'_, SharedState>,
    item_ids: Vec<String>,
) -> Result<Vec<LaunchItem>, String> {
    let mut storage = state.lock()?;
    storage.reorder_items(item_ids).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_group(state: State<'_, SharedState>, name: String) -> Result<Group, String> {
    let mut storage = state.lock()?;
    storage.create_group(name).map_err(|error| error.to_string())
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
pub fn delete_group(
    state: State<'_, SharedState>,
    group_id: String,
) -> Result<Vec<Group>, String> {
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
pub fn import_paths(
    state: State<'_, SharedState>,
    paths: Vec<String>,
) -> Result<Vec<LaunchItem>, String> {
    let mut storage = state.lock()?;
    storage.import_paths(paths).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn launch_item(
    app: AppHandle,
    state: State<'_, SharedState>,
    item_id: String,
    runtime_target: Option<String>,
) -> Result<(), String> {
    let (item, close_on_launch) = {
        let storage = state.lock()?;
        let item = storage
            .get_item(&item_id)
            .ok_or_else(|| "launch item not found".to_string())?;
        (item, storage.settings().close_on_launch)
    };

    launcher::launch(&item, runtime_target.as_deref()).map_err(|error| error.to_string())?;
    if close_on_launch {
        let _ = hotkey::hide_main_window(&app);
    }
    Ok(())
}

#[tauri::command]
pub fn set_hotkey(
    app: AppHandle,
    state: State<'_, SharedState>,
    hotkey: String,
) -> Result<BootstrapData, String> {
    hotkey::register_hotkey(&app, &hotkey).map_err(|error| error.to_string())?;
    let mut storage = state.lock()?;
    storage
        .set_hotkey(hotkey)
        .map_err(|error| error.to_string())?;
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
pub fn set_window_size(
    app: AppHandle,
    state: State<'_, SharedState>,
    width: u32,
    height: u32,
) -> Result<BootstrapData, String> {
    hotkey::apply_window_size(&app, width, height).map_err(|error| error.to_string())?;
    let limits = hotkey::window_size_limits().map_err(|error| error.to_string())?;
    let mut storage = state.lock()?;
    storage
        .set_window_size(width, height, &limits)
        .map_err(|error| error.to_string())?;
    bootstrap_data(&app, &storage)
}

#[tauri::command]
pub fn sync_window_size(
    app: AppHandle,
    state: State<'_, SharedState>,
    width: u32,
    height: u32,
) -> Result<BootstrapData, String> {
    let limits = hotkey::sync_window_size(&app, width, height).map_err(|error| error.to_string())?;
    let mut storage = state.lock()?;
    storage
        .set_window_size(width, height, &limits)
        .map_err(|error| error.to_string())?;
    bootstrap_data(&app, &storage)
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
pub fn open_config_directory(
    state: State<'_, SharedState>,
) -> Result<(), String> {
    let storage = state.lock()?;
    std::process::Command::new("cmd.exe")
        .args([
            "/C",
            "start",
            "",
            storage.current_data_dir().to_string_lossy().as_ref(),
        ])
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
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
    let limits = hotkey::window_size_limits().map_err(|error| error.to_string())?;
    let _ = app;
    Ok(storage.bootstrap(limits))
}
