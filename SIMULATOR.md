# 開発環境の操作と再構築

## 構築済みVMを使う

```powershell
npm run vm:start
npm run vm:status
npm run vm:open
```

HTTPSアドレスは `.gar/vm/panel.json` に保存されます。VMを再起動したときは `npm run vm:publish` でURLを発行し直してから開きます。ソース変更後は `npm run vm:deploy` で再ビルドします。終了は `npm run vm:stop` です。

アプリ・ドライバ・Bridge・HTTPSトンネルはVM内で動きます。Windows上の待受けはSSH転送の `127.0.0.1:2231` のみ。専用SSH鍵・VMディスク・URL状態は `.gar/vm/` に保存し、Gitには含めません。

## 画面の操作

「ノブで表情を変える」の＋で次、−で前の表情へ進みます。最後と先頭は循環します。ノブにフォーカスして矢印キーかホイールでも操作できます。ノブ本体または「まばたき」を押すと1回まばたきします。COUNTERは回転の累積値で、現在の顔は「選択中」に表示します。

VMではGPIOのA/B波形をアプリが読み取ってから表情を変えます。GPIO読取プログラムはLinux GPIO v2を利用し、実機にも持ち込める構成です。`hardware/gpio.csv` の20・21・22はVMのライン番号なので、実機のピンへそのまま接続する番号ではありません。

表情、まばたき、視線、口パクを変更できます。仮の6関節は角度を操作し、PCA9685とサーボの部品表示で出力を確認します。表示される部品は仮選定です。

| シナリオ | 動作 |
| --- | --- |
| greeting | あいさつ、口パク、関節の動き |
| curious | 近距離への反応と視線 |
| low-battery | 模擬電圧低下への反応 |
| balance | 傾き増加による停止 |

停止後は「初期状態へ」で解除します。一時停止は時間だけを止め、「100ms進める」で段階的に確認できます。記録開始から終了までの操作をJSONへ保存し、読み込むと同じ初期状態と時刻付き操作を再生します。動画記録ではありません。

## コマンドとAPI

CLIも、保存されたHTTPS URLへ接続します。

```powershell
npm run sim:command -- expression happy
npm run sim:command -- joint leftHip 20
npm run sim:command -- sensor pitch 35
npm run sim:command -- reset
```

`--url https://...` で接続先を指定できます。APIは `GET /health`、`GET /api/state`、`GET /api/scenarios`、`GET /api/recording`、`GET /api/io/frame`、`POST /api/command`。画素はRGB565 big-endianの115,200 bytesです。コマンド例は `{"type":"expression","value":"happy"}`、`{"type":"joint","id":"leftHip","angle":20}`。Content-Typeはapplication/jsonです。

ロータリー入力は `{"type":"rotary","action":"rotate","direction":1}`（逆方向は-1）と `{"type":"rotary","action":"press"}`。VMではこれらをGPIOの模擬入力へ渡します。`GET /api/state` の `inputs.rotary` に読取状態、累積回転、エラーを返します。

## 新しいPCでVMを作る

Windows、Python 3.11以上、OpenSSH、VirtualBox 7、Node.js 18以上を使います。ブラウザーテストはMicrosoft EdgeとPlaywrightです。クローン後に `git submodule update --init --recursive` と `npm ci` を実行します。

Ubuntu 24.04 amd64 cloud imageのVMDKを用意し、その配布元のSHA-256を確認します。構築時の入力は `noble.vmdk`、SHA-256 `fb3ba097a9013d759fa13ab22d2b4118bd55452c617ca3758a55303eea96de6e` でした。将来の同名ファイルは内容が変わり得るため、取得した版のハッシュを指定します。

```powershell
python -m pip install pycdlib
python infra/virtualbox/create.py --base-image C:/images/noble.vmdk --sha256 VERIFIED_SHA256
```

元イメージをコピーして専用ディスクを作ります。既存の同名VMがある場合は上書きしません。VMは1GB・1vCPU・16GBディスクで、cloud-initがNode・コンパイラー・FUSE開発用ライブラリー・aiohttp・カーネル追加モジュールを導入します。初回はVM内 `cloud-init status --wait` の完了後に進みます。

```powershell
npm run vm:deploy
npm run vm:publish
npm run vm:open
```

`vm:deploy` はソースを転送し、GC9A01とI²CのCUSEドライバとC++出力アプリをビルドします。`gpio-sim` からGPIOチップを作り、専用systemdサービスで起動します。`vm:publish` はハッシュを固定したcloudflaredを使い、HTTPSからVMの/dev出力が正常であることまで確認します。

## 障害の確認

`npm run vm:status` でVM・3サービス・healthを確認します。SSHで調べる場合は、このプロジェクトの専用鍵とknown_hostsを指定してください。

```powershell
ssh -i .gar/vm/id_ed25519 -p 2231 -o IdentitiesOnly=yes -o UserKnownHostsFile=.gar/vm/known_hosts gar@127.0.0.1
```

VM内の確認:

```bash
systemctl status garmyfriend garmyfriend-devices garmyfriend-tunnel
journalctl -u garmyfriend -u garmyfriend-devices -n 60
ls -l /dev/spidev0.0 /dev/i2c-1 /dev/gpiochip0
curl -fsS http://127.0.0.1:8773/health
```

ドライバ停止時はWebPanelの出力状態がエラーになります。古い画面が残っても、新しい描画として扱いません。`vm:deploy` で再ビルド・サービス再起動できます。公開URLだけ切れた場合は `vm:publish` を使います。

## 自動検証と軽量プレビュー

```powershell
npm test
npm run test:vm
```

通常の `npm test` はロジックとブラウザー接続の試験です。`test:vm` はHTTPSからLinuxの実デバイスノードを通し、顔のフレームが画面の全ピクセルと一致すること、PWM変更・fullOff停止・復帰を検証します。

VMなしでUIだけ確認する場合は `npm run dev:open`。これはWindowsのロジック試験で、/dev出力は行いません。終了は `npm run dev:stop`。実機互換性の検証にはVMを使います。

共有SBC部品の独立テストはgar-toolsの `web-simulator/tests/board-browser/`、Bridgeのテストは `targets/linux-device/runtime/web-bridge/tests/` にあります。

VM内で `python3 -B tests/vm-devices.py` を実行すると、このアプリの出力プロセスだけを短時間止め、キャラクターデバイスの存在、応答停止の検出、古いフレームの503応答、再開後の復旧を確認できます。

`python3 -B tests/vm-rotary.py` はGPIO読取だけを短時間止め、APIの指示だけでは表情が変わらず、GPIOイベントを再開して初めて反映することを確認します。他の操作と同時に実行しないでください。`test:vm` は公開HTTPSからノブ操作・逆回転・循環・押下と液晶画素までを確認します。

2026-10-28に、ロジック15件、顔プレビューと画面操作、HTTPS経由の/dev出力、出力停止と復旧、共有Bridge 27件、SBC部品2台の独立動作、GPIO経由のノブ操作と読取停止試験を確認しました。GC9A01・従来ILI9341のCUSEとGPIO入力のネイティブ・ARM64ビルド、回転デコーダーのノイズ除去テストも成功しています。
