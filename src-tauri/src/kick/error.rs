use thiserror::Error;

#[derive(Debug, Error)]
pub enum KickError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("OAuth error: {0}")]
    OAuth(String),

    #[error("Token storage error: {0}")]
    Storage(String),

    #[error("Token refresh failed")]
    TokenRefreshFailed,

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

impl serde::Serialize for KickError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
