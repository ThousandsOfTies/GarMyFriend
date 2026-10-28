# 液晶とノブのシミュレーション

## 起動と操作

```powershell
npm run vm:start
npm run vm:open
```

WebPanelには円形液晶とロータリーだけを表示します。＋／−、ノブを選択して矢印キー・ホイールで回転できます。表情を変える処理はアプリが行います。押下はアプリのまばたきへ割り当てています。COUNTERはノブの累積回転です。

アドレスは `.gar/vm/panel.json`。再起動後は `npm run vm:publish` でHTTPS URLを発行し直します。変更の反映は `npm run vm:deploy`、状態は `npm run vm:status`、終了は `npm run vm:stop` です。

## 部品の接続口

- `GET /api/state`：ドライバの接続状態とロータリーのカウンター。
- `GET /api/io/frame`：ドライバが受け取った240×240 RGB565 big-endian画素。
- `POST /api/rotary`：`{"action":"rotate","direction":1}`、逆方向は-1、押下は `{"action":"press"}`。
- `GET /health`：パネルと部品の接続状態。

表情の直接変更、シナリオ、記録再生のAPIは公開しません。BridgeとWebPanelは表情名を知りません。

## VM内のサービス

| サービス | 役割 |
| --- | --- |
| `garmyfriend-devices` | gpio-sim、GC9A01 CUSE、汎用GAR Bridge |
| `garmyfriend` | 独立した顔アプリ。GPIO入力とSPI描画 |
| `garmyfriend-panel` | 液晶とノブのWebPanel、部品の入出力中継 |
| `garmyfriend-tunnel` | パネルの開発用HTTPS公開 |

```bash
systemctl status garmyfriend garmyfriend-panel garmyfriend-devices
journalctl -u garmyfriend -u garmyfriend-panel -u garmyfriend-devices -n 60
ls -l /dev/spidev0.0 /dev/gpiochip0
```

WindowsからのSSH接続:

```powershell
ssh -i .gar/vm/id_ed25519 -p 2231 -o IdentitiesOnly=yes -o UserKnownHostsFile=.gar/vm/known_hosts gar@127.0.0.1
```

## 再構築

Windows、VirtualBox 7、Python 3.11以上、OpenSSHを使用します。ブラウザーテストにNode.js 18以上とMicrosoft Edgeを使います。クローン後に `git submodule update --init --recursive` と `npm ci` を実行します。

Ubuntu 24.04 amd64 cloud imageのVMDKと配布元のSHA-256を確認し、専用VMを作ります。

```powershell
python -m pip install pycdlib
python infra/virtualbox/create.py --base-image C:/images/noble.vmdk --sha256 VERIFIED_SHA256
```

初回cloud-initのパッケージ導入完了後:

```powershell
npm run vm:deploy
npm run vm:publish
npm run vm:open
```

VMは1GB・1vCPU・16GBディスクです。鍵・VMディスク・URLは `.gar/vm/` に保存し、Gitに含めません。元イメージはコピーして利用します。

## 検証

`npm test` は表情アプリの動作、Bridgeが表情を判断しないこと、画面の2部品・キーボード操作・320/760/1440pxの表示を確認します。`npm run test:vm` は公開HTTPS経由のGPIO回転と、実際のSPI画素とブラウザーの全画素一致を確認します。

VM内で `python3 -B tests/vm-parts.py` を実行すると、アプリを一時停止してもノブは入力できるが画素は変わらないこと、WebPanelを停止してもアプリがGPIOを読みSPIへ書くことを確認します。試験後に必ずアプリとWebPanelを復旧します。
