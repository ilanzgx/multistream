export const languages = {
  en: "English",
  "pt-br": "Português",
};

export const defaultLang = "en";

export const ui = {
  en: {
    "meta.title": "Multistream - Watch Multiple Streams Locally",
    "nav.github": "GitHub",
    "nav.toggle_theme": "Toggle theme",
    "nav.open_menu": "Open menu",
    "nav.close_menu": "Close menu",
    "nav.language": "Language",
    "hero.title": "Watch multiple streams locally.",
    "hero.subtitle":
      "A desktop app that connects directly to Twitch, Kick, and YouTube. No servers in the middle, no tracking. Just the streams.",
    "hero.preview_alt":
      "Multistream desktop application interface with live streams and unified chat",
    "hero.download_win": "Download for Windows",
    "hero.download_linux": "Download for Linux",
    "hero.download_mac": "Download for Mac",
    "hero.deep_link_title": "Room invite",
    "hero.deep_link_subtitle": "Someone shared a layout with you. Open the app to join.",
    "hero.deep_link_button": "Open Multistream",
    "hero.deep_link_no_app": "Don't have Multistream installed? Click here to download.",
    "hero.kick_callback_title": "Kick authentication successful",
    "hero.kick_callback_subtitle": "You can close this tab. The app will handle the rest.",
    "hero.all_downloads": "View all options (.msi, AppImage, Intel Mac)",
    "hero.modal_title": "Advanced Downloads",
    "hero.modal_close": "Close download options modal",
    "hero.modal_win_exe": "Standard Installer (.exe)",
    "hero.modal_win_msi": "MSI Installer (.msi)",
    "hero.modal_mac_arm": "Apple Silicon (.dmg)",
    "hero.modal_mac_x64": "Intel (.dmg)",
    "hero.modal_linux_deb": "Debian/Ubuntu (.deb)",
    "hero.modal_linux_appimage": "AppImage (Portable)",
    "nav.changelog": "Changelog",
    "hero.changelog_pill": "What's new",
    "changelog.title": "Recent Updates",
    "changelog.page_title": "Changelog",
    "changelog.page_subtitle": "All releases, new features, and improvements in Multistream.",
    "changelog.back_home": "Back to home",
    "changelog.view_github": "View on GitHub",
    "changelog.latest": "Latest",
    "changelog.loading": "Loading latest releases...",
    "changelog.empty": "No releases found.",
    "changelog.error": "Unable to fetch recent updates from GitHub.",
    "features.local": "Direct Connection",
    "features.local.desc": "The app connects straight to the platforms. We do not proxy your data.",
    "features.ai": "Local Transcription",
    "features.ai.desc":
      'Live audio transcription running entirely on your own CPU using Whisper.cpp.<span class="absolute top-6 right-6 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#111111] dark:text-gray-300 bg-[rgba(0,0,0,0.04)] dark:bg-white/5 px-2 py-1.5 rounded"><img src="/windows-icon.svg" class="w-3 h-3 dark:invert opacity-70" alt="" aria-hidden="true" width="12" height="12" /> Exclusive</span>',
    "features.unified": "Unified Chat",
    "features.unified.desc": "Read Twitch and Kick chats together in one place.",
    "features.recording": "Local Recording",
    "features.recording.desc": "Record Twitch, Kick, and YouTube streams locally on your device.",
    "features.auth": "Account Authentication",
    "features.auth.desc": "Securely log in to Twitch and Kick to interact with the chat natively.",
    "nav.donate": "Buy me a coffee",
    "faq.title": "Frequently Asked Questions",
    "faq.subtitle":
      "Clear answers to common questions about safety, performance, and compatibility.",
    "faq.q_macos": "macOS says Multistream is damaged and cannot be opened. Is it safe?",
    "faq.a_macos":
      "Yes. Multistream is a free open-source project and does not carry an annual paid Apple Developer license, which triggers Gatekeeper's quarantine alert by default. You can install it cleanly with Homebrew (<code>brew install --cask ilanzgx/multistream/multistream</code>) or remove the quarantine flag in your terminal: <code>xattr -dr com.apple.quarantine /Applications/Multistream.app</code>.",
    "faq.q_security": "Is it safe to connect my Twitch and Kick accounts?",
    "faq.a_security":
      "Yes. Login happens through official OAuth windows hosted directly on twitch.tv and kick.com. The app never sees, stores, or handles your passwords. Tokens stay on your local disk, and all network calls are open source and verifiable on GitHub.",
    "faq.q_performance": "Will running multiple streams lag or freeze my computer?",
    "faq.a_performance":
      "Multistream is built with Tauri and Rust instead of heavy Electron wrappers. It avoids running separate full browser processes for every stream and uses hardware video acceleration directly. It uses significantly less RAM and CPU than keeping multiple browser tabs open.",
    "faq.q_free": "Is Multistream really free? Are there hidden plans or injected ads?",
    "faq.a_free":
      "It is completely free under the GPL-3.0 license. There are no paid tiers, subscriptions, telemetry tracking, or injected advertisements. Streams load directly from official platform sources.",
    "faq.q_account": "Do I need to create an account to use the app?",
    "faq.a_account":
      "No. You can download the app, add channels, watch live streams, and customize layouts immediately without creating an account. Logging in is only required if you want to send messages in Twitch or Kick chat.",
    "cta.title": "Ready to watch without browser clutter?",
    "cta.subtitle": "Free, open-source, and lightweight. Available for Windows, macOS, and Linux.",
    "cta.download": "Download Multistream",
    "cta.github": "View on GitHub",
    "footer.credits":
      'Multistream is an open-source project developed by Ilan Fonseca aka <a href="https://github.com/ilanzgx" target="_blank" rel="noopener noreferrer" class="hover:text-[#111111] dark:hover:text-white transition-colors underline underline-offset-4 font-medium">ilanzgx</a>.',
    "footer.disclaimer":
      "Multistream is an independent open-source project not affiliated with Twitch, Kick, YouTube, or Amazon. All trademarks belong to their respective owners.",
  },
  "pt-br": {
    "meta.title": "Multistream - Assista Várias Streams Localmente",
    "nav.github": "GitHub",
    "nav.toggle_theme": "Alternar tema",
    "nav.open_menu": "Abrir menu",
    "nav.close_menu": "Fechar menu",
    "nav.language": "Idioma",
    "hero.title": "Assista várias streams localmente.",
    "hero.subtitle":
      "Um app desktop que conecta direto na Twitch, Kick e YouTube. Sem servidores no meio, sem rastreamento. Apenas as streams.",
    "hero.preview_alt":
      "Interface do aplicativo desktop Multistream com transmissões ao vivo e chat unificado",
    "hero.download_win": "Baixar para Windows",
    "hero.download_linux": "Baixar para Linux",
    "hero.download_mac": "Baixar para Mac",
    "hero.deep_link_title": "Convite de sala",
    "hero.deep_link_subtitle": "Alguém compartilhou um layout com você. Abra o app para entrar.",
    "hero.deep_link_button": "Abrir Multistream",
    "hero.deep_link_no_app": "Ainda não tem o Multistream? Clique aqui para baixar.",
    "hero.kick_callback_title": "Autenticação Kick concluída",
    "hero.kick_callback_subtitle": "Pode fechar essa aba. O app vai cuidar do resto.",
    "hero.all_downloads": "Ver todas as opções (.msi, AppImage, Intel Mac)",
    "hero.modal_title": "Downloads Avançados",
    "hero.modal_close": "Fechar modal de downloads",
    "hero.modal_win_exe": "Instalador Padrão (.exe)",
    "hero.modal_win_msi": "Instalador MSI (.msi)",
    "hero.modal_mac_arm": "Apple Silicon (.dmg)",
    "hero.modal_mac_x64": "Intel (.dmg)",
    "hero.modal_linux_deb": "Debian/Ubuntu (.deb)",
    "hero.modal_linux_appimage": "AppImage (Portátil)",
    "nav.changelog": "Changelog",
    "hero.changelog_pill": "Ver novidades",
    "changelog.title": "Atualizações Recentes",
    "changelog.page_title": "Changelog",
    "changelog.page_subtitle": "Todas as versões, novidades e melhorias do Multistream.",
    "changelog.back_home": "Voltar para o início",
    "changelog.view_github": "Ver no GitHub",
    "changelog.latest": "Mais recente",
    "changelog.loading": "Carregando as últimas atualizações...",
    "changelog.empty": "Nenhuma atualização encontrada.",
    "changelog.error": "Não foi possível carregar as atualizações do GitHub.",
    "features.local": "Conexão Direta",
    "features.local.desc":
      "O app conecta direto nas plataformas. Nós não intermediamos seus dados.",
    "features.ai": "Transcrição Local",
    "features.ai.desc":
      'Transcrição de áudio ao vivo rodando inteiramente no seu processador usando Whisper.cpp.<span class="absolute top-6 right-6 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#111111] dark:text-gray-300 bg-[rgba(0,0,0,0.04)] dark:bg-white/5 px-2 py-1.5 rounded"><img src="/windows-icon.svg" class="w-3 h-3 dark:invert opacity-70" alt="" aria-hidden="true" width="12" height="12" /> Exclusivo</span>',
    "features.unified": "Chat Unificado",
    "features.unified.desc": "Leia o chat da Twitch e da Kick juntos no mesmo lugar.",
    "features.recording": "Gravação Local",
    "features.recording.desc":
      "Grave streams da Twitch, Kick e YouTube localmente no seu dispositivo.",
    "features.auth": "Autenticação",
    "features.auth.desc":
      "Faça login com segurança na Twitch e Kick para interagir com o chat nativamente.",
    "nav.donate": "Pagar um café",
    "faq.title": "Perguntas Frequentes",
    "faq.subtitle": "Respostas diretas sobre segurança, desempenho e compatibilidade.",
    "faq.q_macos":
      "O macOS diz que o Multistream está danificado e não pode ser aberto. O app é confiável?",
    "faq.a_macos":
      "Sim. Como o Multistream é um projeto gratuito e de código aberto, ele não possui o certificado anual pago da Apple, o que faz o Gatekeeper do macOS disparar esse alerta por padrão. Você pode instalar direto pelo Homebrew (<code>brew install --cask ilanzgx/multistream/multistream</code>) ou remover a quarentena no terminal com: <code>xattr -dr com.apple.quarantine /Applications/Multistream.app</code>.",
    "faq.q_security": "É seguro conectar minhas contas da Twitch e da Kick?",
    "faq.a_security":
      "Sim. A autenticação usa o OAuth oficial das plataformas diretamente em twitch.tv e kick.com. O aplicativo nunca vê nem armazena suas senhas. Seus tokens de sessão ficam salvos apenas localmente no seu computador e todo o código de rede é aberto e verificável no GitHub.",
    "faq.q_performance": "Vai travar meu computador se eu abrir várias transmissões juntas?",
    "faq.a_performance":
      "O Multistream foi desenvolvido em Tauri e Rust em vez de Electron. Ele não abre navegadores inteiros para cada transmissão em segundo plano, aproveitando a aceleração da sua placa de vídeo para decodificar o vídeo. O consumo de memória e processamento é bem menor do que manter várias abas abertas no navegador.",
    "faq.q_free": "O Multistream é realmente gratuito? Tem planos pagos ou anúncios extras?",
    "faq.a_free":
      "O aplicativo é 100% gratuito sob a licença GPL-3.0. Não existem planos pagos, assinaturas, rastreadores ou anúncios inseridos nas transmissões. Você assiste diretamente aos reprodutores oficiais de cada plataforma.",
    "faq.q_account": "Preciso criar uma conta para usar o app?",
    "faq.a_account":
      "Não. Você pode baixar o aplicativo, adicionar canais, assistir transmissões e organizar seus layouts sem nenhum tipo de cadastro. O login só é necessário se você quiser enviar mensagens no chat da Twitch ou da Kick.",
    "cta.title": "Pronto para assistir sem a bagunça do navegador?",
    "cta.subtitle": "Gratuito, leve e de código aberto. Disponível para Windows, macOS e Linux.",
    "cta.download": "Baixar Multistream",
    "cta.github": "Ver no GitHub",
    "footer.credits":
      'Multistream é um projeto de código aberto desenvolvido por Ilan Fonseca aka <a href="https://github.com/ilanzgx" target="_blank" rel="noopener noreferrer" class="hover:text-[#111111] dark:hover:text-white transition-colors underline underline-offset-4 font-medium">ilanzgx</a>.',
    "footer.disclaimer":
      "Multistream é um projeto de código aberto independente, sem afiliação com Twitch, Kick, YouTube ou Amazon. Todas as marcas registradas pertencem aos seus respectivos donos.",
  },
} as const;
