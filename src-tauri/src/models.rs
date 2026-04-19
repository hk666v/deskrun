use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LaunchItemKind {
    Exe,
    Link,
    Folder,
    Url,
    Command,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum IconSource {
    Auto,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchItem {
    pub id: String,
    pub name: String,
    pub kind: LaunchItemKind,
    pub target: String,
    pub command: Option<String>,
    pub note: Option<String>,
    pub fixed_args: Option<String>,
    #[serde(alias = "runtimeArgsTemplate")]
    pub runtime_args: Option<String>,
    pub working_dir: Option<String>,
    #[serde(default)]
    pub keep_open: bool,
    pub group_id: Option<String>,
    pub icon_source: IconSource,
    pub icon_path: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    pub id: String,
    pub name: String,
    pub sort_order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub hotkey: String,
    pub launch_on_startup: bool,
    pub close_on_launch: bool,
    pub theme_mode: String,
    pub window_width: u32,
    pub window_height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowSizeLimits {
    pub min_width: u32,
    pub min_height: u32,
    pub max_width: u32,
    pub max_height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigDirectoryInfo {
    pub current_path: String,
    pub default_path: String,
    pub using_custom_path: bool,
}

pub const DEFAULT_WINDOW_WIDTH: u32 = 760;
pub const DEFAULT_WINDOW_HEIGHT: u32 = 560;
pub const MIN_WINDOW_WIDTH: u32 = 760;
pub const MIN_WINDOW_HEIGHT: u32 = 560;
pub const MAX_WINDOW_WIDTH: u32 = 1400;

impl Default for Settings {
    fn default() -> Self {
        Self {
            hotkey: "Alt+Space".to_string(),
            launch_on_startup: false,
            close_on_launch: true,
            theme_mode: "system".to_string(),
            window_width: DEFAULT_WINDOW_WIDTH,
            window_height: DEFAULT_WINDOW_HEIGHT,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapData {
    pub items: Vec<LaunchItem>,
    pub groups: Vec<Group>,
    pub settings: Settings,
    pub window_size_limits: WindowSizeLimits,
    pub config_directory: ConfigDirectoryInfo,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateItemPayload {
    pub kind: LaunchItemKind,
    pub target: String,
    pub name: Option<String>,
    pub command: Option<String>,
    pub note: Option<String>,
    pub fixed_args: Option<String>,
    pub runtime_args: Option<String>,
    pub working_dir: Option<String>,
    pub keep_open: Option<bool>,
    pub group_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateItemPayload {
    pub id: String,
    pub name: Option<String>,
    pub target: Option<String>,
    pub command: Option<String>,
    pub note: Option<Option<String>>,
    pub fixed_args: Option<Option<String>>,
    pub runtime_args: Option<Option<String>>,
    pub working_dir: Option<Option<String>>,
    pub keep_open: Option<bool>,
    pub group_id: Option<Option<String>>,
    pub custom_icon_path: Option<String>,
    pub clear_custom_icon: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedItems {
    pub items: Vec<LaunchItem>,
    pub groups: Vec<Group>,
}

impl Default for PersistedItems {
    fn default() -> Self {
        Self {
            items: Vec::new(),
            groups: Vec::new(),
        }
    }
}
