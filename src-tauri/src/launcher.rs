use std::{path::Path, process::Command};

use anyhow::{anyhow, Result};

use crate::models::{LaunchItem, LaunchItemKind};

pub fn launch(item: &LaunchItem) -> Result<()> {
    match item.kind {
        LaunchItemKind::Exe => launch_executable(&item.target),
        LaunchItemKind::Link | LaunchItemKind::Folder | LaunchItemKind::Url => shell_open(&item.target),
        LaunchItemKind::Command => launch_command(
            item.command.as_deref().unwrap_or(&item.target),
            item.fixed_args.as_deref(),
            item.runtime_args.as_deref(),
            item.working_dir.as_deref(),
            item.keep_open,
        ),
    }
}

fn launch_executable(target: &str) -> Result<()> {
    if !Path::new(target).exists() {
        return Err(anyhow!("executable not found: {}", target));
    }

    Command::new(target)
        .spawn()
        .map(|_| ())
        .map_err(|error| anyhow!("failed to launch executable {}: {}", target, error))
}

fn shell_open(target: &str) -> Result<()> {
    if matches!(Path::new(target).extension().and_then(|ext| ext.to_str()), Some("exe")) {
        return launch_executable(target);
    }

    if !is_probable_url(target) && !Path::new(target).exists() {
        return Err(anyhow!("target not found: {}", target));
    }

    Command::new("cmd")
        .args(["/C", "start", "", target])
        .spawn()
        .map(|_| ())
        .map_err(|error| anyhow!("failed to open {}: {}", target, error))
}

fn launch_command(
    command: &str,
    fixed_args: Option<&str>,
    runtime_args: Option<&str>,
    working_dir: Option<&str>,
    keep_open: bool,
) -> Result<()> {
    let final_command = compose_command(command, fixed_args, runtime_args)?;
    if final_command.is_empty() {
        return Err(anyhow!("command cannot be empty"));
    }

    let mut process = Command::new("cmd.exe");
    process.args([if keep_open { "/K" } else { "/C" }, final_command.as_str()]);

    if let Some(directory) = working_dir.filter(|value| !value.trim().is_empty()) {
        process.current_dir(directory);
    }

    process
        .spawn()
        .map(|_| ())
        .map_err(|error| anyhow!("failed to launch command {}: {}", final_command, error))
}

fn compose_command(
    command: &str,
    fixed_args: Option<&str>,
    runtime_args: Option<&str>,
) -> Result<String> {
    let trimmed_command = command.trim();
    if trimmed_command.is_empty() {
        return Err(anyhow!("command cannot be empty"));
    }

    let mut segments = vec![trimmed_command.to_string()];

    if let Some(fixed_args) = fixed_args.map(str::trim).filter(|value| !value.is_empty()) {
        segments.push(fixed_args.to_string());
    }

    if let Some(runtime_args) = runtime_args.map(str::trim).filter(|value| !value.is_empty()) {
        segments.push(runtime_args.to_string());
    }

    Ok(segments.join(" "))
}

fn is_probable_url(target: &str) -> bool {
    let value = target.trim().to_ascii_lowercase();
    value.starts_with("http://")
        || value.starts_with("https://")
        || value.starts_with("mailto:")
        || value.starts_with("tel:")
}
