use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::{
    icons,
    models::{
        BootstrapData, ConfigDirectoryInfo, CreateItemPayload, Group, IconSource, LaunchItem,
        LaunchItemKind, PersistedItems, Settings, UpdateItemPayload, WindowSizeLimits,
    },
};

pub struct StorageState {
    default_data_dir: PathBuf,
    data_dir: PathBuf,
    config_location_path: PathBuf,
    pub icons_dir: PathBuf,
    items_path: PathBuf,
    settings_path: PathBuf,
    items_data: PersistedItems,
    settings: Settings,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ConfigLocationFile {
    custom_data_dir: Option<String>,
}

impl StorageState {
    pub fn load(app: &AppHandle) -> Result<Self> {
        let default_data_dir = app
            .path()
            .app_data_dir()
            .context("failed to resolve app data directory")?;
        fs::create_dir_all(&default_data_dir).context("failed to create app data directory")?;
        let config_location_path = default_data_dir.join("config-location.json");
        let location_file =
            read_json::<ConfigLocationFile>(&config_location_path)?.unwrap_or_default();
        let data_dir = location_file
            .custom_data_dir
            .as_deref()
            .map(PathBuf::from)
            .filter(|path| !path.as_os_str().is_empty())
            .unwrap_or_else(|| default_data_dir.clone());
        let icons_dir = data_dir.join("icons");
        let items_path = data_dir.join("items.json");
        let settings_path = data_dir.join("settings.json");

        fs::create_dir_all(&data_dir).context("failed to create data directory")?;
        fs::create_dir_all(&icons_dir).context("failed to create icons directory")?;

        let items_data = read_json::<PersistedItems>(&items_path)?.unwrap_or_default();
        let settings = read_json::<Settings>(&settings_path)?.unwrap_or_default();

        let mut storage = Self {
            default_data_dir,
            data_dir,
            config_location_path,
            icons_dir,
            items_path,
            settings_path,
            items_data,
            settings,
        };
        storage.normalize();
        storage.persist_all()?;
        Ok(storage)
    }

    pub fn bootstrap(&self, window_size_limits: WindowSizeLimits) -> BootstrapData {
        BootstrapData {
            items: self.sorted_items(),
            groups: self.sorted_groups(),
            settings: self.settings.clone(),
            window_size_limits,
            config_directory: self.config_directory_info(),
        }
    }

    pub fn settings(&self) -> &Settings {
        &self.settings
    }

    pub fn config_directory_info(&self) -> ConfigDirectoryInfo {
        ConfigDirectoryInfo {
            current_path: self.data_dir.to_string_lossy().to_string(),
            default_path: self.default_data_dir.to_string_lossy().to_string(),
            using_custom_path: self.data_dir != self.default_data_dir,
        }
    }

    pub fn current_data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub fn relocate(&self, app: &AppHandle, requested_dir: Option<&str>) -> Result<Self> {
        let next_dir = requested_dir
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| self.default_data_dir.clone());

        if next_dir == self.data_dir {
            if next_dir == self.default_data_dir {
                let _ = fs::remove_file(&self.config_location_path);
            }
            return Self::load(app);
        }

        fs::create_dir_all(&next_dir).with_context(|| {
            format!("failed to create config directory {}", next_dir.display())
        })?;

        let next_icons_dir = next_dir.join("icons");
        fs::create_dir_all(&next_icons_dir).with_context(|| {
            format!(
                "failed to create icons directory in {}",
                next_icons_dir.display()
            )
        })?;

        let mut items_data = self.items_data.clone();
        remap_icon_paths(&mut items_data.items, &next_icons_dir);
        write_json(&next_dir.join("items.json"), &items_data)?;
        write_json(&next_dir.join("settings.json"), &self.settings)?;
        copy_directory_contents(&self.icons_dir, &next_icons_dir)?;

        let next_location = ConfigLocationFile {
            custom_data_dir: if next_dir == self.default_data_dir {
                None
            } else {
                Some(next_dir.to_string_lossy().to_string())
            },
        };
        if next_location.custom_data_dir.is_some() {
            write_json(&self.config_location_path, &next_location)?;
        } else {
            let _ = fs::remove_file(&self.config_location_path);
        }

        Self::load(app)
    }

