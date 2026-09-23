use std::{
    collections::{HashMap, HashSet},
    env,
    path::{Path, PathBuf},
};

use anyhow::Result;
use sha2::{Digest, Sha256};
use walkdir::WalkDir;
use winreg::{
    enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
    RegKey,
};

use crate::{
    models::{DiscoveryCandidate, DiscoveryScanOptions, LaunchItemKind},
    storage::item_target_key,
};

/// Ceiling on how many files a single `InstallLocation` walk will look at.
const MAX_INSTALL_TREE_ENTRIES: usize = 2_000;

/// How a registry entry's target was arrived at.
///
/// This is what `confidence` has to reflect. Deriving it from "was `DisplayIcon`
/// present" was wrong: a `DisplayIcon` left behind by an old version points at a
/// file that no longer exists, the lookup falls through to the guess below, and
/// the candidate still came out labelled `medium`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RegistryTargetMatch {
    /// `DisplayIcon` named a file that exists — the vendor declared this path.
    Declared,
    /// An executable under `InstallLocation` whose file name matches the
    /// display name.
    NameMatch,
    /// An executable under `InstallLocation` chosen with no name evidence at all.
    Guessed,
}

impl RegistryTargetMatch {
    fn confidence(self) -> &'static str {
        match self {
            Self::Declared | Self::NameMatch => "medium",
            Self::Guessed => "low",
        }
    }
}

