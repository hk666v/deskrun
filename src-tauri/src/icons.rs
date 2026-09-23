use std::{
    fs,
    io::Read,
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
            CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO,
            BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP, HDC, HGDIOBJ,
        },
        UI::{
            Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON},
            WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO},
        },
    },
};

/// Icons larger than this are not real icons, and treating them as such only
/// leads to enormous allocations.
#[cfg(target_os = "windows")]
const MAX_ICON_EDGE: i32 = 1024;

const PNG_SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];

pub fn resolve_auto_icon(item: &LaunchItem, icons_dir: &Path) -> Result<Option<String>> {
    match item.kind {
        LaunchItemKind::Exe | LaunchItemKind::Link => {
            extract_file_icon(&item.target, &item.id, icons_dir)
        }
        _ => Ok(None),
    }
}

pub fn import_custom_icon(source_path: &str, item_id: &str, icons_dir: &Path) -> Result<String> {
    let source = PathBuf::from(source_path);
    if !source.exists() {
        return Err(anyhow!("custom icon file does not exist"));
    }

    // Drop any previous custom icon first: switching from `icon.png` to
    // `icon.ico` would otherwise leave the old file behind forever.
    remove_cached_icons(item_id, icons_dir);

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

/// Removes every cached file belonging to an item. Called when the item is
/// deleted or its icon is replaced, so `icons/` cannot grow without bound across
/// target edits, icon swaps, and deletions.
pub fn remove_cached_icons(item_id: &str, icons_dir: &Path) {
    let Ok(entries) = fs::read_dir(icons_dir) else {
        return;
    };

    let prefix = format!("{item_id}-");
    for entry in entries.flatten() {
        let name = entry.file_name();
        if name.to_string_lossy().starts_with(&prefix) {
            let _ = fs::remove_file(entry.path());
        }
    }
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

        let file_name = format!("{}-{}.png", item_id, cache_key(&source));
        let output_path = icons_dir.join(file_name);
        if cached_icon_is_valid(&output_path) {
            return Ok(Some(output_path.to_string_lossy().to_string()));
        }

        let _ = fs::remove_file(&output_path);

        if save_icon_from_path(&source, &output_path).is_err()
            || !cached_icon_is_valid(&output_path)
        {
            let _ = fs::remove_file(&output_path);
            return Ok(None);
        }

        Ok(Some(output_path.to_string_lossy().to_string()))
    }
}

/// Keys the cache on the source path *and* its size and modification time.
/// Keying on the path alone meant a program that updates itself in place — same
/// path, new icon — kept showing the old artwork forever.
fn cache_key(source: &Path) -> String {
    let mut hasher = Sha256::new();
    hasher.update(source.to_string_lossy().as_bytes());

    if let Ok(metadata) = fs::metadata(source) {
        hasher.update(metadata.len().to_le_bytes());
        if let Ok(modified) = metadata.modified() {
            if let Ok(age) = modified.duration_since(std::time::UNIX_EPOCH) {
                hasher.update(age.as_secs().to_le_bytes());
            }
        }
    }

    format!("{:x}", hasher.finalize())[0..12].to_string()
}

/// A non-empty file that still starts with the PNG signature. Decoding the whole
/// image just to answer "is this a usable PNG" cost a full decode on every
/// create and update.
fn cached_icon_is_valid(path: &Path) -> bool {
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };

    let mut signature = [0u8; 8];
    file.read_exact(&mut signature).is_ok() && signature == PNG_SIGNATURE
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

/// Owns the two bitmaps `GetIconInfo` hands back. There are several early
/// returns below — including `?` on a Windows call — and hand-written cleanup
/// missed one of them the moment the code grew a new branch.
#[cfg(target_os = "windows")]
struct IconBitmaps {
    color: HBITMAP,
    mask: HBITMAP,
}

#[cfg(target_os = "windows")]
impl Drop for IconBitmaps {
    fn drop(&mut self) {
        unsafe {
            let _ = DeleteObject(self.color.into());
            let _ = DeleteObject(self.mask.into());
        }
    }
}

