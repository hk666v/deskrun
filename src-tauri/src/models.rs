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
    /// Launch through the shell's `runas` verb so Windows prompts for elevation.
    /// Several launcher targets (packet capture, proxy settings, raw sockets)
    /// simply do not work without it.
    #[serde(default)]
    pub run_as_admin: bool,
    #[serde(default)]
    pub is_favorite: bool,
    #[serde(default)]
    pub launch_count: u32,
    #[serde(default)]
    pub last_launched_at: Option<String>,
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
    /// The group this one sits inside, or `None` for the top level. Groups are
    /// as deep as the user makes them; nothing here assumes a depth.
    #[serde(default)]
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub hotkey: String,
    pub launch_on_startup: bool,
    pub close_on_launch: bool,
    pub theme_mode: String,
    pub display_mode: String,
    pub window_width: u32,
    pub window_height: u32,
    pub window_x: Option<i32>,
    pub window_y: Option<i32>,
    /// Open on whichever monitor the pointer is on, centred, instead of reusing
    /// the remembered position. On a single monitor the two are the same.
    pub follow_cursor_monitor: bool,
    /// Interface scale, applied as a webview zoom. 1.0 is the designed size.
    pub ui_scale: f64,
    /// Whether the group sidebar is out of the way. Remembered because it is a
    /// decision about the window, and a launcher is opened many times a day.
    pub sidebar_collapsed: bool,
    /// The two keys the window itself answers to, written the way the global
    /// hotkey is: bringing the caret back to the search field, and showing or
    /// hiding the group column.
    pub focus_search_key: String,
    pub toggle_sidebar_key: String,
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

/// The interface setting offers 90% to 130%. The range is a little wider than
/// the offered steps so a hand-edited config is honoured rather than snapped to
/// a preset, and anything outside it — including an infinity or a NaN that
/// survived a bad file — falls back to the designed size instead.
pub const MIN_UI_SCALE: f64 = 0.85;
pub const MAX_UI_SCALE: f64 = 1.4;

/// The keys the window answers to out of the box. Both are in-app shortcuts
/// rather than global ones: they only mean anything while the launcher has the
/// keyboard.
pub const DEFAULT_FOCUS_SEARCH_KEY: &str = "Ctrl+S";
pub const DEFAULT_TOGGLE_SIDEBAR_KEY: &str = "Ctrl+O";

/// A shortcut the launcher can bind: at least one modifier and then a key.
///
/// A bare key is not one — binding "s" would eat every s typed into the search
/// field — and neither is Shift alone, which is still just typing. Anything that
/// does not parse falls back to the default rather than leaving the window with
/// a shortcut it can never match.
pub fn normalized_shortcut(value: &str, fallback: &str) -> String {
    let parts: Vec<&str> = value
        .split('+')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect();
    if parts.len() < 2 {
        return fallback.to_string();
    }

    let is_modifier = |part: &str| {
        matches!(
            part.to_ascii_lowercase().as_str(),
            "ctrl" | "control" | "alt" | "shift" | "meta" | "cmd" | "super" | "win"
        )
    };
    let modifiers = &parts[..parts.len() - 1];
    let key = parts[parts.len() - 1];
    let carries_ctrl_or_alt = modifiers.iter().any(|part| {
        matches!(
            part.to_ascii_lowercase().as_str(),
            "ctrl" | "control" | "alt"
        )
    });

    if !carries_ctrl_or_alt || is_modifier(key) || modifiers.iter().any(|part| !is_modifier(part)) {
        return fallback.to_string();
    }

    parts.join("+")
}