    pub fn export_to_directory(&self, destination_root: &str) -> Result<PathBuf> {
        let destination_root = PathBuf::from(destination_root.trim());
        if destination_root.as_os_str().is_empty() {
            return Err(anyhow!("export destination cannot be empty"));
        }

        fs::create_dir_all(&destination_root).with_context(|| {
            format!(
                "failed to create export destination {}",
                destination_root.display()
            )
        })?;

        let export_dir = unique_export_dir(&destination_root);
        let export_icons_dir = export_dir.join("icons");
        fs::create_dir_all(&export_icons_dir).with_context(|| {
            format!("failed to create export icons directory {}", export_icons_dir.display())
        })?;

        let mut items_data = self.items_data.clone();
        remap_icon_paths(&mut items_data.items, &export_icons_dir);
        write_json(&export_dir.join("items.json"), &items_data)?;
        write_json(&export_dir.join("settings.json"), &self.settings)?;
        copy_directory_contents(&self.icons_dir, &export_icons_dir)?;

        Ok(export_dir)
    }

    pub fn import_from_directory(&mut self, source_dir: &str) -> Result<()> {
        let source_dir = PathBuf::from(source_dir.trim());
        if source_dir.as_os_str().is_empty() {
            return Err(anyhow!("import source cannot be empty"));
        }

        let items_path = source_dir.join("items.json");
        let settings_path = source_dir.join("settings.json");
        let icons_dir = source_dir.join("icons");

        let mut items_data = read_json::<PersistedItems>(&items_path)?
            .ok_or_else(|| anyhow!("items.json was not found in {}", source_dir.display()))?;
        let settings = read_json::<Settings>(&settings_path)?
            .ok_or_else(|| anyhow!("settings.json was not found in {}", source_dir.display()))?;

        fs::create_dir_all(&self.data_dir).context("failed to create data directory")?;
        clear_directory_contents(&self.icons_dir)?;
        fs::create_dir_all(&self.icons_dir).context("failed to recreate icons directory")?;
        copy_directory_contents(&icons_dir, &self.icons_dir)?;

        remap_icon_paths(&mut items_data.items, &self.icons_dir);
        self.items_data = items_data;
        self.settings = settings;
        self.normalize();
        self.persist_all()
    }

    pub fn set_launch_on_startup(&mut self, enabled: bool) -> Result<()> {
        self.settings.launch_on_startup = enabled;
        self.persist_settings()
    }

    pub fn set_hotkey(&mut self, hotkey: String) -> Result<()> {
        self.settings.hotkey = hotkey;
        self.persist_settings()
    }

    pub fn set_close_on_launch(&mut self, close_on_launch: bool) -> Result<()> {
        self.settings.close_on_launch = close_on_launch;
        self.persist_settings()
    }

    pub fn set_display_mode(&mut self, display_mode: String) -> Result<()> {
        let normalized = display_mode.trim().to_ascii_lowercase();
        if normalized != "grid" && normalized != "list" {
            return Err(anyhow!("display mode must be either grid or list"));
        }

        self.settings.display_mode = normalized;
        self.persist_settings()
    }

    pub fn set_window_size(
        &mut self,
        width: u32,
        height: u32,
        limits: &WindowSizeLimits,
    ) -> Result<()> {
        self.settings.window_width = width.clamp(limits.min_width, limits.max_width);
        self.settings.window_height = height.clamp(limits.min_height, limits.max_height);
        self.persist_settings()
    }

    pub fn set_window_position(&mut self, x: i32, y: i32) -> Result<()> {
        self.settings.window_x = Some(x);
        self.settings.window_y = Some(y);
        self.persist_settings()
    }

    pub fn create_item(&mut self, payload: CreateItemPayload) -> Result<LaunchItem> {
        let now = now_iso();
        let id = Uuid::new_v4().to_string();
        let kind = payload.kind.clone();
        let command = match kind {
            LaunchItemKind::Command => Some(
                payload
                    .command
                    .clone()
                    .unwrap_or_else(|| payload.target.clone())
                    .trim()
                    .to_string(),
            ),
            _ => None,
        };
        let target = match kind {
            LaunchItemKind::Command => command.clone().unwrap_or_default(),
            _ => payload.target,
        };

        if matches!(kind, LaunchItemKind::Command)
            && command.as_deref().map(|value| value.is_empty()).unwrap_or(true)
        {
            return Err(anyhow!("command cannot be empty"));
        }

        let mut item = LaunchItem {
            id: id.clone(),
            name: payload
                .name
                .unwrap_or_else(|| default_name_for_target(&kind, &target)),
            kind,
            target,
            command,
            note: normalize_optional_text(payload.note),
            fixed_args: normalize_optional_text(payload.fixed_args),
            runtime_args: normalize_optional_text(payload.runtime_args),
            working_dir: payload
                .working_dir
                .and_then(|value| normalize_text(value)),
            keep_open: payload.keep_open.unwrap_or(false),
            is_favorite: false,
            launch_count: 0,
            last_launched_at: None,
            group_id: payload.group_id,
            icon_source: IconSource::Auto,
            icon_path: None,
            sort_order: self.next_item_sort_order(None),
            created_at: now.clone(),
            updated_at: now,
        };

        item.sort_order = self.next_item_sort_order(item.group_id.as_deref());
        item.icon_path = icons::resolve_auto_icon(&item, &self.icons_dir)?;
        self.items_data.items.push(item.clone());
        self.persist_items()?;
        Ok(item)
    }

