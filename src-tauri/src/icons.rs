use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{anyhow, Context, Result};
use image::ColorType;
use sha2::{Digest, Sha256};

use crate::models::{LaunchItem, LaunchItemKind};

#[cfg(target_os = "windows")]
use std::{mem::size_of, os::windows::ffi::OsStrExt};
#[cfg(target_os = "windows")]
use windows::{
    core::PCWSTR,
    Win32::{
        Graphics::Gdi::{
            CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP,
            BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
        },
        UI::{
            Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON},
            WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO},
        },
    },
};

pub fn resolve_auto_icon(item: &LaunchItem, icons_dir: &Path) -> Result<Option<String>> {
    match item.kind {
        LaunchItemKind::Exe | LaunchItemKind::Link => extract_file_icon(&item.target, &item.id, icons_dir),
        _ => Ok(None),
    }
}

pub fn import_custom_icon(source_path: &str, item_id: &str, icons_dir: &Path) -> Result<String> {
    let source = PathBuf::from(source_path);
    if !source.exists() {
        return Err(anyhow!("custom icon file does not exist"));
    }

    let extension = source
        .extension()
        .and_then(|ext| ext.to_str())
        .filter(|ext| !ext.is_empty())
        .unwrap_or("png");
    let destination = icons_dir.join(format!("{}-custom.{}", item_id, extension));
    fs::copy(&source, &destination).with_context(|| {
        format!(
            "failed to copy custom icon from {} to {}",
            source.display(),
            destination.display()
        )
    })?;
    Ok(destination.to_string_lossy().to_string())
}

fn extract_file_icon(target: &str, item_id: &str, icons_dir: &Path) -> Result<Option<String>> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (target, item_id, icons_dir);
        Ok(None)
    }

    #[cfg(target_os = "windows")]
    {
        let source = PathBuf::from(target);
        if !source.exists() {
            return Ok(None);
        }

        let file_name = format!("{}-{}.png", item_id, hash_path(&source));
        let output_path = icons_dir.join(file_name);
        if output_path.exists() && cached_icon_is_valid(&output_path) {
            return Ok(Some(output_path.to_string_lossy().to_string()));
        }

        let _ = fs::remove_file(&output_path);

        if save_icon_from_path(&source, &output_path).is_err() || !cached_icon_is_valid(&output_path) {
            let _ = fs::remove_file(&output_path);
            return Ok(None);
        }

        Ok(Some(output_path.to_string_lossy().to_string()))
    }
}

fn hash_path(path: &Path) -> String {
    let mut hasher = Sha256::new();
    hasher.update(path.to_string_lossy().as_bytes());
    let digest = hasher.finalize();
    format!("{:x}", digest)[0..12].to_string()
}

fn cached_icon_is_valid(path: &Path) -> bool {
    fs::metadata(path)
        .map(|metadata| metadata.is_file() && metadata.len() > 0)
        .unwrap_or(false)
        && image::open(path).is_ok()
}

#[cfg(target_os = "windows")]
fn save_icon_from_path(source: &Path, output_path: &Path) -> Result<()> {
    let wide_path: Vec<u16> = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut file_info = SHFILEINFOW::default();
    let result = unsafe {
        SHGetFileInfoW(
            PCWSTR(wide_path.as_ptr()),
            Default::default(),
            Some(&mut file_info),
            size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        )
    };

    if result == 0 || file_info.hIcon.0.is_null() {
        return Err(anyhow!("failed to extract icon from {}", source.display()));
    }

    let icon = file_info.hIcon;
    let save_result = save_hicon_to_png(icon, output_path);
    unsafe {
        let _ = DestroyIcon(icon);
    }
    save_result
}

#[cfg(target_os = "windows")]
fn save_hicon_to_png(icon: HICON, output_path: &Path) -> Result<()> {
    let mut icon_info = ICONINFO::default();
    unsafe { GetIconInfo(icon, &mut icon_info)? };

    let mut bitmap = BITMAP::default();
    let object_size = unsafe {
        GetObjectW(
            HGDIOBJ(icon_info.hbmColor.0),
            size_of::<BITMAP>() as i32,
            Some(&mut bitmap as *mut _ as *mut _),
        )
    };
    if object_size == 0 {
        unsafe {
            let _ = DeleteObject(icon_info.hbmColor.into());
            let _ = DeleteObject(icon_info.hbmMask.into());
        }
        return Err(anyhow!("failed to inspect icon bitmap"));
    }

    let width = bitmap.bmWidth;
    let height = bitmap.bmHeight;
    let mut pixels = vec![0u8; (width * height * 4) as usize];
    let mut bitmap_info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };

    let device_context = unsafe { CreateCompatibleDC(None) };
    let scanlines = unsafe {
        GetDIBits(
            device_context,
            icon_info.hbmColor,
            0,
            height as u32,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bitmap_info,
            DIB_RGB_COLORS,
        )
    };

    unsafe {
        let _ = DeleteDC(device_context);
        let _ = DeleteObject(icon_info.hbmColor.into());
        let _ = DeleteObject(icon_info.hbmMask.into());
    }

    if scanlines == 0 {
        return Err(anyhow!("failed to read icon bitmap data"));
    }

    for chunk in pixels.chunks_exact_mut(4) {
        chunk.swap(0, 2);
    }

    image::save_buffer(output_path, &pixels, width as u32, height as u32, ColorType::Rgba8)
        .with_context(|| format!("failed to save icon to {}", output_path.display()))?;
    Ok(())
}