pub fn normalized_ui_scale(scale: f64) -> f64 {
    if !scale.is_finite() {
        return 1.0;
    }

    scale.clamp(MIN_UI_SCALE, MAX_UI_SCALE)
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            hotkey: "Alt+Space".to_string(),
            launch_on_startup: false,
            close_on_launch: true,
            theme_mode: "system".to_string(),
            display_mode: "grid".to_string(),
            window_width: DEFAULT_WINDOW_WIDTH,
            window_height: DEFAULT_WINDOW_HEIGHT,
            window_x: None,
            window_y: None,
            follow_cursor_monitor: true,
            ui_scale: 1.0,
            sidebar_collapsed: false,
            focus_search_key: DEFAULT_FOCUS_SEARCH_KEY.to_string(),
            toggle_sidebar_key: DEFAULT_TOGGLE_SIDEBAR_KEY.to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapData {
    pub items: Vec<LaunchItem>,
    pub groups: Vec<Group>,
    pub settings: Settings,
    pub config_directory: ConfigDirectoryInfo,
    /// A non-fatal problem from startup for the UI to surface, such as the global
    /// hotkey being unavailable. The app runs; the user just needs to know.
    pub startup_warning: Option<String>,
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
    pub run_as_admin: Option<bool>,
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
    pub run_as_admin: Option<bool>,
    pub group_id: Option<Option<String>>,
    pub custom_icon_path: Option<String>,
    pub clear_custom_icon: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DiscoveryScanOptions {
    pub start_menu: bool,
    pub desktop: bool,
    pub registry: bool,
}

impl Default for DiscoveryScanOptions {
    fn default() -> Self {
        Self {
            start_menu: true,
            desktop: true,
            registry: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryCandidate {
    pub id: String,
    pub name: String,
    pub kind: LaunchItemKind,
    pub target: String,
    pub source: String,
    pub confidence: String,
    pub already_exists: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryCandidateImport {
    pub name: String,
    pub kind: LaunchItemKind,
    pub target: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedItems {
    pub items: Vec<LaunchItem>,
    pub groups: Vec<Group>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_scale_inside_the_range_is_left_alone() {
        assert_eq!(normalized_ui_scale(1.15), 1.15);
    }

    #[test]
    fn a_scale_outside_the_range_is_pulled_back_in() {
        assert_eq!(normalized_ui_scale(0.1), MIN_UI_SCALE);
        assert_eq!(normalized_ui_scale(4.0), MAX_UI_SCALE);
    }

    #[test]
    fn a_scale_that_is_not_a_number_falls_back_to_the_designed_size() {
        assert_eq!(normalized_ui_scale(f64::NAN), 1.0);
        assert_eq!(normalized_ui_scale(f64::INFINITY), 1.0);
        assert_eq!(normalized_ui_scale(f64::NEG_INFINITY), 1.0);
    }

    #[test]
    fn settings_written_before_the_scale_existed_load_at_the_designed_size() {
        // `#[serde(default)]` on the struct is what makes an older settings.json
        // load at all; this pins the value it lands on.
        let settings: Settings =
            serde_json::from_str(r#"{"hotkey":"Alt+Space","windowWidth":760}"#).unwrap();
        assert_eq!(settings.ui_scale, 1.0);
    }

    #[test]
    fn a_modifier_and_a_key_is_a_shortcut() {
        assert_eq!(normalized_shortcut("Ctrl+O", "Ctrl+S"), "Ctrl+O");
        assert_eq!(normalized_shortcut("Alt+ Space ", "Ctrl+S"), "Alt+Space");
        assert_eq!(
            normalized_shortcut("Shift+Ctrl+K", "Ctrl+S"),
            "Shift+Ctrl+K"
        );
    }

    #[test]
    fn a_bare_key_is_not_a_shortcut() {
        // It would eat every "s" typed into the search field, and Shift alone is
        // still just typing.
        for value in ["s", "Shift+S", "Ctrl", "Ctrl+Shift", ""] {
            assert_eq!(normalized_shortcut(value, "Ctrl+S"), "Ctrl+S");
        }
    }

    #[test]
    fn a_shortcut_with_an_unknown_part_is_not_one() {
        assert_eq!(normalized_shortcut("Ctrl+Banana+S", "Ctrl+O"), "Ctrl+O");
    }
}
