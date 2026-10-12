#!/usr/bin/env bash
# Pre-seeds the linuxdeploy GTK plugin that the Tauri bundler only downloads when missing from its cache (issue #47).
set -euo pipefail

PLUGIN_COMMIT="dda522bce37387f1b853d9095713bfaa924c8423"
PLUGIN_URL="https://raw.githubusercontent.com/tauri-apps/linuxdeploy-plugin-gtk/${PLUGIN_COMMIT}/linuxdeploy-plugin-gtk.sh"
PLUGIN="${XDG_CACHE_HOME:-$HOME/.cache}/tauri/linuxdeploy-plugin-gtk.sh"

mkdir -p "$(dirname "$PLUGIN")"
curl -fsSL "$PLUGIN_URL" -o "$PLUGIN"

grep -q '^export GDK_BACKEND=x11' "$PLUGIN"
sed -i 's|^export GDK_BACKEND=x11|export GDK_BACKEND="${GDK_BACKEND:-x11}"|' "$PLUGIN"

cat >> "$PLUGIN" <<'EOF'

# Prevent WebKitGTK/Skia colrv1_configure_skpaint vector assertion crash on Fedora 44+ (Noto-COLRv1.ttf).
mkdir -p "$APPDIR/etc/fonts"
cat > "$APPDIR/etc/fonts/fonts.conf" <<'FONTEOF'
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>
  <selectfont>
    <rejectfont>
      <glob>/usr/share/fonts/*emoji*/*</glob>
      <glob>*COLRv1*</glob>
    </rejectfont>
  </selectfont>
</fontconfig>
FONTEOF

sed -i 's|^export GDK_PIXBUF_MODULE_FILE=|#export GDK_PIXBUF_MODULE_FILE=|' "$HOOKFILE"
cat >> "$HOOKFILE" <<'HOOKEOF'
export FONTCONFIG_FILE="${FONTCONFIG_FILE:-$APPDIR/etc/fonts/fonts.conf}"
if [ ! -e /etc/ssl/certs/ca-certificates.crt ] && [ -e /etc/pki/tls/certs/ca-bundle.crt ]; then
    export SSL_CERT_FILE="${SSL_CERT_FILE:-/etc/pki/tls/certs/ca-bundle.crt}"
    export GTLS_SYSTEM_CA_FILE="${GTLS_SYSTEM_CA_FILE:-/etc/pki/tls/certs/ca-bundle.crt}"
fi
HOOKEOF

# Bundled libwayland/libgnutls/libhogweed/libnettle/libp11-kit/libssh must come from the host OS to avoid Mesa/EGL and TLS trust store conflicts.
echo "Removing conflicting bundled system libraries"
find "$APPDIR"/usr/lib* \( -type f -o -type l \) \
    \( -name 'libwayland-client.so*' -o -name 'libwayland-cursor.so*' -o -name 'libwayland-egl.so*' -o -name 'libwayland-server.so*' \
       -o -name 'libgnutls.so*' -o -name 'libhogweed.so*' -o -name 'libnettle.so*' -o -name 'libp11-kit.so*' -o -name 'libssh.so*' \) \
    -print -delete

# The uim IM module aborts gtk_init when uim is not installed on the host.
echo "Removing uim IM module"
find "$APPDIR" \( -type f -o -type l \) -name 'im-uim.so' -print -delete
find "$APPDIR" -type f -name 'immodules.cache' -exec sed -i '/im-uim\.so"/,/^$/d' '{}' \;
EOF

chmod +x "$PLUGIN"
echo "Patched $PLUGIN"

# Because bundleMediaFramework=true runs linuxdeploy-plugin-gstreamer.sh AFTER linuxdeploy-plugin-gtk.sh,
# its internal `"$LINUXDEPLOY" --appdir "$APPDIR"` call copies excluded libraries back into usr/lib.
GST_COMMIT="2a2e67491c32995a3f279ad0ecbe77abd512b42a"
GST_URL="https://raw.githubusercontent.com/tauri-apps/linuxdeploy-plugin-gstreamer/${GST_COMMIT}/linuxdeploy-plugin-gstreamer.sh"
GST_PLUGIN="${XDG_CACHE_HOME:-$HOME/.cache}/tauri/linuxdeploy-plugin-gstreamer.sh"

curl -fsSL "$GST_URL" -o "$GST_PLUGIN"

cat >> "$GST_PLUGIN" <<'EOF'

echo "Removing conflicting bundled libraries (re-added by GStreamer linuxdeploy pass)"
find "$APPDIR"/usr/lib* \( -type f -o -type l \) \
    \( -name 'libwayland-client.so*' -o -name 'libwayland-cursor.so*' -o -name 'libwayland-egl.so*' -o -name 'libwayland-server.so*' \
       -o -name 'libgnutls.so*' -o -name 'libhogweed.so*' -o -name 'libnettle.so*' -o -name 'libp11-kit.so*' -o -name 'libssh.so*' \) \
    -print -delete
EOF

chmod +x "$GST_PLUGIN"
echo "Patched $GST_PLUGIN"
