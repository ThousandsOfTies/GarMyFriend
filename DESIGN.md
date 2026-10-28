# 顔アプリと部品代替の境界

## 構成

対象はOrange Pi Zero 2W、ARM64、1GBとGC9A01 240×240 RGB565。実機はArmbian起動・USBログインまで確認済みです。VMはUbuntu 24.04 x86_64、1GB・1vCPUでLinuxの入出力契約を検証し、ARM CPUの性能や電気特性は再現しません。

実行アプリは `application/face.cjs`。`face-runtime.cjs` が8表情の循環と450msの補間、まばたきを処理し、共有のGPIO読取プログラムから回転・押下を受けます。`display-output.cjs` は描画値をC++出力プロセスへ送り、`device-output.cpp` がFaceCoreでRGB565を描いてSPIへ書きます。I²C・サーボ・模擬センサー・シナリオ・記録再生は含めません。

WebPanelのプロセスは `simulation/server.cjs`。アプリを起動せず、表情名や顔の座標、切り替えの判断を持ちません。`device-bridge.cjs` は共有Bridgeへノブ操作を中継し、GC9A01ドライバが送った画素と物理ノブの累積回転だけを取得します。

```text
パネルのノブ → GPIO波形 → /dev/gpiochip0 → アプリ
パネルの液晶 ← SPI画素 ← /dev/spidev0.0 ← アプリ
```

共有BridgeのGPIO波形生成とDCS/RGB565解釈は、物理部品を代替するための処理です。表情の選択やロボット固有の振る舞いは含めません。WebPanelには共有の `display.mjs` と `rotary.mjs` を配置し、部品の内部DOMは参照しません。

## 独立性

顔アプリにHTTP、WebPanel、GAR Bridgeの依存はありません。実機では本物のデバイスドライバへ入出力します。VMでは同じ/dev操作をgpio-simとCUSEが受け、Bridgeが部品の信号と画素をブラウザーへ接続します。

WebPanelを終了しても、アプリの表情・描画処理は継続します。逆にアプリを止めると、パネルのノブは物理的な入力信号を生成できますが、Bridgeだけで表情を変えることはできません。液晶は実物と同じく最後に受け取った画素を保持します。

## 仮想配線と実機の確認

VMは `/dev/gpiochip0` のDC=16、A=20、B=21、SW=22と `/dev/spidev0.0` を使います。これらは仮想ライン番号で、Orange Piの物理端子番号ではありません。

2026-10-28に実機のノブをKY-040、液晶の端子をRST/CS/DC/SDA/SCL/GND/VCCと確認しました。液晶の製品型番・電源回路・コントローラーの同定は未完了です。採用する物理ピンの計画と確認状態は `hardware/WIRING.md` と `hardware/connections.csv` に保存します。実機のchip/lineはArmbian上で確認してから設定します。

実機ではGC9A01モジュールの型番、初期化シーケンス、SPIバス、DC信号、ロータリーの端子・プルアップを確認します。単色・静止画で向きと色順序を確認してから、同じ顔アプリを動かします。仮のSPI 24MHzは実機で確認した速度ではありません。

GC9A01モデルはCASET/PASET/RAMWRを中心とするRGB565サブセットです。ガンマ・電気的タイミング・全方向設定を再現するモデルではありません。
