use super::parser::{extract_live_streams_from_initial_data, extract_yt_initial_data};
use super::types::YouTubeSuggestedStream;
use std::time::Duration;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

#[derive(Debug, PartialEq, Eq)]
pub struct YoutubeLocaleMeta {
    pub hl: &'static str,
    pub gl: &'static str,
    pub accept_lang: &'static str,
}

pub fn get_youtube_locale_meta(locale: Option<&str>) -> YoutubeLocaleMeta {
    let loc = locale.unwrap_or("en").to_lowercase();
    let prefix = loc.split(['-', '_']).next().unwrap_or("en");

    match prefix {
        "pt" => YoutubeLocaleMeta {
            hl: "pt-BR",
            gl: "BR",
            accept_lang: "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        "es" => YoutubeLocaleMeta {
            hl: "es",
            gl: "ES",
            accept_lang: "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        "de" => YoutubeLocaleMeta {
            hl: "de",
            gl: "DE",
            accept_lang: "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        "ru" => YoutubeLocaleMeta {
            hl: "ru",
            gl: "RU",
            accept_lang: "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        "fr" => YoutubeLocaleMeta {
            hl: "fr",
            gl: "FR",
            accept_lang: "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        "cn" | "zh" => YoutubeLocaleMeta {
            hl: "zh-CN",
            gl: "TW",
            accept_lang: "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        "tr" => YoutubeLocaleMeta {
            hl: "tr",
            gl: "TR",
            accept_lang: "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        "hi" => YoutubeLocaleMeta {
            hl: "hi",
            gl: "IN",
            accept_lang: "hi-IN,hi;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        "id" => YoutubeLocaleMeta {
            hl: "id",
            gl: "ID",
            accept_lang: "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        _ => YoutubeLocaleMeta {
            hl: "en",
            gl: "US",
            accept_lang: "en-US,en;q=0.9",
        },
    }
}

pub async fn fetch_live_streams(
    locale: Option<&str>,
    limit: usize,
) -> Result<Vec<YouTubeSuggestedStream>, String> {
    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let meta = get_youtube_locale_meta(locale);
    let cookie_val = format!("PREF=hl={}&gl={}&tz=UTC", meta.hl, meta.gl);

    let endpoints = [
        format!("https://www.youtube.com/live?hl={}&gl={}", meta.hl, meta.gl),
        format!(
            "https://www.youtube.com/gaming?hl={}&gl={}",
            meta.hl, meta.gl
        ),
    ];

    let mut all_streams = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    for url in endpoints {
        if all_streams.len() >= limit {
            break;
        }

        let resp = client
            .get(&url)
            .header("User-Agent", USER_AGENT)
            .header("Accept-Language", meta.accept_lang)
            .header("Cookie", &cookie_val)
            .header("X-YouTube-Client-Name", "1")
            .header(
                "Accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            )
            .send()
            .await;

        if let Ok(res) = resp {
            if res.status().is_success() {
                if let Ok(html) = res.text().await {
                    if let Some(json_data) = extract_yt_initial_data(&html) {
                        let streams = extract_live_streams_from_initial_data(&json_data, limit);
                        for stream in streams {
                            if !seen_ids.contains(&stream.channel) {
                                seen_ids.insert(stream.channel.clone());
                                all_streams.push(stream);
                            }
                        }
                    }
                }
            }
        }
    }

    all_streams.truncate(limit);
    Ok(all_streams)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_map_locales_to_correct_hl_and_gl() {
        // Arrange & Act & Assert
        assert_eq!(
            get_youtube_locale_meta(Some("en")),
            YoutubeLocaleMeta {
                hl: "en",
                gl: "US",
                accept_lang: "en-US,en;q=0.9",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(Some("pt")),
            YoutubeLocaleMeta {
                hl: "pt-BR",
                gl: "BR",
                accept_lang: "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(Some("pt-BR")),
            YoutubeLocaleMeta {
                hl: "pt-BR",
                gl: "BR",
                accept_lang: "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(Some("es")),
            YoutubeLocaleMeta {
                hl: "es",
                gl: "ES",
                accept_lang: "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(Some("de")),
            YoutubeLocaleMeta {
                hl: "de",
                gl: "DE",
                accept_lang: "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(Some("fr")),
            YoutubeLocaleMeta {
                hl: "fr",
                gl: "FR",
                accept_lang: "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(Some("ru")),
            YoutubeLocaleMeta {
                hl: "ru",
                gl: "RU",
                accept_lang: "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(Some("tr")),
            YoutubeLocaleMeta {
                hl: "tr",
                gl: "TR",
                accept_lang: "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(Some("hi")),
            YoutubeLocaleMeta {
                hl: "hi",
                gl: "IN",
                accept_lang: "hi-IN,hi;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(Some("id")),
            YoutubeLocaleMeta {
                hl: "id",
                gl: "ID",
                accept_lang: "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(Some("cn")),
            YoutubeLocaleMeta {
                hl: "zh-CN",
                gl: "TW",
                accept_lang: "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
            }
        );
        assert_eq!(
            get_youtube_locale_meta(None),
            YoutubeLocaleMeta {
                hl: "en",
                gl: "US",
                accept_lang: "en-US,en;q=0.9",
            }
        );
    }
}
