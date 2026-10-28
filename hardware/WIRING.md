# Orange Pi Zero 2Wへの配線計画

**下記の番号は40ピンヘッダーの物理ピン番号です。** GPIO line offset、wiringOP番号、Raspberry PiのBCM番号とは異なります。
基板の1番ピンの表示を確認してから数えてください。電源を外した状態で配線します。

配線の正本は [`connections.csv`](connections.csv)、型番は [`components.csv`](components.csv) です。この文書はその説明用の表です。

## 部品の記録

- ロータリー: **[KY-040](modules/KY-040.md)**、端子 CLK / DT / SW / ＋ / GND。
- 液晶: **[丸型SPI液晶・7ピン・型番不明](modules/round-lcd-7pin.md)**、端子 RST / CS / DC / SDA / SCL / GND / VCC。GC9A01を想定。

電源・信号は3.3Vを使用する計画です。KY-040の＋を5Vへ接続しません。
液晶の電源仕様・コントローラーは未確認で、3.3Vでの動作を確認してから実機設定を確定します。

## 液晶

| 液晶の端子 | 物理ピン | Orange Pi信号 |
| --- | --- | --- |
| RST | **22** | PI6 |
| CS | **24** | PH5 / SPI1_CS0 |
| DC | **18** | PH4 |
| SDA | **19** | PH7 / SPI1_MOSI |
| SCL | **23** | PH6 / SPI1_CLK |
| GND | **6** | GND |
| VCC | **1** | 3.3V |

液晶のSDAはSPIのデータ入力です。I²C端子には接続しません。
BL端子は今回のモジュールに申告されていないため、追加配線を作りません。

## KY-040

| KY-040の端子 | 物理ピン | Orange Pi信号 |
| --- | --- | --- |
| CLK | **29** | PI0 |
| DT | **31** | PI15 |
| SW | **37** | PI16 |
| ＋ | **17** | 3.3V |
| GND | **20** | GND |

CLK・DT・SWをプルアップ入力として使います。内蔵抵抗の有無は実機で確認し、必要なら内部または外付けのプルアップを追加します。
電源とGNDは同じOrange Piのものを使い、両モジュールのGNDを共通にします。

## ソフトウェアへ反映する前に

この表は採用する物理配線の計画です。VMの `hardware/gpio.csv` / `spi.csv` を実機の値で上書きしません。
2026-10-29に実機のpinctrlとGPIO情報を読み取り、PI6・PH4・PI0・PI15・PI16のchip/lineを照合しました。
`orangepi-zero2w/gpio.csv` と `spi.csv` に実機用の設定を置き、専用サービスから読みます。VM用サービスは実機へインストールしません。
液晶のリセットとGC9A01初期化を実装済みです。SPI出力とノブの実入力を確認しましたが、液晶はまだ未表示で電源・配線・モジュール仕様を切り分け中です。
ユーザーが液晶の電源測定時にGNDピンの緩み・はんだ不足を発見しました。電源を外して修正予定で、修正後の表示確認は次回行います。

信号ピンはすべて重複のない割り当てです。物理3/5のI²C1と8/10のUART0は今回使いません。

参照: [Orange Pi公式wiringOP](https://github.com/orangepi-xunlong/wiringOP/blob/a7921ca2f5c124203be10d3418db70a2e15f3c10/wiringPi/wiringPi.c#L1873)、[Joy-IT KY-040](https://sensorkit.joy-it.net/en/sensors/ky-040)。
