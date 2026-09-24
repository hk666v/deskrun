use std::{path::Path, process::Command};

use anyhow::{anyhow, Result};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::models::{LaunchItem, LaunchItemKind};

/// Whether an item's target is no longer on disk.
///
/// Only the kinds that name a path can answer this. A URL or a command has
/// nothing to check and is never reported as gone: when one of those fails to
/// launch, that is a real failure rather than an invitation to delete the item.
pub fn target_is_gone(kind: &LaunchItemKind, target: &str) -> bool {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return true;
    }

    match kind {
        LaunchItemKind::Exe | LaunchItemKind::Link | LaunchItemKind::Folder => {
            !Path::new(trimmed).exists()
        }
        LaunchItemKind::Url | LaunchItemKind::Command => false,
    }
}

pub fn launch(app: &AppHandle, item: &LaunchItem, force_admin: bool) -> Result<()> {
    let elevate = force_admin || item.run_as_admin;

    match item.kind {
        LaunchItemKind::Exe => {
            if elevate {
                elevate_target(&item.target, None, item.working_dir.as_deref())
            } else {
                launch_executable(&item.target)
            }
        }
        // Elevating a browser is meaningless, so `run_as_admin` is ignored here.
        LaunchItemKind::Url => shell_open(app, &item.target),
        LaunchItemKind::Link | LaunchItemKind::Folder => {
            if elevate {
                elevate_target(&item.target, None, item.working_dir.as_deref())
            } else {
                shell_open(app, &item.target)
            }
        }
        LaunchItemKind::Command => launch_command(
            item.command.as_deref().unwrap_or(&item.target),
            item.fixed_args.as_deref(),
            item.runtime_args.as_deref(),
            item.working_dir.as_deref(),
            item.keep_open,
            elevate,
        ),
    }
}

fn launch_executable(target: &str) -> Result<()> {
    let trimmed = target.trim();
    if !Path::new(trimmed).exists() {
        return Err(anyhow!("executable not found: {trimmed}"));
    }

    Command::new(trimmed)
        .spawn()
        .map(|_| ())
        .map_err(|error| anyhow!("failed to launch executable {trimmed}: {error}"))
}

/// Hands the target to the shell directly instead of routing it through
/// `cmd /C start`. The cmd detour re-parsed the target as a command line, so a
/// `&` in a URL split it — `?q=a&b=c` opened the wrong page — and made any
/// stored target an arbitrary-command-execution vector.
fn shell_open(app: &AppHandle, target: &str) -> Result<()> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err(anyhow!("target is empty"));
    }

    let is_executable = Path::new(trimmed)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"));
    if is_executable {
        return launch_executable(trimmed);
    }

    let is_url = is_probable_url(trimmed);
    if !is_url && !Path::new(trimmed).exists() {
        return Err(anyhow!("target not found: {trimmed}"));
    }

    let opened = if is_url {
        app.opener().open_url(trimmed, None::<&str>)
    } else {
        app.opener().open_path(trimmed, None::<&str>)
    };

    opened.map_err(|error| anyhow!("failed to open {trimmed}: {error}"))
}

fn launch_command(
    command: &str,
    fixed_args: Option<&str>,
    runtime_args: Option<&str>,
    working_dir: Option<&str>,
    keep_open: bool,
    elevate: bool,
) -> Result<()> {
    let final_command = compose_command(command, fixed_args, runtime_args)?;
    if final_command.is_empty() {
        return Err(anyhow!("command cannot be empty"));
    }

    let switch = if keep_open { "/K" } else { "/C" };
    let line = format!("{switch} {final_command}");

    if elevate {
        // Elevation is only available through the shell, which also means cmd
        // receives the line verbatim rather than through std's quoting.
        return elevate_target("cmd.exe", Some(&line), working_dir);
    }

    let mut process = Command::new("cmd.exe");
    append_command_line(&mut process, &line);

    if let Some(directory) = working_dir.filter(|value| !value.trim().is_empty()) {
        process.current_dir(directory);
    }

    process
        .spawn()
        .map(|_| ())
        .map_err(|error| anyhow!("failed to launch command {final_command}: {error}"))
}

