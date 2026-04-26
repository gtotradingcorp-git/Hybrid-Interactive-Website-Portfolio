{pkgs}: {
  deps = [
    pkgs.libgbm
    pkgs.systemd
    pkgs.expat
    pkgs.gtk3
    pkgs.cairo
    pkgs.pango
    pkgs.cups
    pkgs.atk
    pkgs.alsa-lib
    pkgs.libxkbcommon
    pkgs.mesa
    pkgs.xorg.libxcb
    pkgs.xorg.libXrandr
    pkgs.xorg.libXfixes
    pkgs.xorg.libXext
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.xorg.libX11
    pkgs.dbus
    pkgs.at-spi2-core
    pkgs.at-spi2-atk
    pkgs.nspr
    pkgs.nss
    pkgs.glib
  ];
}
