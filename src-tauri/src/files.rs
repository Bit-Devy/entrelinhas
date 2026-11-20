use crate::models::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

const MAX_DOCUMENT: u64 = 64 * 1024 * 1024;
const MAX_IMAGE: usize = 20 * 1024 * 1024;
pub fn fingerprint(content: &[u8]) -> String {
    format!("{:x}", Sha256::digest(content))
}

fn document_path(value: &str) -> AppResult<PathBuf> {
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err(AppError::new("invalid", "Escolha um caminho absoluto."));
    }
    let extension = path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    if !["md", "txt", "markdown"].contains(&extension.as_str()) {
        return Err(AppError::new("format", "Escolha a extensão .md ou .txt."));
    }
    if path.exists() {
        Ok(path.canonicalize()?)
    } else {
        let parent = path
            .parent()
            .ok_or_else(|| AppError::new("invalid", "Pasta inválida."))?
            .canonicalize()?;
        Ok(parent.join(
            path.file_name()
                .ok_or_else(|| AppError::new("invalid", "Nome inválido."))?,
        ))
    }
}

pub fn read_document(value: &str) -> AppResult<ReadResult> {
    let path = document_path(value)?;
    let metadata = fs::metadata(&path)?;
    if !metadata.is_file() || metadata.len() > MAX_DOCUMENT {
        return Err(AppError::new(
            "size",
            "O documento deve ser um arquivo de até 64 MB.",
        ));
    }
    let bytes = fs::read(&path)?;
    let version = fingerprint(&bytes);
    let content = String::from_utf8(bytes).map_err(|_| {
        AppError::new(
            "encoding",
            "O arquivo não está em UTF-8. Converta a codificação em outro editor antes de abrir.",
        )
    })?;
    if content.contains('\0') {
        return Err(AppError::new(
            "encoding",
            "O arquivo contém dados binários.",
        ));
    }
    let format = if path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase()
        == "txt"
    {
        "txt"
    } else {
        "md"
    };
    Ok(ReadResult {
        path: path.to_string_lossy().into(),
        title: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into(),
        content: content.trim_start_matches('\u{feff}').into(),
        version,
        format: format.into(),
    })
}

fn check_conflict(path: &Path, expected: Option<&str>, overwrite: bool) -> AppResult<()> {
    if overwrite {
        return Ok(());
    }
    if path.exists() {
        if expected != Some(fingerprint(&fs::read(path)?).as_str()) {
            return Err(AppError::new(
                "conflict",
                "O arquivo já existe ou foi alterado fora do Entrelinhas.",
            ));
        }
    } else if expected.is_some() {
        return Err(AppError::new(
            "conflict",
            "O arquivo foi removido ou movido desde a abertura.",
        ));
    }
    Ok(())
}

fn atomic_write(path: &Path, bytes: &[u8], must_be_new: bool) -> AppResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::new("invalid", "Pasta inválida."))?;
    let mut temporary = tempfile::Builder::new()
        .prefix(".entrelinhas-save-")
        .tempfile_in(parent)?;
    if let Ok(metadata) = fs::metadata(path) {
        temporary
            .as_file()
            .set_permissions(metadata.permissions())?;
    }
    temporary.write_all(bytes)?;
    temporary.as_file().sync_all()?;
    if must_be_new {
        temporary
            .persist_noclobber(path)
            .map_err(|error| AppError::new("conflict", error.error.to_string()))?;
    } else {
        temporary
            .persist(path)
            .map_err(|error| AppError::from(error.error))?;
    }
    // O arquivo temporário só existe durante uma ação explícita de salvar.
    // A renomeação já aconteceu. Uma falha ao sincronizar a pasta não deve
    // provocar a remoção dos recursos de um documento que já foi gravado.
    let _ = File::open(parent).and_then(|directory| directory.sync_all());
    Ok(())
}

fn encode_path(value: &str) -> String {
    value
        .bytes()
        .map(|byte| {
            if byte.is_ascii_alphanumeric() || b"-_.~/".contains(&byte) {
                (byte as char).to_string()
            } else {
                format!("%{byte:02X}")
            }
        })
        .collect()
}
fn decode_path(value: &str) -> AppResult<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let pair = std::str::from_utf8(&bytes[index + 1..index + 3])
                .map_err(|_| AppError::new("invalid", "Caminho de imagem inválido."))?;
            decoded.push(
                u8::from_str_radix(pair, 16)
                    .map_err(|_| AppError::new("invalid", "Caminho de imagem inválido."))?,
            );
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).map_err(|_| AppError::new("invalid", "Caminho de imagem inválido."))
}