/// Walks the registry and the filesystem, so callers must keep it off the main
/// thread. Takes the already-imported targets rather than the whole storage
/// state, so the launcher's lock can be released before the scan starts.
pub fn scan(
    existing_targets: &HashSet<String>,
    options: &DiscoveryScanOptions,
) -> Result<Vec<DiscoveryCandidate>> {
    let existing_targets = existing_targets.clone();
    let mut by_target: HashMap<String, DiscoveryCandidate> = HashMap::new();

    if options.start_menu {
        for candidate in scan_start_menu(&existing_targets)? {
            merge_candidate(&mut by_target, candidate);
        }
    }

    if options.desktop {
        for candidate in scan_desktop(&existing_targets)? {
            merge_candidate(&mut by_target, candidate);
        }
    }

    if options.registry {
        for candidate in scan_registry(&existing_targets)? {
            merge_candidate(&mut by_target, candidate);
        }
    }

    let mut results: Vec<_> = by_target.into_values().collect();
    results.sort_by(|left, right| {
        left.already_exists
            .cmp(&right.already_exists)
            .then_with(|| candidate_rank(right).cmp(&candidate_rank(left)))
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(results)
}

fn scan_start_menu(existing_targets: &HashSet<String>) -> Result<Vec<DiscoveryCandidate>> {
    let mut candidates = Vec::new();
    for root in [
        env_path("APPDATA").map(|path| path.join(r"Microsoft\Windows\Start Menu\Programs")),
        env_path("PROGRAMDATA").map(|path| path.join(r"Microsoft\Windows\Start Menu\Programs")),
    ]
    .into_iter()
    .flatten()
    {
        candidates.extend(scan_known_directory(
            &root,
            "start_menu",
            "high",
            existing_targets,
        )?);
    }

    Ok(candidates)
}

fn scan_desktop(existing_targets: &HashSet<String>) -> Result<Vec<DiscoveryCandidate>> {
    let mut candidates = Vec::new();
    for root in [
        desktop_directory(),
        env_path("USERPROFILE").map(|path| path.join("Desktop")),
        env_path("PUBLIC").map(|path| path.join("Desktop")),
    ]
    .into_iter()
    .flatten()
    {
        candidates.extend(scan_known_directory(
            &root,
            "desktop",
            "high",
            existing_targets,
        )?);
    }

    Ok(candidates)
}

fn scan_known_directory(
    root: &Path,
    source: &str,
    confidence: &str,
    existing_targets: &HashSet<String>,
) -> Result<Vec<DiscoveryCandidate>> {
    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut candidates = Vec::new();
    for entry in WalkDir::new(root)
        .into_iter()
        .filter_map(std::result::Result::ok)
        .filter(|entry| entry.file_type().is_file())
    {
        let path = entry.path();
        let Some(kind) = kind_for_discovery_path(path) else {
            continue;
        };

        let name = path
            .file_stem()
            .or_else(|| path.file_name())
            .map(|value| value.to_string_lossy().to_string())
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "Untitled".to_string());
        if should_exclude_candidate(&name, path) {
            continue;
        }

        candidates.push(build_candidate(
            name,
            kind,
            path.to_string_lossy().to_string(),
            source,
            confidence,
            existing_targets,
        ));
    }

    Ok(candidates)
}

fn scan_registry(existing_targets: &HashSet<String>) -> Result<Vec<DiscoveryCandidate>> {
    let mut candidates = Vec::new();

    for (root, subkey) in [
        (
            RegKey::predef(HKEY_CURRENT_USER),
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
        (
            RegKey::predef(HKEY_LOCAL_MACHINE),
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
        (
            RegKey::predef(HKEY_CURRENT_USER),
            r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
        (
            RegKey::predef(HKEY_LOCAL_MACHINE),
            r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
    ] {
        let Ok(uninstall) = root.open_subkey(subkey) else {
            continue;
        };

        for key_name in uninstall.enum_keys().flatten() {
            let Ok(app_key) = uninstall.open_subkey(&key_name) else {
                continue;
            };

            let Some(name) = read_reg_string(&app_key, "DisplayName") else {
                continue;
            };

            let display_icon = read_reg_string(&app_key, "DisplayIcon");
            let install_location = read_reg_string(&app_key, "InstallLocation");
            let Some((target, matched)) = resolve_registry_target(
                display_icon.as_deref(),
                install_location.as_deref(),
                &name,
            )?
            else {
                continue;
            };

            if should_exclude_candidate(&name, &target) {
                continue;
            }

            let kind = kind_for_discovery_path(&target).unwrap_or(LaunchItemKind::Exe);
            candidates.push(build_candidate(
                name,
                kind,
                target.to_string_lossy().to_string(),
                "registry",
                matched.confidence(),
                existing_targets,
            ));
        }
    }

    Ok(candidates)
}

/// Returns the executable to use for a registry entry together with how it was
/// found; the caller turns that into a confidence level.
fn resolve_registry_target(
    display_icon: Option<&str>,
    install_location: Option<&str>,
    display_name: &str,
) -> Result<Option<(PathBuf, RegistryTargetMatch)>> {
    if let Some(path) = display_icon.and_then(parse_display_icon_path) {
        if path.exists() && kind_for_discovery_path(&path).is_some() {
            return Ok(Some((path, RegistryTargetMatch::Declared)));
        }
    }

    let Some(install_location) = install_location
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };
    let install_path = PathBuf::from(install_location);
    if !install_path.exists() {
        return Ok(None);
    }

    let normalized_display_name = normalize_candidate_text(display_name);
    let mut fallback: Option<PathBuf> = None;
    let mut examined = 0usize;

    for entry in WalkDir::new(&install_path)
        .max_depth(2)
        .into_iter()
        .filter_map(std::result::Result::ok)
        .filter(|entry| entry.file_type().is_file())
    {
        // This walk is the most expensive step in a scan and runs once per entry
        // with no usable `DisplayIcon`. Bound it so one pathological install
        // tree cannot dominate the whole scan.
        examined += 1;
        if examined > MAX_INSTALL_TREE_ENTRIES {
            break;
        }

        let path = entry.path();
        if kind_for_discovery_path(path) != Some(LaunchItemKind::Exe) {
            continue;
        }

        let stem = path
            .file_stem()
            .map(|value| normalize_candidate_text(&value.to_string_lossy()))
            .unwrap_or_default();
        if stem == normalized_display_name {
            return Ok(Some((path.to_path_buf(), RegistryTargetMatch::NameMatch)));
        }

        if fallback.is_none() && !should_exclude_candidate(display_name, path) {
            fallback = Some(path.to_path_buf());
        }
    }

    Ok(fallback.map(|path| (path, RegistryTargetMatch::Guessed)))
}

fn parse_display_icon_path(value: &str) -> Option<PathBuf> {
    let trimmed = value.trim().trim_matches('"');
    let raw_path = trimmed.split(',').next()?.trim().trim_matches('"');
    if raw_path.is_empty() {
        None
    } else {
        Some(PathBuf::from(raw_path))
    }
}

fn build_candidate(
    name: String,
    kind: LaunchItemKind,
    target: String,
    source: &str,
    confidence: &str,
    existing_targets: &HashSet<String>,
) -> DiscoveryCandidate {
    let target_key = item_target_key(&target);
    DiscoveryCandidate {
        id: candidate_id(source, &target_key),
        name,
        kind,
        target,
        source: source.to_string(),
        confidence: confidence.to_string(),
        already_exists: existing_targets.contains(&target_key),
    }
}

fn merge_candidate(
    by_target: &mut HashMap<String, DiscoveryCandidate>,
    candidate: DiscoveryCandidate,
) {
    let key = item_target_key(&candidate.target);
    match by_target.get(&key) {
        Some(existing) if candidate_rank(existing) >= candidate_rank(&candidate) => {}
        _ => {
            by_target.insert(key, candidate);
        }
    }
}

fn candidate_rank(candidate: &DiscoveryCandidate) -> (u8, u8) {
    (
        source_rank(&candidate.source),
        confidence_rank(&candidate.confidence),
    )
}

fn source_rank(source: &str) -> u8 {
    match source {
        "start_menu" => 3,
        "desktop" => 2,
        "registry" => 1,
        _ => 0,
    }
}

fn confidence_rank(confidence: &str) -> u8 {
    match confidence {
        "high" => 3,
        "medium" => 2,
        "low" => 1,
        _ => 0,
    }
}

fn kind_for_discovery_path(path: &Path) -> Option<LaunchItemKind> {
    match path
        .extension()
        .map(|extension| extension.to_string_lossy().to_ascii_lowercase())
        .as_deref()
    {
        Some("exe") => Some(LaunchItemKind::Exe),
        Some("lnk") => Some(LaunchItemKind::Link),
        _ => None,
    }
}

/// Resolves the Desktop folder through the shell instead of assuming
/// `%USERPROFILE%\Desktop`. Windows lets that folder be redirected — OneDrive's
/// "Back up your folders" does exactly this — and the hardcoded path then scans
/// an empty directory and finds nothing.
fn desktop_directory() -> Option<PathBuf> {
    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders")
        .ok()?;
    let path = PathBuf::from(read_reg_string(&key, "Desktop")?);
    path.is_dir().then_some(path)
}

/// Decides whether a discovered entry is an app or one of the maintenance
/// executables that ship alongside it. This used to be a substring test over the
/// whole path, which both over-matched — anything under a folder named
/// `ServiceHub` was dropped — and under-matched: `unins000.exe` does not contain
/// "uninstall", so it survived, and importing it means a click can uninstall the
/// user's program.
fn should_exclude_candidate(name: &str, path: &Path) -> bool {
    const BLOCKED_WORDS: [&str; 10] = [
        "uninstall",
        "setup",
        "update",
        "updater",
        "helper",
        "crash",
        "report",
        "service",
        "daemon",
        "redistributable",
    ];

    let file_stem = path
        .file_stem()
        .map(|stem| normalize_candidate_text(&stem.to_string_lossy()))
        .unwrap_or_default();

    let stem_words = split_words(&file_stem);
    if stem_words
        .iter()
        .any(|word| *word == "unins" || word.starts_with("unins0"))
    {
        return true;
    }

    // Only the executable's own name is matched against the path, and the
    // display name is matched separately, so a directory called `ServiceHub`
    // no longer disqualifies everything inside it.
    stem_words
        .iter()
        .chain(split_words(&normalize_candidate_text(name)).iter())
        .any(|word| BLOCKED_WORDS.contains(word))
}

fn split_words(value: &str) -> Vec<&str> {
    value
        .split(|character: char| !character.is_ascii_alphanumeric())
        .filter(|word| !word.is_empty())
        .collect()
}

fn normalize_candidate_text(value: &str) -> String {
    value.trim().replace('_', " ").to_ascii_lowercase()
}

fn candidate_id(source: &str, target_key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(source.as_bytes());
    hasher.update(b":");
    hasher.update(target_key.as_bytes());
    format!("{:x}", hasher.finalize())[..16].to_string()
}

fn env_path(name: &str) -> Option<PathBuf> {
    env::var_os(name).map(PathBuf::from)
}

fn read_reg_string(key: &RegKey, name: &str) -> Option<String> {
    key.get_value::<String, _>(name)
        .ok()
        .map(|value| expand_environment_variables(value.trim()))
        .filter(|value| !value.is_empty())
}

/// Expands `%VAR%` references. `DisplayIcon` and `InstallLocation` are commonly
/// stored as `REG_EXPAND_SZ`, and winreg hands those values back verbatim — so
/// `%ProgramFiles%\Foo\foo.exe` was treated as a literal path, failed the
/// existence check, and quietly dropped the app from the scan results.
fn expand_environment_variables(value: &str) -> String {
    if !value.contains('%') {
        return value.to_string();
    }

    let mut expanded = String::with_capacity(value.len());
    let mut rest = value;

    while let Some(start) = rest.find('%') {
        expanded.push_str(&rest[..start]);
        let after = &rest[start + 1..];

        let Some(end) = after.find('%') else {
            expanded.push('%');
            rest = after;
            break;
        };

        let name = &after[..end];
        match env::var(name) {
            Ok(replacement) if !name.is_empty() => expanded.push_str(&replacement),
            // An unknown or empty name is kept verbatim rather than dropped.
            _ => {
                expanded.push('%');
                expanded.push_str(name);
                expanded.push('%');
            }
        }

        rest = &after[end + 1..];
    }

    expanded.push_str(rest);
    expanded
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// A unique directory per call: the tests run in parallel, so a shared path
    /// would have them deleting each other's fixtures.
    fn scratch_dir(label: &str) -> PathBuf {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("deskrun-discovery-{label}-{unique}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn display_icon_path_strips_quotes_and_the_resource_index() {
        assert_eq!(
            parse_display_icon_path("\"C:\\Apps\\Foo\\foo.exe\",0"),
            Some(PathBuf::from("C:\\Apps\\Foo\\foo.exe"))
        );
        assert_eq!(
            parse_display_icon_path("C:\\Apps\\Foo\\foo.exe"),
            Some(PathBuf::from("C:\\Apps\\Foo\\foo.exe"))
        );
        assert_eq!(parse_display_icon_path("  "), None);
        assert_eq!(parse_display_icon_path(",0"), None);
    }

    #[test]
    fn expand_environment_variables_replaces_known_names() {
        // `DISKRUN_TEST_ROOT` is set for the duration of this test only.
        env::set_var("DISKRUN_TEST_ROOT", "C:\\Root");
        assert_eq!(
            expand_environment_variables("%DISKRUN_TEST_ROOT%\\App\\app.exe"),
            "C:\\Root\\App\\app.exe"
        );
    }

    #[test]
    fn expand_environment_variables_leaves_unknown_names_alone() {
        assert_eq!(
            expand_environment_variables("%DISKRUN_NOT_SET_ANYWHERE%\\app.exe"),
            "%DISKRUN_NOT_SET_ANYWHERE%\\app.exe"
        );
        assert_eq!(
            expand_environment_variables("no percent signs"),
            "no percent signs"
        );
        assert_eq!(expand_environment_variables("trailing %"), "trailing %");
    }

    /// `DisplayIcon` commonly points at `%ProgramFiles%\...`. Reading it without
    /// expansion made the path look nonexistent and dropped the app from the
    /// scan results entirely.
    #[test]
    fn registry_paths_that_use_variables_still_resolve() {
        // A distinct name from the test above: tests run in parallel, and two of
        // them racing on one environment variable would flake.
        env::set_var("DISKRUN_TEST_ICON_ROOT", "C:\\Root");
        let parsed = parse_display_icon_path("%DISKRUN_TEST_ICON_ROOT%\\Foo\\foo.exe,0").unwrap();
        assert_eq!(
            expand_environment_variables(&parsed.to_string_lossy()),
            "C:\\Root\\Foo\\foo.exe"
        );
    }

    #[test]
    fn uninstallers_are_excluded_even_when_they_never_say_uninstall() {
        // `unins000.exe` is Inno Setup's uninstaller; importing it would put a
        // one-click uninstall button in the launcher.
        assert!(should_exclude_candidate(
            "Foo",
            Path::new("C:\\Apps\\Foo\\unins000.exe")
        ));
        assert!(should_exclude_candidate(
            "Foo",
            Path::new("C:\\Apps\\Foo\\uninstall.exe")
        ));
        assert!(should_exclude_candidate(
            "Foo",
            Path::new("C:\\Apps\\Foo\\setup.exe")
        ));
    }

    /// The old check substring-matched the entire path, so anything living under
    /// a folder with a blocked word in its name was silently dropped.
    #[test]
    fn a_blocked_word_in_a_parent_folder_does_not_disqualify_the_app() {
        assert!(!should_exclude_candidate(
            "Acme Editor",
            Path::new("C:\\Users\\me\\AppData\\Local\\Programs\\ServiceHub\\acme.exe")
        ));
        assert!(!should_exclude_candidate(
            "GHelper",
            Path::new("C:\\Apps\\GHelper\\ghelper.exe")
        ));
    }

    #[test]
    fn a_blocked_word_in_the_display_name_still_disqualifies() {
        assert!(should_exclude_candidate(
            "Foo Updater",
            Path::new("C:\\Apps\\Foo\\foo.exe")
        ));
    }

    #[test]
    fn confidence_levels_never_upgrade_a_guess() {
        assert_eq!(RegistryTargetMatch::Declared.confidence(), "medium");
        assert_eq!(RegistryTargetMatch::NameMatch.confidence(), "medium");
        assert_eq!(RegistryTargetMatch::Guessed.confidence(), "low");
    }

    #[test]
    fn a_declared_display_icon_is_believed() {
        let dir = scratch_dir("declared");
        let exe = dir.join("app.exe");
        fs::write(&exe, b"").unwrap();

        let matched = resolve_registry_target(Some(&exe.to_string_lossy()), None, "Some App")
            .unwrap()
            .map(|(_, matched)| matched);
        assert_eq!(matched, Some(RegistryTargetMatch::Declared));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_matching_name_under_the_install_folder_counts_as_a_name_match() {
        let dir = scratch_dir("name-match");
        fs::write(dir.join("My Tool.exe"), b"").unwrap();

        let matched = resolve_registry_target(None, Some(&dir.to_string_lossy()), "My Tool")
            .unwrap()
            .map(|(_, matched)| matched);
        assert_eq!(matched, Some(RegistryTargetMatch::NameMatch));

        let _ = fs::remove_dir_all(&dir);
    }

    /// The case that used to come out as `medium`: a `DisplayIcon` left behind by
    /// an older version points at a file that is gone, so the lookup falls
    /// through to the folder walk and picks something with no evidence at all.
    #[test]
    fn a_stale_display_icon_falls_through_to_a_guess() {
        let dir = scratch_dir("guessed");
        fs::write(dir.join("something-else.exe"), b"").unwrap();
        let gone = dir.join("gone.exe");

        let matched = resolve_registry_target(
            Some(&gone.to_string_lossy()),
            Some(&dir.to_string_lossy()),
            "Some App",
        )
        .unwrap()
        .map(|(_, matched)| matched);

        assert_eq!(matched, Some(RegistryTargetMatch::Guessed));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn nothing_to_go_on_yields_no_candidate() {
        assert_eq!(
            resolve_registry_target(None, None, "Some App").unwrap(),
            None
        );
    }
}