    pub fn import_paths(&mut self, paths: Vec<String>) -> Result<Vec<LaunchItem>> {
        let mut created = Vec::new();

        for raw in paths {
            let path = PathBuf::from(raw.trim());
            let Some(kind) = detect_item_kind(&path) else {
                continue;
            };

            let payload = CreateItemPayload {
                kind,
                target: path.to_string_lossy().to_string(),
                name: Some(default_name_for_path(&path)),
                command: None,
                note: None,
                fixed_args: None,
                runtime_args: None,
                working_dir: None,
                keep_open: None,
                group_id: None,
            };

            created.push(self.create_item(payload)?);
        }

        Ok(created)
    }

    pub fn update_item(&mut self, payload: UpdateItemPayload) -> Result<LaunchItem> {
        let requested_group_id = payload.group_id.clone();
        let requested_sort_order = requested_group_id
            .as_ref()
            .map(|group_id| self.next_item_sort_order(group_id.as_deref()));
        let item = self
            .items_data
            .items
            .iter_mut()
            .find(|item| item.id == payload.id)
            .ok_or_else(|| anyhow!("launch item not found"))?;

        if let Some(name) = payload.name {
            item.name = name;
        }

        if let Some(target) = payload.target {
            item.target = target;
            if item.icon_source == IconSource::Auto {
                item.icon_path = icons::resolve_auto_icon(item, &self.icons_dir)?;
            }
        }

        if let Some(command) = payload.command {
            let trimmed = command.trim().to_string();
            if trimmed.is_empty() {
                return Err(anyhow!("command cannot be empty"));
            }
            item.command = Some(trimmed.clone());
            if matches!(item.kind, LaunchItemKind::Command) {
                item.target = trimmed;
            }
        }

        if let Some(note) = payload.note {
            item.note = note.and_then(normalize_text);
        }

        if let Some(fixed_args) = payload.fixed_args {
            item.fixed_args = fixed_args.and_then(normalize_text);
        }

        if let Some(runtime_args) = payload.runtime_args {
            item.runtime_args = runtime_args.and_then(normalize_text);
        }

        if let Some(working_dir) = payload.working_dir {
            item.working_dir = working_dir.and_then(normalize_text);
        }

        if let Some(keep_open) = payload.keep_open {
            item.keep_open = keep_open;
        }

        if let Some(group_id) = requested_group_id {
            item.group_id = group_id;
            item.sort_order = requested_sort_order.unwrap_or(item.sort_order);
        }

        if payload.clear_custom_icon.unwrap_or(false) {
            item.icon_source = IconSource::Auto;
            item.icon_path = icons::resolve_auto_icon(item, &self.icons_dir)?;
        }

        if let Some(custom_icon_path) = payload.custom_icon_path {
            let icon_path = icons::import_custom_icon(&custom_icon_path, &item.id, &self.icons_dir)?;
            item.icon_source = IconSource::Custom;
            item.icon_path = Some(icon_path);
        }

        item.updated_at = now_iso();
        let updated = item.clone();
        self.persist_items()?;
        Ok(updated)
    }

    pub fn delete_item(&mut self, item_id: &str) -> Result<()> {
        self.items_data.items.retain(|item| item.id != item_id);
        self.persist_items()
    }

    pub fn toggle_favorite(&mut self, item_id: &str, favorite: bool) -> Result<LaunchItem> {
        let item = self
            .items_data
            .items
            .iter_mut()
            .find(|item| item.id == item_id)
            .ok_or_else(|| anyhow!("launch item not found"))?;
        item.is_favorite = favorite;
        item.updated_at = now_iso();
        let updated = item.clone();
        self.persist_items()?;
        Ok(updated)
    }

