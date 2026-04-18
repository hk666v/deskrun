use std::{path::Path, process::Command};

use anyhow::{anyhow, Result};

use crate::models::{LaunchItem, LaunchItemKind};

pub fn launch(item: &LaunchItem) -> Result<()> {
    match item.kind {
        LaunchItemKind::Exe => launch_executable(&item.target),
        LaunchItemKind::Link | LaunchItemKind::Folder | LaunchItemKind::Url => shell_open(&item.target),
    }
}

fn launch_executable(target: &str) -> Result<()> {
    Command::new(target)
        .spawn()
        .map(|_| ())
        .map_err(|error| anyhow!("failed to launch executable {}: {}", target, error))
}

fn shell_open(target: &str) -> Result<()> {
    if matches!(Path::new(target).extension().and_then(|ext| ext.to_str()), Some("exe")) {
        return launch_executable(target);
    }

    Command::new("cmd")
        .args(["/C", "start", "", target])
        .spawn()
        .map(|_| ())
        .map_err(|error| anyhow!("failed to open {}: {}", target, error))
}
