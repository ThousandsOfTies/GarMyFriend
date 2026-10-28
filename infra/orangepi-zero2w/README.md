# Orange Pi Zero 2Wへの導入

対象は手持ちのH618・1GB、Armbian/Debian 13、Linux 6.18.57 ARM64です。
VM用のCUSE・gpio-sim・Bridge・WebPanelは実機へ導入しません。

## 配置と起動

| 場所 | 内容 |
| --- | --- |
| `/opt/garmyfriend/app` | 現在のリリースへのリンク。アプリ・CSV・ARM64バイナリを含む |
| `/opt/garmyfriend/releases/` | リリースごとの配置先 |
| `/opt/garmyfriend/node` | 公式Node.js 24.22.1 ARM64へのリンク |
| `/etc/systemd/system/garmyfriend.service` | 起動時に実行するサービス |
| `/etc/udev/rules.d/70-garmyfriend.rules` | 実機GPIO/SPIを専用ユーザーへ許可 |
| `/boot/overlay-user/garmyfriend-spi1.dtbo` | ヘッダーのSPI1・CS0を有効化 |
| `/boot/armbianEnv.txt.garmyfriend.bak` | 導入前の起動設定 |

アプリは非rootの `garmyfriend` ユーザーで動作します。
CSVは `GAR_HARDWARE_DIR=/opt/garmyfriend/app/hardware/orangepi-zero2w` で選択します。
起動前にGPIOのコントローラー名とSPIの接続先を読み取り、別のデバイスなら停止します。

```sh
systemctl status garmyfriend
journalctl -u garmyfriend -n 30
sudo systemctl restart garmyfriend
sudo systemctl stop garmyfriend
```

ログの `Rotary GPIO ready` は入力待機、`Rotary rotate` / `Rotary press` は実際のノブ入力です。
`LCD frames=N` はSPIへ書き終えたフレーム数です。SPIに応答線がないため、液晶での表示成功やVCC電圧はこのログからは確認できません。

## 再ビルド・再導入

VirtualBox開発VMには `gcc-aarch64-linux-gnu` / `g++-aarch64-linux-gnu` を導入済みです。

```sh
sh infra/orangepi-zero2w/build.sh
```

`build/arm64/device-output` と `gar_rotary_input` をリリースの `build/` に置きます。
アプリの `application/`、`firmware/`、`shared/`、`hardware/`、`infra/orangepi-zero2w/` と、使用する共有ソースも一緒に転送します。
アーカイブに含めていない親フォルダーが0700になることがあるため、展開時は `umask 022` を使います。インストーラーもアプリ内のディレクトリーの読み取り権限を整えます。

実機上でビルドする場合はコンパイラーを用意し、`CC=gcc CXX=g++ sh infra/orangepi-zero2w/build.sh` を使います。
現在の実機はネットを設定せず、PCからUSBシリアルでチェックサム付きのファイル転送を行いました。

実機の管理者権限で、公式Nodeアーカイブの導入とアプリの設定を行います。

```sh
sh /opt/garmyfriend/app/infra/orangepi-zero2w/install-node.sh /path/to/node-v24.22.1-linux-arm64.tar.xz
sh /opt/garmyfriend/app/infra/orangepi-zero2w/install.sh
```

Nodeは [公式配布](https://nodejs.org/dist/v24.22.1/) のSHA256と照合してから導入します。
SPI overlayは実機のdevice treeへ試験適用して参照を検証し、起動設定をバックアップしてから追加します。初回は再起動が必要です。

GPIO/SPIの割り当ては [実機用CSV](../../hardware/orangepi-zero2w/) を編集します。
液晶は型番不明の7ピンで、GC9A01を想定した初期化です。未表示の場合は電源・配線・モジュール仕様の確認が必要です。
今回の実機はGNDピンのはんだ不足が見つかり、修正後の表示確認を次回へ持ち越しています。ノブの左右回転・押下とSPI書き込み完了は確認済みです。