fn image_type(mime: &str) -> AppResult<&'static str> {
    match mime {
        "image/png" => Ok("png"),
        "image/jpeg" => Ok("jpg"),
        "image/gif" => Ok("gif"),
        "image/webp" => Ok("webp"),
        "image/avif" => Ok("avif"),
        "image/bmp" => Ok("bmp"),
        _ => Err(AppError::new("image", "Formato de imagem não suportado.")),
    }
}

pub fn save_document(request: SaveRequest) -> AppResult<SaveResult> {
    let path = document_path(&request.path)?;
    if fs::metadata(&path).is_ok_and(|metadata| metadata.permissions().readonly()) {
        return Err(AppError::new(
            "permission",
            "O arquivo está marcado como somente leitura. Use Salvar como para criar uma cópia.",
        ));
    }
    if request.content.len() as u64 > MAX_DOCUMENT {
        return Err(AppError::new("size", "O documento excede 64 MB."));
    }
    check_conflict(
        &path,
        request.expected_version.as_deref(),
        request.overwrite,
    )?;
    let mut content = request.content;
    let mut prepared = Vec::new();
    let folder = format!(
        "{}.assets",
        path.file_stem().unwrap_or_default().to_string_lossy()
    );
    if path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("txt"))
        && !request.assets.is_empty()
    {
        return Err(AppError::new("format", "TXT não armazena imagens."));
    }
    let mut total = 0;
    for asset in request.assets {
        if !asset.token.starts_with("entrelinhas-asset:")
            || !asset.token[18..]
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-')
        {
            return Err(AppError::new("image", "Referência de imagem inválida."));
        }
        if !content.contains(&asset.token) {
            continue;
        }
        let (header, encoded) = asset
            .data_url
            .split_once(",")
            .ok_or_else(|| AppError::new("image", "Imagem inválida."))?;
        let mime = header
            .strip_prefix("data:")
            .and_then(|h| h.strip_suffix(";base64"))
            .ok_or_else(|| AppError::new("image", "Imagem inválida."))?;
        let extension = image_type(mime)?;
        if encoded.len() > MAX_IMAGE * 4 / 3 + 8 {
            return Err(AppError::new("size", "A imagem excede 20 MB."));
        }
        let bytes = STANDARD
            .decode(encoded)
            .map_err(|_| AppError::new("image", "A imagem está corrompida."))?;
        total += bytes.len();
        if bytes.len() > MAX_IMAGE || total > 128 * 1024 * 1024 {
            return Err(AppError::new(
                "size",
                "Recursos de imagem excedem o limite de memória por salvamento (128 MB).",
            ));
        }
        let filename = format!("{}.{}", fingerprint(&bytes), extension);
        let relative = format!("{folder}/{filename}");
        content = content.replace(&asset.token, &encode_path(&relative));
        prepared.push((path.parent().unwrap().join(relative), bytes));
    }
    if content.contains("entrelinhas-asset:") {
        return Err(AppError::new(
            "image",
            "Uma imagem em memória não foi fornecida. O documento não foi salvo.",
        ));
    }
    let mut created = Vec::new();
    let save = (|| {
        for (asset_path, bytes) in prepared {
            fs::create_dir_all(asset_path.parent().unwrap())?;
            if !asset_path.exists() {
                atomic_write(&asset_path, &bytes, true)?;
                created.push(asset_path);
            } else if fs::read(&asset_path)? != bytes {
                return Err(AppError::new(
                    "conflict",
                    "Um recurso de imagem foi alterado. Nenhum documento foi sobrescrito.",
                ));
            }
        }
        check_conflict(
            &path,
            request.expected_version.as_deref(),
            request.overwrite,
        )?;
        atomic_write(&path, content.as_bytes(), !path.exists())
    })();
    if let Err(error) = save {
        for asset_path in created {
            let _ = fs::remove_file(asset_path);
        }
        let _ = fs::remove_dir(path.parent().unwrap().join(&folder));
        return Err(error);
    }
    Ok(SaveResult {
        path: path.to_string_lossy().into(),
        title: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into(),
        version: fingerprint(content.as_bytes()),
        content,
        warning: None,
    })
}