    pub fn record_launch(&mut self, item_id: &str) -> Result<LaunchItem> {
        let item = self
            .items_data
            .items
            .iter_mut()
            .find(|item| item.id == item_id)
            .ok_or_else(|| anyhow!("launch item not found"))?;
        item.launch_count = item.launch_count.saturating_add(1);
        item.last_launched_at = Some(now_iso());
        item.updated_at = now_iso();
        let updated = item.clone();
        self.persist_items()?;
        Ok(updated)
    }

    pub fn reorder_items(&mut self, item_ids: Vec<String>) -> Result<Vec<LaunchItem>> {
        for (index, item_id) in item_ids.iter().enumerate() {
            if let Some(item) = self.items_data.items.iter_mut().find(|item| item.id == *item_id) {
                item.sort_order = index as i32;
                item.updated_at = now_iso();
            }
        }

        self.persist_items()?;
        Ok(self.sorted_items())
    }

    pub fn create_group(&mut self, name: String) -> Result<Group> {
        let normalized_name = normalize_group_name(&name)?;
        ensure_group_name_available(&self.items_data.groups, &normalized_name, None)?;
        let group = Group {
            id: Uuid::new_v4().to_string(),
            name: normalized_name,
            sort_order: self.items_data.groups.len() as i32,
        };
        self.items_data.groups.push(group.clone());
        self.persist_items()?;
        Ok(group)
    }

    pub fn rename_group(&mut self, group_id: &str, name: String) -> Result<Vec<Group>> {
        let normalized_name = normalize_group_name(&name)?;
        ensure_group_name_available(&self.items_data.groups, &normalized_name, Some(group_id))?;
        let group = self
            .items_data
            .groups
            .iter_mut()
            .find(|group| group.id == group_id)
            .ok_or_else(|| anyhow!("group not found"))?;
        group.name = normalized_name;
        self.persist_items()?;
        Ok(self.sorted_groups())
    }

    pub fn delete_group(&mut self, group_id: &str) -> Result<Vec<Group>> {
        self.items_data.groups.retain(|group| group.id != group_id);
        for item in &mut self.items_data.items {
            if item.group_id.as_deref() == Some(group_id) {
                item.group_id = None;
            }
        }
        self.normalize();
        self.persist_items()?;
        Ok(self.sorted_groups())
    }

    pub fn reorder_groups(&mut self, group_ids: Vec<String>) -> Result<Vec<Group>> {
        for (index, group_id) in group_ids.iter().enumerate() {
            if let Some(group) = self.items_data.groups.iter_mut().find(|group| group.id == *group_id)
            {
                group.sort_order = index as i32;
            }
        }
        self.persist_items()?;
        Ok(self.sorted_groups())
    }

    pub fn get_item(&self, item_id: &str) -> Option<LaunchItem> {
        self.items_data
            .items
            .iter()
            .find(|item| item.id == item_id)
            .cloned()
    }

    fn persist_items(&self) -> Result<()> {
        write_json(&self.items_path, &self.items_data)
    }

    fn persist_settings(&self) -> Result<()> {
        write_json(&self.settings_path, &self.settings)
    }

    fn persist_all(&self) -> Result<()> {
        self.persist_items()?;
        self.persist_settings()?;
        Ok(())
    }

    fn normalize(&mut self) {
        if self.settings.display_mode != "grid" && self.settings.display_mode != "list" {
            self.settings.display_mode = "grid".to_string();
        }

        self.items_data.groups.sort_by_key(|group| group.sort_order);
        for (index, group) in self.items_data.groups.iter_mut().enumerate() {
            group.sort_order = index as i32;
        }

        self.items_data.items.sort_by(|left, right| {
            let group_left = left.group_id.clone().unwrap_or_default();
            let group_right = right.group_id.clone().unwrap_or_default();
            group_left
                .cmp(&group_right)
                .then(left.sort_order.cmp(&right.sort_order))
                .then(left.name.cmp(&right.name))
        });

        let mut by_group: std::collections::BTreeMap<String, i32> = std::collections::BTreeMap::new();
        for item in &mut self.items_data.items {
            let key = item.group_id.clone().unwrap_or_default();
            let sort_order = by_group.entry(key).or_insert(0);
            item.sort_order = *sort_order;
            *sort_order += 1;
        }
    }

    fn sorted_items(&self) -> Vec<LaunchItem> {
        let mut items = self.items_data.items.clone();
        items.sort_by(|left, right| {
            let group_left = left.group_id.clone().unwrap_or_default();
            let group_right = right.group_id.clone().unwrap_or_default();
            group_left
                .cmp(&group_right)
                .then(left.sort_order.cmp(&right.sort_order))
                .then(left.name.cmp(&right.name))
        });
        items
    }

