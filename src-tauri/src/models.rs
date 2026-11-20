use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
}
pub type AppResult<T> = Result<T, AppError>;
impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}
impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        let code = match error.kind() {
            std::io::ErrorKind::NotFound => "missing",
            std::io::ErrorKind::PermissionDenied => "permission",
            _ => "io",
        };
        Self::new(code, error.to_string())
    }
}
impl From<rusqlite::Error> for AppError {
    fn from(error: rusqlite::Error) -> Self {
        Self::new("database", error.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub color: String,
    pub icon: String,
    pub position: i64,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredDocument {
    pub path: String,
    pub title: String,
    pub project_id: Option<String>,
    pub updated_at: i64,
}
#[derive(Serialize)]
pub struct Library {
    pub projects: Vec<Project>,
    pub documents: Vec<RegisteredDocument>,
    pub preferences: serde_json::Value,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadResult {
    pub path: String,
    pub title: String,
    pub content: String,
    pub version: String,
    pub format: String,
}
#[derive(Debug, Serialize)]
pub struct RenameResult {
    pub path: String,
    pub title: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageAsset {
    pub token: String,
    pub data_url: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRequest {
    pub path: String,
    pub content: String,
    pub expected_version: Option<String>,
    pub overwrite: bool,
    pub project_id: Option<String>,
    pub assets: Vec<ImageAsset>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub path: String,
    pub title: String,
    pub content: String,
    pub version: String,
    pub warning: Option<String>,
}
#[derive(Serialize)]
pub struct SearchResult {
    pub path: String,
    pub title: String,
    pub excerpt: String,
    pub missing: bool,
    pub error: Option<String>,
}