pub fn read_image(document: &str, source: &str) -> AppResult<String> {
    if source.contains("://") || source.starts_with("data:") || source.starts_with("//") {
        return Err(AppError::new(
            "image",
            "A imagem deve ser um arquivo local.",
        ));
    }
    let document = PathBuf::from(document);
    let source = decode_path(source)?;
    let path = document
        .parent()
        .ok_or_else(|| AppError::new("invalid", "Documento inválido."))?
        .join(source)
        .canonicalize()?;
    image_file(&path)
}

pub fn image_file(path: &Path) -> AppResult<String> {
    let mime = match path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        _ => return Err(AppError::new("image", "Formato de imagem não suportado.")),
    };
    if fs::metadata(path)?.len() as usize > MAX_IMAGE {
        return Err(AppError::new("size", "A imagem excede 20 MB."));
    }
    Ok(format!(
        "data:{mime};base64,{}",
        STANDARD.encode(fs::read(path)?)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(path: &Path, content: &str) -> SaveRequest {
        SaveRequest {
            path: path.to_string_lossy().into(),
            content: content.into(),
            expected_version: None,
            overwrite: false,
            project_id: None,
            assets: vec![],
        }
    }
    #[test]
    fn manual_utf8_save_and_conflict_protection() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("anotações 日本語.md");
        let saved = save_document(request(&path, "# Olá 🌿\nGrüß Gott")).unwrap();
        assert_eq!(
            read_document(&saved.path).unwrap().content,
            "# Olá 🌿\nGrüß Gott"
        );
        assert_eq!(
            save_document(request(&path, "outro")).unwrap_err().code,
            "conflict"
        );
        fs::write(&path, "alterado externamente").unwrap();
        let mut changed = request(&path, "nova versão");
        changed.expected_version = Some(saved.version);
        assert_eq!(save_document(changed).unwrap_err().code, "conflict");
        assert_eq!(fs::read_to_string(&path).unwrap(), "alterado externamente");
        assert!(!fs::read_dir(dir.path()).unwrap().any(|entry| entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".entrelinhas-save")));
    }
    #[test]
    fn images_are_written_only_by_explicit_save_with_relative_paths() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Minha nota.md");
        let mut note = request(&path, "![Foto](entrelinhas-asset:abc)");
        note.assets.push(ImageAsset {
            token: "entrelinhas-asset:abc".into(),
            data_url: "data:image/png;base64,eA==".into(),
        });
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
        let saved = save_document(note).unwrap();
        assert!(saved.content.contains("Minha%20nota.assets/"));
        let relative = saved
            .content
            .split('(')
            .nth(1)
            .unwrap()
            .trim_end_matches(')');
        assert_eq!(
            read_image(&saved.path, relative).unwrap(),
            "data:image/png;base64,eA=="
        );
    }
    #[test]
    fn txt_and_encoding_errors() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("texto.txt");
        save_document(request(&path, "**literal**\n日本語")).unwrap();
        let read = read_document(&path.to_string_lossy()).unwrap();
        assert_eq!(read.format, "txt");
        assert_eq!(read.content, "**literal**\n日本語");
        fs::write(&path, [0xff, 0xfe, 0]).unwrap();
        assert!(
            matches!(read_document(&path.to_string_lossy()), Err(AppError { code, .. }) if code == "encoding")
        );
    }
    #[test]
    fn readonly_and_invalid_assets_preserve_original_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("protegido.md");
        std::fs::write(&path, "original").unwrap();
        let mut permissions = std::fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(true);
        std::fs::set_permissions(&path, permissions).unwrap();
        let mut note = request(&path, "novo");
        note.overwrite = true;
        assert_eq!(save_document(note).unwrap_err().code, "permission");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "original");
        let image_path = dir.path().join("imagem.md");
        let mut invalid = request(&image_path, "![Foto](entrelinhas-asset:abc)");
        invalid.assets.push(ImageAsset {
            token: "entrelinhas-asset:abc".into(),
            data_url: "data:image/png;base64,INVÁLIDO".into(),
        });
        assert_eq!(save_document(invalid).unwrap_err().code, "image");
        assert!(!image_path.exists());
        assert!(!dir.path().join("imagem.assets").exists());
    }
}