    fn sorted_groups(&self) -> Vec<Group> {
        let mut groups = self.items_data.groups.clone();
        groups.sort_by_key(|group| group.sort_order);
        groups
    }

    fn next_item_sort_order(&self, group_id: Option<&str>) -> i32 {
        self.items_data
            .items
            .iter()
            .filter(|item| item.group_id.as_deref() == group_id)
            .count() as i32
    }
}

fn read_json<T>(path: &Path) -> Result<Option<T>>
where
    T: for<'de> serde::Deserialize<'de>,
{
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    let data = serde_json::from_str(&content)
        .with_context(|| format!("failed to parse {}", path.display()))?;
    Ok(Some(data))
}

fn write_json<T>(path: &Path, value: &T) -> Result<()>
where
    T: serde::Serialize,
{
    let content = serde_json::to_string_pretty(value)?;
    fs::write(path, content).with_context(|| format!("failed to write {}", path.display()))
}

fn detect_item_kind(path: &Path) -> Option<LaunchItemKind> {
    if path.is_dir() {
        return Some(LaunchItemKind::Folder);
    }

    let extension = path.extension()?.to_string_lossy().to_lowercase();
    match extension.as_str() {
        "exe" => Some(LaunchItemKind::Exe),
        "lnk" => Some(LaunchItemKind::Link),
        _ => None,
    }
}

fn default_name_for_path(path: &Path) -> String {
    path.file_stem()
        .or_else(|| path.file_name())
        .map(|name| name.to_string_lossy().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Untitled".to_string())
}

fn default_name_for_target(kind: &LaunchItemKind, target: &str) -> String {
    match kind {
        LaunchItemKind::Url | LaunchItemKind::Command => target.to_string(),
        _ => default_name_for_path(Path::new(target)),
    }
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn unique_export_dir(destination_root: &Path) -> PathBuf {
    let base_name = format!("deskrun-export-{}", Utc::now().format("%Y%m%d-%H%M%S"));
    let mut candidate = destination_root.join(&base_name);
    let mut suffix = 1;
    while candidate.exists() {
        candidate = destination_root.join(format!("{base_name}-{suffix}"));
        suffix += 1;
    }
    candidate
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(normalize_text)
}

fn normalize_text(value: String) -> Option<String> {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn normalize_group_name(value: &str) -> Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(anyhow!("group name cannot be empty"));
    }

    Ok(trimmed.to_string())
}

fn ensure_group_name_available(groups: &[Group], name: &str, exclude_id: Option<&str>) -> Result<()> {
    let exists = groups.iter().any(|group| {
        Some(group.id.as_str()) != exclude_id && group.name.eq_ignore_ascii_case(name)
    });

    if exists {
        Err(anyhow!("group name already exists"))
    } else {
        Ok(())
    }
}

fn remap_icon_paths(items: &mut [LaunchItem], next_icons_dir: &Path) {
    for item in items {
        let Some(current_path) = item.icon_path.as_deref() else {
            continue;
        };

        let Some(file_name) = Path::new(current_path).file_name() else {
            continue;
        };

        item.icon_path = Some(next_icons_dir.join(file_name).to_string_lossy().to_string());
    }
}

fn copy_directory_contents(from: &Path, to: &Path) -> Result<()> {
    if !from.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(from)
        .with_context(|| format!("failed to read {}", from.display()))?
    {
        let entry = entry?;
        let source = entry.path();
        let destination = to.join(entry.file_name());

        if entry
            .file_type()
            .with_context(|| format!("failed to inspect {}", source.display()))?
            .is_dir()
        {
            fs::create_dir_all(&destination).with_context(|| {
                format!("failed to create directory {}", destination.display())
            })?;
            copy_directory_contents(&source, &destination)?;
        } else {
            fs::copy(&source, &destination).with_context(|| {
                format!(
                    "failed to copy {} to {}",
                    source.display(),
                    destination.display()
                )
            })?;
        }
    }

    Ok(())
}

fn clear_directory_contents(path: &Path) -> Result<()> {
    if !path.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(path)
        .with_context(|| format!("failed to read {}", path.display()))?
    {
        let entry = entry?;
        let target = entry.path();

        if entry
            .file_type()
            .with_context(|| format!("failed to inspect {}", target.display()))?
            .is_dir()
        {
            fs::remove_dir_all(&target)
                .with_context(|| format!("failed to remove {}", target.display()))?;
        } else {
            fs::remove_file(&target)
                .with_context(|| format!("failed to remove {}", target.display()))?;
        }
    }

    Ok(())
}