#[cfg(target_os = "windows")]
struct DeviceContext(HDC);

#[cfg(target_os = "windows")]
impl Drop for DeviceContext {
    fn drop(&mut self) {
        unsafe {
            let _ = DeleteDC(self.0);
        }
    }
}

#[cfg(target_os = "windows")]
fn bitmap_info(width: i32, height: i32) -> BITMAPINFO {
    BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            // Negative height asks for a top-down bitmap, matching the order we
            // write the pixels back out in.
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    }
}

#[cfg(target_os = "windows")]
fn save_hicon_to_png(icon: HICON, output_path: &Path) -> Result<()> {
    let mut icon_info = ICONINFO::default();
    unsafe { GetIconInfo(icon, &mut icon_info)? };
    let _bitmaps = IconBitmaps {
        color: icon_info.hbmColor,
        mask: icon_info.hbmMask,
    };

    let mut bitmap = BITMAP::default();
    let object_size = unsafe {
        GetObjectW(
            HGDIOBJ(icon_info.hbmColor.0),
            size_of::<BITMAP>() as i32,
            Some(&mut bitmap as *mut _ as *mut _),
        )
    };
    if object_size == 0 {
        return Err(anyhow!("failed to inspect icon bitmap"));
    }

    let width = bitmap.bmWidth;
    let height = bitmap.bmHeight;

    // A malformed or top-down bitmap can report a negative height, and the
    // pixel-buffer arithmetic below used to be unchecked i32 multiplication that
    // aborted the process on overflow — while the launcher's state lock was held.
    if !(1..=MAX_ICON_EDGE).contains(&width) || !(1..=MAX_ICON_EDGE).contains(&height) {
        return Err(anyhow!(
            "icon bitmap has an unusable size: {width}x{height}"
        ));
    }

    // Both edges are bounded above, so this cannot overflow.
    let pixel_bytes = width as usize * height as usize * 4;
    let mut pixels = vec![0u8; pixel_bytes];
    let device_context = DeviceContext(unsafe { CreateCompatibleDC(None) });

    let scanlines = unsafe {
        GetDIBits(
            device_context.0,
            icon_info.hbmColor,
            0,
            height as u32,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bitmap_info(width, height),
            DIB_RGB_COLORS,
        )
    };
    if scanlines == 0 {
        return Err(anyhow!("failed to read icon bitmap data"));
    }

    for pixel in pixels.as_chunks_mut::<4>().0 {
        pixel.swap(0, 2);
    }

    // 1bpp and 16-colour icons come back from GetDIBits with an empty alpha
    // channel, so every pixel lands fully transparent and the icon renders as a
    // hole. When that happens, rebuild alpha from the AND mask instead.
    if pixels.as_chunks::<4>().0.iter().all(|pixel| pixel[3] == 0) {
        apply_mask_alpha(
            device_context.0,
            icon_info.hbmMask,
            width,
            height,
            &mut pixels,
        );
    }

    image::save_buffer(
        output_path,
        &pixels,
        width as u32,
        height as u32,
        ColorType::Rgba8,
    )
    .with_context(|| format!("failed to save icon to {}", output_path.display()))?;
    Ok(())
}

/// Reconstructs an alpha channel from a monochrome AND mask, where a set bit
/// means "transparent".
#[cfg(target_os = "windows")]
fn apply_mask_alpha(dc: HDC, mask: HBITMAP, width: i32, height: i32, pixels: &mut [u8]) {
    let mut mask_pixels = vec![0u8; width as usize * height as usize * 4];
    let scanlines = unsafe {
        GetDIBits(
            dc,
            mask,
            0,
            height as u32,
            Some(mask_pixels.as_mut_ptr() as *mut _),
            &mut bitmap_info(width, height),
            DIB_RGB_COLORS,
        )
    };
    if scanlines == 0 {
        return;
    }

    for (pixel, mask_pixel) in pixels
        .as_chunks_mut::<4>()
        .0
        .iter_mut()
        .zip(mask_pixels.as_chunks::<4>().0)
    {
        pixel[3] = if mask_pixel[0] == 0 { 255 } else { 0 };
    }
}
