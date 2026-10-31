//! Turns the icon the OS gives us into a small PNG, so it stays cheap to store and to send.

use base64::{engine::general_purpose::STANDARD, Engine};
use image::{imageops::FilterType, ImageFormat};
use std::io::Cursor;

const SIZE: u32 = 64;

/// Takes a `data:image/png;base64,...` URL and returns base64 PNG data at most 64px on a side.
pub fn normalize(data_url: &str) -> Option<String> {
    let (_, encoded) = data_url.split_once("base64,")?;
    let bytes = STANDARD.decode(encoded.trim()).ok()?;
    let image = image::load_from_memory_with_format(&bytes, ImageFormat::Png).ok()?;
    let image = if image.width() > SIZE || image.height() > SIZE {
        image.resize(SIZE, SIZE, FilterType::Lanczos3)
    } else {
        image
    };
    let mut output = Cursor::new(Vec::new());
    image.write_to(&mut output, ImageFormat::Png).ok()?;
    Some(STANDARD.encode(output.into_inner()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn data_url(size: u32) -> String {
        let image = image::DynamicImage::new_rgba8(size, size);
        let mut bytes = Cursor::new(Vec::new());
        image.write_to(&mut bytes, ImageFormat::Png).unwrap();
        format!("data:image/png;base64,{}", STANDARD.encode(bytes.into_inner()))
    }

    fn decoded_size(encoded: &str) -> (u32, u32) {
        let image = image::load_from_memory(&STANDARD.decode(encoded).unwrap()).unwrap();
        (image.width(), image.height())
    }

    #[test]
    fn large_icons_are_shrunk() {
        assert_eq!(decoded_size(&normalize(&data_url(512)).unwrap()), (64, 64));
    }

    #[test]
    fn small_icons_are_not_upscaled() {
        assert_eq!(decoded_size(&normalize(&data_url(32)).unwrap()), (32, 32));
    }

    #[test]
    fn invalid_input_gives_nothing() {
        assert_eq!(normalize(""), None);
        assert_eq!(normalize("data:image/png;base64,"), None);
        assert_eq!(normalize("data:image/png;base64,bm90IGFuIGltYWdl"), None);
    }

    /// Reads the real icon of the frontmost app. Needs a desktop session, so run it by hand:
    /// cargo test --lib --no-default-features real_icon -- --ignored --nocapture
    #[test]
    #[ignore]
    fn real_icon_from_the_os() {
        let info = x_win::get_active_window().unwrap();
        let raw = x_win::get_window_icon(&info).unwrap();
        let png = normalize(&raw.data).expect("icon should normalize");
        println!("{}: {}x{} -> {:?}, {} base64 bytes", info.info.name, raw.width, raw.height, decoded_size(&png), png.len());
    }
}
