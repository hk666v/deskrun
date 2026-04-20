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
    storage::{item_target_key, StorageState},
};

pub fn scan(
    storage: &StorageState,
    options: &DiscoveryScanOptions,
) -> Result<Vec<DiscoveryCandidate>> {
    let existing_targets: HashSet<String> = storage
        .all_items_for_discovery()
        .iter()
        .map(|item| item_target_key(&item.target))
        .collect();
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
        env_path("APPDATA")
            .map(|path| path.join(r"Microsoft\Windows\Start Menu\Programs")),
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
            let Some(target) = resolve_registry_target(
                display_icon.as_deref(),
                install_location.as_deref(),
                &name,
            )? else {
                continue;
            };

            if should_exclude_candidate(&name, &target) {
                continue;
            }

            let confidence = if display_icon.is_some() { "medium" } else { "low" };
            let kind = kind_for_discovery_path(&target).unwrap_or(LaunchItemKind::Exe);
            candidates.push(build_candidate(
                name,
                kind,
                target.to_string_lossy().to_string(),
                "registry",
                confidence,
                existing_targets,
            ));
        }
    }

    Ok(candidates)
}

fn resolve_registry_target(
    display_icon: Option<&str>,
    install_location: Option<&str>,
    display_name: &str,
) -> Result<Option<PathBuf>> {
    if let Some(path) = display_icon.and_then(parse_display_icon_path) {
        if path.exists() && kind_for_discovery_path(&path).is_some() {
            return Ok(Some(path));
        }
    }

    let Some(install_location) = install_location.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let install_path = PathBuf::from(install_location);
    if !install_path.exists() {
        return Ok(None);
    }

    let normalized_display_name = normalize_candidate_text(display_name);
    let mut fallback: Option<PathBuf> = None;
    for entry in WalkDir::new(&install_path)
        .max_depth(2)
        .into_iter()
        .filter_map(std::result::Result::ok)
        .filter(|entry| entry.file_type().is_file())
    {
        let path = entry.path();
        if kind_for_discovery_path(path) != Some(LaunchItemKind::Exe) {
            continue;
        }

        let stem = path
            .file_stem()
            .map(|value| normalize_candidate_text(&value.to_string_lossy()))
            .unwrap_or_default();
        if stem == normalized_display_name {
            return Ok(Some(path.to_path_buf()));
        }

        if fallback.is_none() && !should_exclude_candidate(display_name, path) {
            fallback = Some(path.to_path_buf());
        }
    }

    Ok(fallback)
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
    (source_rank(&candidate.source), confidence_rank(&candidate.confidence))
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

fn should_exclude_candidate(name: &str, path: &Path) -> bool {
    let haystack = format!(
        "{} {}",
        normalize_candidate_text(name),
        normalize_candidate_text(&path.to_string_lossy())
    );
    const BLOCKED: [&str; 10] = [
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
    BLOCKED.iter().any(|keyword| haystack.contains(keyword))
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
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}
