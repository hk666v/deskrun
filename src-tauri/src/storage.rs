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
        BootstrapData, CreateItemPayload, Group, IconSource, LaunchItem, LaunchItemKind,
        PersistedItems, Settings, UpdateItemPayload, MAX_WINDOW_HEIGHT, MAX_WINDOW_WIDTH,
        MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH,
    },
};

pub struct StorageState {
    pub icons_dir: PathBuf,
    items_path: PathBuf,
    settings_path: PathBuf,
    items_data: PersistedItems,
    settings: Settings,
}

impl StorageState {
    pub fn load(app: &AppHandle) -> Result<Self> {
        let data_dir = app
            .path()
            .app_data_dir()
            .context("failed to resolve app data directory")?;
        let icons_dir = data_dir.join("icons");
        let items_path = data_dir.join("items.json");
        let settings_path = data_dir.join("settings.json");

        fs::create_dir_all(&icons_dir).context("failed to create icons directory")?;

        let items_data = read_json::<PersistedItems>(&items_path)?.unwrap_or_default();
        let settings = read_json::<Settings>(&settings_path)?.unwrap_or_default();

        let mut storage = Self {
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

    pub fn bootstrap(&self) -> BootstrapData {
        BootstrapData {
            items: self.sorted_items(),
            groups: self.sorted_groups(),
            settings: self.settings.clone(),
        }
    }

    pub fn settings(&self) -> &Settings {
        &self.settings
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

    pub fn set_window_size(&mut self, width: u32, height: u32) -> Result<()> {
        self.settings.window_width = width.clamp(MIN_WINDOW_WIDTH, MAX_WINDOW_WIDTH);
        self.settings.window_height = height.clamp(MIN_WINDOW_HEIGHT, MAX_WINDOW_HEIGHT);
        self.persist_settings()
    }

    pub fn create_item(&mut self, payload: CreateItemPayload) -> Result<LaunchItem> {
        let now = now_iso();
        let id = Uuid::new_v4().to_string();
        let mut item = LaunchItem {
            id: id.clone(),
            name: payload
                .name
                .unwrap_or_else(|| default_name_for_target(&payload.kind, &payload.target)),
            kind: payload.kind,
            target: payload.target,
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
        let group = Group {
            id: Uuid::new_v4().to_string(),
            name,
            sort_order: self.items_data.groups.len() as i32,
        };
        self.items_data.groups.push(group.clone());
        self.persist_items()?;
        Ok(group)
    }

    pub fn rename_group(&mut self, group_id: &str, name: String) -> Result<Vec<Group>> {
        let group = self
            .items_data
            .groups
            .iter_mut()
            .find(|group| group.id == group_id)
            .ok_or_else(|| anyhow!("group not found"))?;
        group.name = name;
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
        LaunchItemKind::Url => target.to_string(),
        _ => default_name_for_path(Path::new(target)),
    }
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}
