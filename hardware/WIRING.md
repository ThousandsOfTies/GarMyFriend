# Orange Pi Zero 2Wへの配線

**下記の番号は40ピンヘッダーの物理ピン番号です。** GPIO line offset、wiringOP番号、Raspberry PiのBCM番号とは異なります。
基板の1番ピンの表示を確認してから数えてください。電源を外した状態で配線します。

配線の正本は [`connections.csv`](connections.csv)、型番は [`components.csv`](components.csv) です。この文書はその説明用の表です。

## 部品の記録

- ロータリー: **[KY-040](modules/KY-040.md)**、端子 CLK / DT / SW / ＋ / GND。
- 液晶: **[丸型SPI液晶・7ピン・型番不明](modules/round-lcd-7pin.md)**、端子 RST / CS / DC / SDA / SCL / GND / VCC。GC9A01を想定。

電源・信号は3.3Vを使用し、実機の顔表示とノブ入力を確認済みです。KY-040の＋は3.3Vへ接続します。
液晶の型番とコントローラーIDは未同定ですが、GC9A01初期化で表示できることを確認しています。

## 液晶

| 液晶の端子 | 物理ピン | Orange Pi信号 |
| --- | --- | --- |
| RST | **22** | PI6 |
| CS | **24** | PH5 / SPI1_CS0 |
| DC | **18** | PH4 |
| SDA | **19** | PH7 / SPI1_MOSI |
| SCL | **23** | PH6 / SPI1_CLK |
| GND | **14** | GND |
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

## 実機での確認

この表と `connections.csv` は動作確認した物理配線です。VMの `hardware/gpio.csv` / `spi.csv` は実機の値で上書きしません。
2026-10-29に実機のpinctrlとGPIO情報を読み取り、PI6・PH4・PI0・PI15・PI16のchip/lineを照合しました。
`orangepi-zero2w/gpio.csv` と `spi.csv` に実機用の設定を置き、専用サービスから読みます。VM用サービスは実機へインストールしません。
液晶のリセットとGC9A01初期化を実装し、ノブの左右回転・押下と液晶の顔表示を確認しました。
物理6番GNDの緩み・はんだ不足に対してGNDを物理14番へ移し、液晶端子で3.3Vを確認しました。
その後、High固定時にLCD側SCLだけ0Vと分かり、ユーザーが挿し間違いを修正すると顔が表示されました。1MHzでの表示確認を経て通常設定の16MHzへ戻しました。

信号ピンはすべて重複のない割り当てです。物理3/5のI²C1と8/10のUART0は今回使いません。

参照: [Orange Pi公式wiringOP](https://github.com/orangepi-xunlong/wiringOP/blob/a7921ca2f5c124203be10d3418db70a2e15f3c10/wiringPi/wiringPi.c#L1873)、[Joy-IT KY-040](https://sensorkit.joy-it.net/en/sensors/ky-040)。
