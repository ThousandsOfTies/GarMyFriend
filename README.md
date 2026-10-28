# GarMyFriend

Orange Pi Zero 2W（Allwinner H618・ARM64・RAM 1GB）とGC9A01円形液晶を使うロボットの開発環境です。アプリをVirtualBoxのLinux VMで動かし、HTTPSのWebPanelから操作します。

```text
ブラウザー / CLI → HTTPS → VM内のアプリ
                             ↓ C++描画・PWM制御
                  /dev/spidev0.0  /dev/i2c-1  /dev/gpiochip0
                             ↓ CUSE / gpio-sim
                       GAR仮想デバイス → Bridge → WebPanel
```

顔の画素とサーボのPWM表示は、実際に仮想デバイスが受け取った出力から生成します。顔をブラウザーで描き直す方式は、開発用のロジック試験に限ります。

## 開く

このPCではVMを構築済みです。プロジェクトのフォルダーで実行します。

```powershell
npm run vm:start
npm run vm:open
```

HTTPS URLは `.gar/vm/panel.json` に保存されます。トンネルを停止した後やVM再起動後は `npm run vm:publish` で公開し直します。Cloudflare Quick Tunnelを使う開発用URLで、再発行すると変わります。URLを知っている人は模擬ロボットを操作できます。実機接続や秘密情報を扱う常設環境にする場合は、認証付きの公開方法へ切り替えます。

```powershell
npm run vm:status   # VM・アプリ・仮想デバイスの状態
npm run vm:deploy   # 変更したソースを転送して再ビルド
npm run vm:publish # HTTPS URLを発行・接続確認
npm run vm:stop    # 専用VMを正常終了
```

8表情、まばたき、視線、口パク、仮の6関節、模擬センサー、4シナリオ、操作の記録・保存・再生を試せます。関節・PCA9685・SG90は仮構成で、採用部品や歩行能力の確定ではありません。

## リポジトリの分担

- `application/`：C++の描画とLinuxデバイスへの出力。
- `simulation/`：時間・表情・関節・シナリオ・操作記録とWeb API。
- `simulator/`：Product固有のWebPanelと部品の接続処理。
- `hardware/`：VM内の仮想SPI・I²C・GPIO割り当て。
- `infra/virtualbox/`、`tools/vm.py`：専用VM、デバイス、公開、配布の手順。
- `sources/gar-tools/`：共通部品とドライバを使うGit submodule。
- `shared/expressions.json`、`firmware/FaceCore.h`：顔の形と描画コア。
- `preview/`：従来の顔だけの試作。直接開けます。

共通のSBC表示部品、GC9A01用CUSEドライバ、Bridge対応はgar-tools側へ保存します。クローン時はsubmoduleも取得してください。

```powershell
git clone --recurse-submodules https://github.com/ThousandsOfTies/GarMyFriend.git
```

## 検証

WindowsにNode.js 18以上とMicrosoft Edge、VM操作にPython 3.11以上、OpenSSH、VirtualBox 7を使います。

```powershell
npm ci
npm test           # ロジック・従来プレビュー・開発用画面
npm run test:vm    # 公開HTTPSから実際の/dev経路を通す検証
```

`test:vm` は模擬ロボットの状態を初期化し、顔の画素一致、PWM変更、停止、復帰を確認します。実機には接続しません。

[操作・再構築手順](SIMULATOR.md) / [設計と実機へ進む条件](DESIGN.md)

VMはUbuntu 24.04、x86_64、RAM 1GB、1 vCPUです。Orange PiのARM CPU速度・電気特性・歩行物理は再現しません。実機はArmbian起動とUSBログインまで確認済みで、液晶とモーターの接続は未確認です。