/// Launches through the shell's `runas` verb, which is what raises the UAC
/// prompt. There is no other way to elevate a process that already exists.
#[cfg(target_os = "windows")]
fn elevate_target(target: &str, params: Option<&str>, working_dir: Option<&str>) -> Result<()> {
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let operation = HSTRING::from("runas");
    let file = HSTRING::from(target);
    let parameters = params.map(HSTRING::from);
    let directory = working_dir
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(HSTRING::from);

    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(operation.as_ptr()),
            PCWSTR(file.as_ptr()),
            parameters
                .as_ref()
                .map_or(PCWSTR::null(), |value| PCWSTR(value.as_ptr())),
            directory
                .as_ref()
                .map_or(PCWSTR::null(), |value| PCWSTR(value.as_ptr())),
            SW_SHOWNORMAL,
        )
    };

    // Values up to and including 32 are error codes, not a real instance handle.
    let code = result.0 as isize;
    if code <= 32 {
        return Err(anyhow!("{}", describe_shell_error(code, target)));
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn elevate_target(_target: &str, _params: Option<&str>, _working_dir: Option<&str>) -> Result<()> {
    Err(anyhow!(
        "running as administrator is only supported on Windows"
    ))
}

/// `ShellExecuteW` reports failure as a small integer rather than setting a last
/// error, so the useful ones have to be translated by hand.
#[cfg(target_os = "windows")]
fn describe_shell_error(code: isize, target: &str) -> String {
    let reason = match code {
        2 => "the file was not found",
        3 => "the path was not found",
        5 => "elevation was declined, or permission was refused",
        26 => "the file could not be shared",
        27 | 31 => "no program is associated with this file type",
        32 => "a required library is missing",
        _ => "the shell refused to start it",
    };
    format!("could not run {target} as administrator: {reason}")
}

/// `cmd.exe` parses its command line with its own rules, not the
/// `CommandLineToArgvW` ones std applies when it quotes an argument for you.
/// Passing the line through verbatim is what cmd actually expects; going through
/// `args()` mangled anything containing quotes or a trailing backslash.
#[cfg(target_os = "windows")]
fn append_command_line(process: &mut Command, line: &str) {
    use std::os::windows::process::CommandExt;
    process.raw_arg(line);
}

#[cfg(not(target_os = "windows"))]
fn append_command_line(process: &mut Command, line: &str) {
    process.arg(line);
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

    if let Some(runtime_args) = runtime_args
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compose_command_joins_the_parts_it_is_given() {
        assert_eq!(
            compose_command(
                "httpx",
                Some("-silent -threads 50"),
                Some("-u https://a.test")
            )
            .unwrap(),
            "httpx -silent -threads 50 -u https://a.test"
        );
    }

    #[test]
    fn compose_command_skips_blank_optional_parts() {
        assert_eq!(
            compose_command(" nuclei ", Some("   "), None).unwrap(),
            "nuclei"
        );
    }

    #[test]
    fn compose_command_rejects_an_empty_command() {
        assert!(compose_command("   ", None, None).is_err());
    }

    /// Targets used to be handed to `cmd /C start`, which re-parsed them as a
    /// command line: a `&` in a query string split the URL and truncated the
    /// link. Nothing in this layer may reshape the text it was given.
    #[test]
    fn compose_command_preserves_shell_metacharacters() {
        let composed =
            compose_command("curl", None, Some("-u \"https://a.test/?q=1&b=2\"")).unwrap();
        assert!(composed.contains("?q=1&b=2"));
    }

    #[test]
    fn is_probable_url_recognises_schemes_case_insensitively() {
        assert!(is_probable_url("HTTPS://Example.test"));
        assert!(is_probable_url(" mailto:someone@example.test "));
        assert!(is_probable_url("tel:+123456"));
    }

    #[test]
    fn is_probable_url_rejects_windows_paths() {
        assert!(!is_probable_url("C:\\Program Files\\app.exe"));
        assert!(!is_probable_url("https:/missing-a-slash"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn shell_error_codes_become_readable_messages() {
        // 5 is what the user gets for declining the UAC prompt, which is the one
        // they will actually see.
        let message = describe_shell_error(5, "C:\\Tools\\sniffer.exe");
        assert!(message.contains("declined"));
        assert!(message.contains("sniffer.exe"));

        assert!(describe_shell_error(2, "x.exe").contains("not found"));
        assert!(describe_shell_error(99, "x.exe").contains("refused"));
    }

    #[test]
    fn a_path_that_is_no_longer_there_is_gone() {
        assert!(target_is_gone(
            &LaunchItemKind::Exe,
            "C:\\this\\was\\uninstalled\\app.exe"
        ));
        assert!(target_is_gone(&LaunchItemKind::Link, "   "));
        assert!(!target_is_gone(
            &LaunchItemKind::Folder,
            env!("CARGO_MANIFEST_DIR")
        ));
    }

    #[test]
    fn a_url_or_a_command_is_never_reported_as_gone() {
        // Their targets are not paths, so there is nothing to check — and a
        // failure to launch one must not look like a missing file.
        assert!(!target_is_gone(
            &LaunchItemKind::Url,
            "https://example.test/moved"
        ));
        assert!(!target_is_gone(
            &LaunchItemKind::Command,
            "not-on-path-at-all --flag"
        ));
    }
}
